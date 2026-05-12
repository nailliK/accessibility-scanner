import {Analyzer} from "#/interfaces/Analyzer";
import AccessibilityAnalyzer from "./AccessibilityAnalyzer";
import SeoAnalyzer from "./SeoAnalyzer";
import MobileAnalyzer from "./MobileAnalyzer";
import SslAnalyzer from "./SslAnalyzer";
import PerformanceAnalyzer from "./PerformanceAnalyzer";

/** Build one instance of every analyzer. Performance gets the API key if present;
 *  callers that only need the reporting methods can pass through without it. */
export function getAllAnalyzers(): Analyzer[] {
    return [
        new AccessibilityAnalyzer(),
        new SeoAnalyzer(),
        new MobileAnalyzer(),
        new SslAnalyzer(),
        new PerformanceAnalyzer(process.env.PAGESPEED_API_KEY)
    ];
}
