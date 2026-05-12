import {AnalyzerDomainResult, AnalyzerOutput, AnalyzerPageResult} from "./Analyzer";

export interface ScanEntry {
    id: string;
    url: string;
    crawled: boolean;
    analyzed: boolean;
}

/** Persisted form — what storage holds. Indexed by entryId for sparse updates. */
export interface ScanState {
    domain: string;
    baseURL: string;
    updatedAt?: string;
    entries: ScanEntry[];
    analyzerResults: Record<string, Record<string, AnalyzerPageResult>>;
    domainResults: Record<string, AnalyzerDomainResult>;
}

/** Assembled form — what consumers render from. Flat per-analyzer arrays. */
export interface Scan {
    domain: string;
    baseURL: string;
    updatedAt?: string;
    entries: ScanEntry[];
    analyzers: AnalyzerOutput[];
}

export function assembleScan(state: ScanState): Scan {
    const types = new Set([
        ...Object.keys(state.analyzerResults || {}),
        ...Object.keys(state.domainResults || {})
    ]);
    const analyzers: AnalyzerOutput[] = Array.from(types).map(type => ({
        type,
        pageResults: Object.values(state.analyzerResults?.[type] || {}),
        domainResult: state.domainResults?.[type]
    }));
    return {
        domain: state.domain,
        baseURL: state.baseURL,
        updatedAt: state.updatedAt,
        entries: state.entries,
        analyzers
    };
}

/** CouchDB document form: ScanState plus revision metadata. */
export type ScanDoc = ScanState & {
    _id?: string;
    _rev?: string;
    type?: "scan";
};

export interface ScanReaderOptions {
    /** Full CouchDB URL including credentials, e.g. http://user:pass@host:5984 */
    url?: string;
    user?: string;
    password?: string;
    host?: string;
    port?: string | number;
    database?: string;
}
