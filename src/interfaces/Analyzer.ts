import {Browser, Page} from "playwright";
import type {Scan} from "./Scan";

export interface AnalyzerPageResult {
    url: string;
    findings: Record<string, unknown>;
}

export interface AnalyzerDomainResult {
    domain: string;
    findings: Record<string, unknown>;
}

export interface AnalyzerOutput {
    type: string;
    pageResults: AnalyzerPageResult[];
    domainResult?: AnalyzerDomainResult;
}

export interface AnalyzerSummary {
    keyFindings: string[];
    overview: string[];
}

export interface Analyzer {
    readonly name: string;
    readonly type: string;
    analyzePage?(page: Page, url: URL): Promise<AnalyzerPageResult>;
    analyzeDomain?(domain: string): Promise<AnalyzerDomainResult>;
    setBrowser?(browser: Browser): void;
    setOutputDir?(outputDir: string): void;
    /** Build the report sections for this analyzer from its outputs. */
    summarize?(output: AnalyzerOutput, scan: Scan): AnalyzerSummary;
    /** Render per-page findings as markdown. Falls back to JSON dump if absent. */
    renderMarkdown?(findings: Record<string, unknown>): string;
}
