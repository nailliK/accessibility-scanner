import {Analyzer} from "./Analyzer";

export interface ScanOptions {
    mode: string;
    analyzers: Analyzer[];
    full?: boolean;
}
