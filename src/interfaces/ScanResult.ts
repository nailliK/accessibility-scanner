import {TagValue} from "axe-core";

interface ScanResult {
    id: string,
    url: URL,
    complete: boolean,
    results?: {
        violations: Array<{
            name: string, // axe violation id
            description: string, // axe violation help
            tags: Array<TagValue>;
            nodes: Array<{
                target: Array<string>,
                html: string
            }>;
        }>
    }
}

export default ScanResult;
