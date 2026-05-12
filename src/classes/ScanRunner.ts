import Crawler from "./Crawler";
import CliHelper from "./CliHelper";
import ReportGenerator from "./ReportGenerator";
import MessageLogger from "./MessageLogger";
import {ScanOptions} from "#/interfaces/ScanRunner";
import StateStore, {parseStorageFlag} from "./StateStore";

const cli = new CliHelper();
const logger = new MessageLogger();

async function runScan(options: ScanOptions): Promise<void> {
    cli.clearScreen();
    cli.printTitle();
    console.log(`Mode: ${options.mode}\n`);

    try {
        let url = await cli.getUrl();
        const resolved = await cli.validateUrl(url);
        if (!resolved) {
            process.exit(1);
        }
        url = resolved;

        const outputDir = cli.generateOutputDir(url.hostname);
        const backend = parseStorageFlag(process.argv.slice(2));
        const stateStore = new StateStore(backend, outputDir);
        logger.logSuccess(`State storage: ${backend}`);
        const crawler = new Crawler(outputDir, stateStore);

        for (const analyzer of options.analyzers) {
            crawler.registerAnalyzer(analyzer);
        }

        logger.logSuccess(`Starting ${options.mode.toLowerCase()}...`);
        const result = await crawler.crawl(url);

        const full = options.full ?? process.argv.includes("--full");
        const report = new ReportGenerator(outputDir, options.analyzers, undefined, full);
        await report.generate(result);

        logger.logSuccess(`Complete! Output: ${outputDir}`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.logFailure(message);
    } finally {
        process.exit();
    }
}

export default runScan;
