import {Page} from "playwright";
import {Analyzer, AnalyzerOutput, AnalyzerPageResult, AnalyzerSummary} from "#/interfaces/Analyzer";
import {Scan} from "#/interfaces/Scan";
import {CoreWebVitals, PerformanceFindings} from "#/interfaces/Findings";
import {toScanUrl} from "#/utils/UrlHelper";

class PerformanceAnalyzer implements Analyzer {
    readonly name = "Performance";
    readonly type = "performance";
    private apiKey: string;
    private strategy: "mobile" | "desktop";

    constructor(apiKey: string = "", strategy: "mobile" | "desktop" = "mobile") {
        this.apiKey = apiKey;
        this.strategy = strategy;
    }

    public async analyzePage(_page: Page, url: URL): Promise<AnalyzerPageResult> {
        if (!this.apiKey) throw new Error("PAGESPEED_API_KEY required to run performance analysis.");
        const scanURL = toScanUrl(url);
        const findings = await this.fetchPageSpeedData(scanURL);

        return {
            url: url.toString(),
            findings: findings as unknown as Record<string, unknown>
        };
    }

    private async fetchPageSpeedData(url: string): Promise<PerformanceFindings> {
        try {
            const params = new URLSearchParams({
                url,
                key: this.apiKey,
                strategy: this.strategy,
                category: "performance"
            });

            const response = await fetch(
                `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
                {signal: AbortSignal.timeout(60000)}
            );

            const data = await response.json() as any;
            const lighthouseResult = data.lighthouseResult;
            const audits = lighthouseResult?.audits || {};

            const coreWebVitals: CoreWebVitals = {
                lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
                fid: audits["max-potential-fid"]?.numericValue ?? null,
                cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
                fcp: audits["first-contentful-paint"]?.numericValue ?? null,
                si: audits["speed-index"]?.numericValue ?? null,
                tbt: audits["total-blocking-time"]?.numericValue ?? null,
                tti: audits["interactive"]?.numericValue ?? null
            };

            return {
                score: lighthouseResult?.categories?.performance?.score != null
                    ? Math.round(lighthouseResult.categories.performance.score * 100)
                    : null,
                coreWebVitals,
                strategy: this.strategy,
                error: null
            };
        } catch (err: any) {
            return {
                score: null,
                coreWebVitals: {lcp: null, fid: null, cls: null, fcp: null, si: null, tbt: null, tti: null},
                strategy: this.strategy,
                error: err.message || "PageSpeed API request failed"
            };
        }
    }

    public summarize(output: AnalyzerOutput, _scan: Scan): AnalyzerSummary {
        const keyFindings: string[] = [];
        const overview: string[] = [];

        if (output.pageResults.length === 0) {
            return {keyFindings, overview};
        }

        const home = output.pageResults[0];
        const homeF = home.findings as any;
        if (homeF.error) {
            keyFindings.push(`PageSpeed: ${homeF.error}`);
        } else {
            const parts: string[] = [];
            if (homeF.score !== null) parts.push(`score ${homeF.score}/100`);
            const lcp = homeF.coreWebVitals?.lcp;
            if (lcp) {
                const lcpSec = (lcp / 1000).toFixed(1);
                let rating = "good";
                if (lcp / 1000 > 4.0) rating = "poor";
                else if (lcp / 1000 > 2.5) rating = "needs improvement";
                parts.push(`LCP ${lcpSec}s (${rating})`);
            }
            keyFindings.push(`PageSpeed: ${parts.join(", ")} (${homeF.strategy}).`);
        }

        const valid = output.pageResults.filter(pr => !(pr.findings as any).error);
        const errors = output.pageResults.filter(pr => (pr.findings as any).error);

        if (valid.length === 0) {
            if (errors.length > 0) {
                overview.push(`PageSpeed analysis failed: ${(errors[0].findings as any).error}`);
            } else {
                overview.push("Performance check not performed.");
            }
            return {keyFindings, overview};
        }

        const scores = valid.map(pr => (pr.findings as any).score).filter((s): s is number => s !== null);
        const lcps = valid.map(pr => (pr.findings as any).coreWebVitals?.lcp).filter((v): v is number => v !== null);
        const clss = valid.map(pr => (pr.findings as any).coreWebVitals?.cls).filter((v): v is number => v !== null && v !== undefined);
        const tbts = valid.map(pr => (pr.findings as any).coreWebVitals?.tbt).filter((v): v is number => v !== null);
        const strategy = (valid[0].findings as any).strategy || "mobile";

        const avg = (arr: number[]): number => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const worst = (arr: number[]): number => arr.length > 0 ? Math.max(...arr) : 0;
        const best = (arr: number[]): number => arr.length > 0 ? Math.min(...arr) : 0;

        overview.push(`${valid.length} pages analyzed via PageSpeed Insights (${strategy}).`);

        if (scores.length > 0) {
            const avgScore = Math.round(avg(scores));
            const poorPages = scores.filter(s => s < 50).length;
            const goodPages = scores.filter(s => s >= 90).length;
            overview.push(`Average PageSpeed score: ${avgScore}/100 (range: ${best(scores)}–${worst(scores)}).`);
            if (poorPages > 0) {
                overview.push(`${poorPages} of ${scores.length} pages scored below 50 (poor).`);
            }
            if (goodPages > 0 && goodPages === scores.length) {
                overview.push("All pages scored 90+ (good).");
            }
        }

        if (lcps.length > 0) {
            const avgLcp = avg(lcps) / 1000;
            const worstLcp = worst(lcps) / 1000;
            const slowPages = lcps.filter(l => l / 1000 > 4.0).length;
            overview.push(`Average Largest Contentful Paint: ${avgLcp.toFixed(1)}s (slowest: ${worstLcp.toFixed(1)}s).`);
            if (slowPages > 0) {
                overview.push(`${slowPages} pages have LCP above 4.0s — users may perceive these as slow to load.`);
            }
        }

        if (clss.length > 0) {
            const worstCls = worst(clss);
            if (worstCls > 0.25) {
                overview.push(`${clss.filter(c => c > 0.25).length} pages have significant layout shift (CLS > 0.25) — page elements move during load, which frustrates users.`);
            }
        }

        if (tbts.length > 0) {
            const worstTbt = worst(tbts);
            if (worstTbt > 600) {
                overview.push(`${tbts.filter(t => t > 600).length} pages have high blocking time (TBT > 600ms) — the page may feel unresponsive to interaction.`);
            }
        }

        if (errors.length > 0) {
            overview.push(`${errors.length} pages could not be analyzed by PageSpeed.`);
        }

        return {keyFindings, overview};
    }

    public renderMarkdown(findings: Record<string, unknown>): string {
        const f = findings as any;
        if (f.error) return `*Error: ${f.error}*`;

        const cwv = f.coreWebVitals || {};
        const lines: string[] = [];
        lines.push(`| Metric | Value |`);
        lines.push(`| --- | --- |`);
        lines.push(`| PageSpeed Score | ${f.score ?? "N/A"}/100 |`);
        lines.push(`| Strategy | ${f.strategy} |`);
        lines.push(`| LCP | ${cwv.lcp ? (cwv.lcp / 1000).toFixed(2) + "s" : "N/A"} |`);
        lines.push(`| FCP | ${cwv.fcp ? (cwv.fcp / 1000).toFixed(2) + "s" : "N/A"} |`);
        lines.push(`| CLS | ${cwv.cls !== null && cwv.cls !== undefined ? cwv.cls.toFixed(3) : "N/A"} |`);
        lines.push(`| TBT | ${cwv.tbt ? Math.round(cwv.tbt) + "ms" : "N/A"} |`);
        lines.push(`| Speed Index | ${cwv.si ? (cwv.si / 1000).toFixed(2) + "s" : "N/A"} |`);
        return lines.join("\n");
    }
}

export default PerformanceAnalyzer;
