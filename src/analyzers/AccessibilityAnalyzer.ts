import {Page} from "playwright";
import {AxeBuilder} from "@axe-core/playwright";
import {AxeResults} from "axe-core";
import {Analyzer, AnalyzerOutput, AnalyzerPageResult, AnalyzerSummary} from "#/interfaces/Analyzer";
import {Scan} from "#/interfaces/Scan";

function escHtml(str: string): string {
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

class AccessibilityAnalyzer implements Analyzer {
    readonly name = "Accessibility";
    readonly type = "accessibility";

    private axeTags: string[] = [
        "wcag2a",
        "wcag2aa",
        "wcag2aaa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
        "best-practice",
        "wcag***",
        "ACT",
        "section508",
        "TTv5",
    ];

    public async analyzePage(page: Page, url: URL): Promise<AnalyzerPageResult> {
        const scanResults: AxeResults = await new AxeBuilder({page})
            .withTags(this.axeTags)
            .analyze();

        const violations = scanResults.violations.map(v => ({
            name: v.id,
            description: v.help,
            impact: v.impact || "minor",
            tags: v.tags,
            nodes: v.nodes.map(n => ({
                target: n.target,
                html: n.html
            }))
        }));

        return {
            url: url.toString(),
            findings: {
                violations,
                violationCount: violations.length,
                nodeCount: violations.reduce((sum, v) => sum + v.nodes.length, 0)
            }
        };
    }

    public summarize(output: AnalyzerOutput, scan: Scan): AnalyzerSummary {
        const totalPages = scan.entries.length;

        const uniqueByRule = new Map<string, {
            impact: string;
            description: string;
            targets: Set<string>;
            pageCount: number;
        }>();
        for (const pr of output.pageResults) {
            const violations = (pr.findings as any).violations || [];
            for (const v of violations) {
                if (!uniqueByRule.has(v.name)) {
                    uniqueByRule.set(v.name, {
                        impact: v.impact || "minor",
                        description: v.description,
                        targets: new Set(),
                        pageCount: 0
                    });
                }
                const rule = uniqueByRule.get(v.name)!;
                rule.pageCount++;
                for (const n of v.nodes) {
                    rule.targets.add(String(n.target));
                }
            }
        }

        const pagesWithIssues = new Set(
            output.pageResults
                .filter(pr => ((pr.findings as any).violations?.length || 0) > 0)
                .map(pr => pr.url)
        ).size;

        const keyFindings: string[] = [];
        if (uniqueByRule.size > 0) {
            keyFindings.push(`${uniqueByRule.size} unique accessibility violations found across ${pagesWithIssues} of ${totalPages} pages.`);
        } else {
            keyFindings.push("No accessibility violations detected.");
        }

        const overview: string[] = [];
        if (uniqueByRule.size === 0) {
            overview.push("No accessibility violations found.");
            return {keyFindings, overview};
        }
        overview.push(`${uniqueByRule.size} unique accessibility rules violated across ${pagesWithIssues} of ${totalPages} pages.`);

        const impactOrder: Record<string, number> = {critical: 0, serious: 1, moderate: 2, minor: 3};
        const sorted = [...uniqueByRule.entries()].sort((a, b) =>
            (impactOrder[a[1].impact] ?? 4) - (impactOrder[b[1].impact] ?? 4)
        );
        for (const [name, rule] of sorted) {
            const scope = rule.pageCount === totalPages ? "every page"
                : rule.pageCount === 1 ? "1 page"
                : `${rule.pageCount} pages`;
            overview.push(`[${rule.impact}] "${escHtml(rule.description)}" (${name}) — ${rule.targets.size} element${rule.targets.size === 1 ? "" : "s"} on ${scope}.`);
        }

        return {keyFindings, overview};
    }

    public renderMarkdown(findings: Record<string, unknown>): string {
        const violations = (findings.violations as any[]) || [];
        if (violations.length === 0) return "";

        const lines: string[] = [];
        lines.push(`| Rule | Impact | Description | Affected Elements |`);
        lines.push(`| --- | --- | --- | --- |`);
        for (const v of violations) {
            const nodeCount = (v.nodes || []).length;
            lines.push(`| ${v.name} | ${v.impact || "—"} | ${escHtml(v.description)} | ${nodeCount} |`);
        }
        return lines.join("\n");
    }
}

export default AccessibilityAnalyzer;
