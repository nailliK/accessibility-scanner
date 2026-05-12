import "dotenv/config";
import runScan from "#/classes/ScanRunner";
import AccessibilityAnalyzer from "#/analyzers/AccessibilityAnalyzer";
import SeoAnalyzer from "#/analyzers/SeoAnalyzer";
import MobileAnalyzer from "#/analyzers/MobileAnalyzer";
import SslAnalyzer from "#/analyzers/SslAnalyzer";
import PerformanceAnalyzer from "#/analyzers/PerformanceAnalyzer";
import MessageLogger from "#/classes/MessageLogger";
import {Analyzer} from "#/interfaces/Analyzer";

const logger = new MessageLogger();

const ALL = ["accessibility", "seo", "mobile", "ssl", "performance"] as const;
type AnalyzerName = typeof ALL[number];

function parseAnalyzersFlag(args: string[]): AnalyzerName[] | null {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let value: string | undefined;
        if (arg === "--analyzer" && args[i + 1]) value = args[i + 1];
        else if (arg.startsWith("--analyzer=")) value = arg.slice("--analyzer=".length);
        if (value === undefined) continue;

        const requested = value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const valid: AnalyzerName[] = [];
        for (const name of requested) {
            if (!ALL.includes(name as AnalyzerName)) {
                logger.logFailure(`Unknown analyzer "${name}". Valid: ${ALL.join(", ")}.`);
                process.exit(1);
            }
            valid.push(name as AnalyzerName);
        }
        return valid;
    }
    return null;
}

function buildAnalyzer(name: AnalyzerName): Analyzer | null {
    switch (name) {
        case "accessibility": return new AccessibilityAnalyzer();
        case "seo": return new SeoAnalyzer();
        case "mobile": return new MobileAnalyzer();
        case "ssl": return new SslAnalyzer();
        case "performance": {
            const key = process.env.PAGESPEED_API_KEY;
            if (!key) {
                logger.logWarning("PAGESPEED_API_KEY not set — skipping performance analysis.");
                return null;
            }
            logger.logSuccess("PageSpeed Insights API key found.");
            return new PerformanceAnalyzer(key);
        }
    }
}

const selected = parseAnalyzersFlag(process.argv.slice(2)) ?? [...ALL];
const analyzers = selected
    .map(buildAnalyzer)
    .filter((a): a is Analyzer => a !== null);

if (analyzers.length === 0) {
    logger.logFailure("No analyzers available to run.");
    process.exit(1);
}

const mode = selected.length === ALL.length
    ? "Full Site Analysis"
    : `${selected.map(s => s[0].toUpperCase() + s.slice(1)).join(" + ")} Analysis`;

runScan({mode, analyzers});
