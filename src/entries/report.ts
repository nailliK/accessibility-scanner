import "dotenv/config";
import CliHelper from "#/classes/CliHelper";
import ReportGenerator from "#/classes/ReportGenerator";
import MessageLogger from "#/classes/MessageLogger";
import {assembleScan} from "#/interfaces/Scan";
import StateStore, {parseStorageFlag} from "#/classes/StateStore";
import {getAllAnalyzers} from "#/analyzers/registry";

const cli = new CliHelper();
const logger = new MessageLogger();

const run = async (): Promise<void> => {
    cli.clearScreen();
    cli.printTitle();
    console.log("Mode: Regenerate Report\n");

    try {
        const url = await cli.getUrl();
        const outputDir = cli.generateOutputDir(url.hostname);
        const backend = parseStorageFlag(process.argv.slice(2));
        const stateStore = new StateStore(backend, outputDir);

        const state = await stateStore.loadState(url.hostname);
        if (!state) {
            logger.logFailure(`No scan data found (${backend}) for ${url.hostname}`);
            logger.logFailure("Run a full scan first.");
            process.exit(1);
        }

        const full = process.argv.includes("--full");
        const report = new ReportGenerator(outputDir, getAllAnalyzers(), undefined, full);
        await report.generate(assembleScan(state));
        logger.logSuccess(`Report regenerated! Output: ${outputDir}`);
    } catch (error: any) {
        logger.logFailure(error.message || error);
    } finally {
        process.exit();
    }
};

run();
