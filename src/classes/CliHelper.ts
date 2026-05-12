import clear from "clear";
import chalk from "chalk";
import {createInterface} from "readline";
import fs from "fs";
import path from "path";
import MessageLogger from "./MessageLogger";

class CliHelper {
    private messageLogger: MessageLogger = new MessageLogger();

    public printTitle(): void {
        console.log(`${chalk.green("Site Analyzer")} ${chalk.yellow("v.0.1.0")}`);
    }

    public clearScreen(): void {
        clear();
    }

    public async getUrl(): Promise<URL> {
        const arg = process.argv[2];
        if (arg) {
            try {
                const url = new URL(arg.startsWith("http") ? arg : `https://${arg}`);
                this.messageLogger.logSuccess(`${url} is a valid URL.`);
                return url;
            } catch {
                this.messageLogger.logFailure(`Invalid URL: ${arg}`);
                process.exit(1);
            }
        }
        return this.promptForUrl();
    }

    public async validateUrl(url: URL): Promise<URL | false> {
        // Try the given URL first, then fall back to alternate protocol
        const targets = [
            `${url.protocol}//${url.hostname}`,
            `${url.protocol === "https:" ? "http:" : "https:"}//${url.hostname}`
        ];

        for (const target of targets) {
            try {
                await fetch(target, {
                    method: "HEAD",
                    redirect: "follow",
                    signal: AbortSignal.timeout(30000),
                    headers: {"User-Agent": "Mozilla/5.0 (compatible; SiteAnalyzer/1.0)"}
                });
                const resolvedUrl = new URL(target);
                this.messageLogger.logSuccess(`${resolvedUrl} is resolving properly.`);
                return resolvedUrl;
            } catch {
                // Try next
            }
        }

        this.messageLogger.logFailure("Base URL did not resolve.");
        return false;
    }

    public generateOutputDir(domain: string): string {
        const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const outputDir = `./output/${safeDomain}/${date}`;

        // Check for existing incomplete scan
        if (fs.existsSync(outputDir)) {
            const dbPath = path.join(outputDir, `state.json`);
            if (fs.existsSync(dbPath)) {
                this.messageLogger.logSuccess(`Found existing scan for ${domain} from ${date} — resuming.`);
                return outputDir;
            }
        }

        return outputDir;
    }

    private async promptForUrl(): Promise<URL> {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve, reject) => {
            rl.question("Please enter scan base URL (https://www.example.com): ", (urlString) => {
                rl.close();
                try {
                    const url: URL = new URL(urlString);
                    this.messageLogger.logSuccess(`${url} is a valid URL.`);
                    resolve(url);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

export default CliHelper;
