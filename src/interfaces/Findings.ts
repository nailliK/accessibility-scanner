export interface SslFindings {
    valid: boolean;
    issuer: string | null;
    subject: string | null;
    validFrom: string | null;
    validTo: string | null;
    daysUntilExpiry: number | null;
    protocol: string | null;
    error: string | null;
}

export interface HeadingIssue {
    type: "missing-h1" | "multiple-h1" | "skipped-level";
    detail: string;
}

export interface CoreWebVitals {
    lcp: number | null;
    fid: number | null;
    cls: number | null;
    fcp: number | null;
    si: number | null;
    tbt: number | null;
    tti: number | null;
}

export interface PerformanceFindings {
    score: number | null;
    coreWebVitals: CoreWebVitals;
    strategy: string;
    error: string | null;
}
