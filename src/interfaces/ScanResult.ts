import {TagValue, UnlabelledFrameSelector} from "axe-core";

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
                target: UnlabelledFrameSelector,
                html: string
            }>;
        }>
    }
}

export default ScanResult;
