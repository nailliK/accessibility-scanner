import fs from "fs";
import path from "path";
import {mdToPdf} from "md-to-pdf";
import {Scan} from "#/interfaces/Scan";
import {Analyzer, AnalyzerOutput} from "#/interfaces/Analyzer";
import {ReportSummary} from "#/interfaces/Report";
import MessageLogger from "./MessageLogger";

class ReportGenerator {
    private outputDir: string;
    private analyzers: Map<string, Analyzer>;
    private messageLogger: MessageLogger = new MessageLogger();
    private cssPath: string | undefined;
    private full: boolean;

    constructor(outputDir: string, analyzers: Analyzer[], cssPath: string = "./src/css/base.css", full: boolean = false) {
        this.outputDir = outputDir;
        this.analyzers = new Map(analyzers.map(a => [a.type, a]));
        this.cssPath = cssPath;
        this.full = full;
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, {recursive: true});
        }
    }

    public async generate(result: Scan): Promise<void> {
        const summary = this.buildSummary(result);
        const markdown = this.buildMarkdown(summary, result);

        const mdPath = path.join(this.outputDir, "report.md");
        fs.writeFileSync(mdPath, markdown);
        this.messageLogger.logSuccess(`Markdown report: ${mdPath}`);

        const pdfPath = path.join(this.outputDir, "report.pdf");
        await this.generatePdf(markdown, pdfPath);
        this.messageLogger.logSuccess(`PDF report: ${pdfPath}`);
    }

    private buildSummary(result: Scan): ReportSummary {
        const keyFindings: string[] = [];
        const overview: string[] = [];

        for (const output of result.analyzers) {
            const analyzer = this.analyzers.get(output.type);
            if (!analyzer?.summarize) continue;
            const summary = analyzer.summarize(output, result);
            keyFindings.push(...summary.keyFindings);
            overview.push(...summary.overview);
        }

        return {
            domain: result.domain,
            pagesScanned: result.entries.length,
            timestamp: new Date().toISOString(),
            keyFindings,
            overview
        };
    }

    private buildMarkdown(summary: ReportSummary, result: Scan): string {
        const lines: string[] = [];

        lines.push(`# Site Analysis Report`);
        lines.push(``);
        lines.push(`**${summary.domain}** — ${summary.pagesScanned} pages scanned — ${summary.timestamp}`);
        lines.push(``);

        if (summary.keyFindings.length > 0) {
            lines.push(`## Key Findings`);
            lines.push(``);
            for (const f of summary.keyFindings) {
                lines.push(`- ${f}`);
            }
            lines.push(``);
        }

        if (summary.overview.length > 0) {
            lines.push(`## Overview`);
            lines.push(``);
            for (const f of summary.overview) {
                lines.push(`- ${f}`);
            }
            lines.push(``);
        }

        if (this.full) {
            for (const output of result.analyzers) {
                const analyzer = this.analyzers.get(output.type);
                lines.push(`## ${analyzer?.name ?? output.type}`);
                lines.push(``);

                if (output.domainResult) {
                    lines.push(`### Domain: ${output.domainResult.domain}`);
                    lines.push(``);
                    const entries = Object.entries(output.domainResult.findings)
                        .filter(([, v]) => v !== null);
                    if (entries.length > 0) {
                        lines.push(`| Property | Value |`);
                        lines.push(`| --- | --- |`);
                        for (const [k, v] of entries) {
                            lines.push(`| ${k} | ${String(v)} |`);
                        }
                        lines.push(``);
                    }
                }

                for (const pr of output.pageResults) {
                    const pageFindings = this.renderPageFindings(analyzer, pr);
                    if (pageFindings) {
                        lines.push(`### ${pr.url}`);
                        lines.push(``);
                        lines.push(pageFindings);
                        lines.push(``);
                    }
                }
            }
        }

        return lines.join("\n");
    }

    private renderPageFindings(analyzer: Analyzer | undefined, pr: AnalyzerOutput["pageResults"][number]): string {
        if (analyzer?.renderMarkdown) {
            return analyzer.renderMarkdown(pr.findings);
        }
        return "```json\n" + JSON.stringify(pr.findings, null, 2) + "\n```";
    }

    private resolveCss(filePath: string): string {
        const dir = path.dirname(filePath);
        const content = fs.readFileSync(filePath, "utf-8");
        return content.replace(/@import\s+["'](.+?)["'];/g, (_match, importPath) => {
            const resolved = path.join(dir, importPath);
            if (fs.existsSync(resolved)) {
                return fs.readFileSync(resolved, "utf-8");
            }
            return "";
        });
    }

    private async generatePdf(markdown: string, outputPath: string): Promise<void> {
        let css: string | undefined;
        if (this.cssPath && fs.existsSync(this.cssPath)) {
            css = this.resolveCss(this.cssPath);
        }

        const pdf = await mdToPdf(
            {content: markdown},
            {
                dest: outputPath,
                css,
                launch_options: {
                    timeout: 120000
                },
                pdf_options: {
                    timeout: 120000
                }
            }
        );

        if (!pdf?.content) {
            throw new Error("PDF generation failed");
        }
    }
}

export default ReportGenerator;
