import {chromium, Browser, BrowserContext, Page} from "playwright";

import {v4 as uuidv4} from "uuid";
import fs from "fs";
import MessageLogger from "./MessageLogger";
import {Analyzer} from "#/interfaces/Analyzer";
import {Scan, ScanState, assembleScan} from "#/interfaces/Scan";
import {toScanUrl} from "#/utils/UrlHelper";
import StateStore from "./StateStore";

const DEFAULT_MAX_PAGES = 150;

class Crawler {
    private browser: Browser | undefined;
    private context: BrowserContext | undefined;
    private page: Page | undefined;
    private baseURL: URL | undefined;
    private analyzers: Analyzer[] = [];
    private messageLogger: MessageLogger = new MessageLogger();
    private outputDir: string;
    private stateStore: StateStore;
    private maxPages: number;
    private state: ScanState = {
        domain: "",
        baseURL: "",
        entries: [],
        analyzerResults: {},
        domainResults: {}
    };

    constructor(outputDir: string, stateStore: StateStore, maxPages: number = DEFAULT_MAX_PAGES) {
        this.outputDir = outputDir;
        this.stateStore = stateStore;
        this.maxPages = maxPages;
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, {recursive: true});
        }
    }

    public registerAnalyzer(analyzer: Analyzer): void {
        this.analyzers.push(analyzer);
    }

    public async crawl(url: URL): Promise<Scan> {
        this.baseURL = url;
        await this.loadState(url.hostname);

        if (this.state.entries.length === 0) {
            this.state.domain = url.hostname;
            this.state.baseURL = url.toString();
            this.state.entries.push({
                id: uuidv4(),
                url: url.toString(),
                crawled: false,
                analyzed: false
            });
            await this.saveState();
        }

        try {
            this.messageLogger.logSuccess("Launching browser...");
            this.browser = await chromium.launch({
                args: ["--disable-blink-features=AutomationControlled"]
            });
            this.context = await this.browser.newContext({
                bypassCSP: true,
                ignoreHTTPSErrors: true,
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                viewport: {width: 1920, height: 1080}
            });
            this.page = await this.context.newPage();
            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {get: () => false});
            });

            for (const analyzer of this.analyzers) {
                analyzer.setBrowser?.(this.browser);
                analyzer.setOutputDir?.(this.outputDir);
            }

            // Phase 1: Crawl and index all pages
            this.messageLogger.logSuccess("Phase 1: Crawling and indexing...");
            await this.crawlPages();

            // Phase 2: Run analyzers on indexed pages
            this.messageLogger.logSuccess("Phase 2: Running analysis...");
            await this.analyzePages();

            // Domain-level analysis
            for (const analyzer of this.analyzers) {
                if (analyzer.analyzeDomain && !this.state.domainResults[analyzer.type]) {
                    this.state.domainResults[analyzer.type] = await analyzer.analyzeDomain(this.baseURL.hostname);
                    await this.saveState();
                }
            }

            return assembleScan(this.state);
        } finally {
            await this.browser?.close();
        }
    }

    private async crawlPages(): Promise<void> {
        if (!this.page || !this.baseURL) throw new Error("Browser not loaded");

        let next = this.state.entries.find(e => !e.crawled);
        while (next) {
            const entryURL = new URL(next.url);
            const scanURL = toScanUrl(entryURL);
            console.log(`Crawling ${scanURL}`);

            try {
                await this.page.goto(scanURL, {waitUntil: "load", timeout: 30000});

                // Wait for bot protection challenges to resolve
                const title = await this.page.title();
                if (title.toLowerCase().includes("checking") || title.toLowerCase().includes("just a moment")) {
                    this.messageLogger.logWarning(`Bot challenge detected on ${scanURL}, waiting...`);
                    try {
                        await this.page.waitForFunction(
                            () => !document.title.toLowerCase().includes("checking") && !document.title.toLowerCase().includes("just a moment"),
                            {timeout: 15000}
                        );
                        await this.page.waitForLoadState("load");
                    } catch {
                        this.messageLogger.logWarning(`Bot challenge did not resolve for ${scanURL}`);
                    }
                }

                // Update baseURL to match actual hostname after redirects (e.g. example.com → www.example.com)
                const actualURL = new URL(this.page.url());
                if (actualURL.hostname !== this.baseURL.hostname) {
                    this.messageLogger.logSuccess(`Followed redirect: ${this.baseURL.hostname} → ${actualURL.hostname}`);
                    this.baseURL = new URL(`${actualURL.protocol}//${actualURL.hostname}`);
                }

                await this.discoverLinks(this.page);
            } catch (err: any) {
                this.messageLogger.logWarning(`Skipping ${scanURL}: ${err.message}`);
            }

            next.crawled = true;
            await this.saveState();

            next = this.state.entries.find(e => !e.crawled);
        }

        this.messageLogger.logSuccess(`Indexed ${this.state.entries.length} pages.`);
    }

    private async analyzePages(): Promise<void> {
        if (!this.page) throw new Error("Browser not loaded");

        for (const analyzer of this.analyzers) {
            if (!this.state.analyzerResults[analyzer.type]) {
                this.state.analyzerResults[analyzer.type] = {};
            }
        }

        let next = this.state.entries.find(e => !e.analyzed);
        while (next) {
            const entryURL = new URL(next.url);
            const scanURL = toScanUrl(entryURL);
            console.log(`Analyzing ${scanURL}`);

            try {
                await this.page.goto(scanURL, {waitUntil: "load", timeout: 30000});

                for (const analyzer of this.analyzers) {
                    if (!analyzer.analyzePage) continue;
                    try {
                        const result = await analyzer.analyzePage(this.page, entryURL);
                        this.state.analyzerResults[analyzer.type][next.id] = result;
                    } catch (err) {
                        this.messageLogger.logFailure(`${analyzer.name} failed on ${scanURL}: ${err}`);
                    }
                }
            } catch (err: any) {
                this.messageLogger.logWarning(`Skipping analysis of ${scanURL}: ${err.message}`);
            }

            next.analyzed = true;
            await this.saveState();

            next = this.state.entries.find(e => !e.analyzed);
        }
    }

    private async discoverLinks(page: Page): Promise<void> {
        if (!this.baseURL) return;

        const hrefs: string[] = await page.evaluate(() => {
            const links: string[] = [];
            document.querySelectorAll("a[href]").forEach(a => {
                const href = a.getAttribute("href");
                if (href) links.push(href);
            });
            return links;
        });

        for (const href of hrefs) {
            try {
                const newURL = new URL(href, `${this.baseURL.protocol}//${this.baseURL.hostname}`);
                if (newURL.hostname !== this.baseURL.hostname) continue;
                if (newURL.pathname.indexOf(".pdf") >= 0) continue;

                const newKey = `${newURL.pathname}${newURL.search}`;
                if (this.state.entries.length >= this.maxPages) continue;

                const exists = this.state.entries.find(e => {
                    const existing = new URL(e.url);
                    return `${existing.pathname}${existing.search}` === newKey;
                });
                if (exists) continue;

                this.state.entries.push({
                    id: uuidv4(),
                    url: newURL.toString(),
                    crawled: false,
                    analyzed: false
                });
                console.log(`Discovered ${newKey}`);
            } catch {
                // Invalid URL, skip
            }
        }
    }

    private async loadState(domain: string): Promise<void> {
        const loaded = await this.stateStore.loadState(domain);
        if (loaded) {
            this.state = loaded;
            const crawled = this.state.entries.filter(e => e.crawled).length;
            const analyzed = this.state.entries.filter(e => e.analyzed).length;
            this.messageLogger.logSuccess(`Resuming: ${crawled}/${this.state.entries.length} crawled, ${analyzed}/${this.state.entries.length} analyzed.`);
        }
    }

    private async saveState(): Promise<void> {
        await this.stateStore.saveState(this.state);
    }
}

export default Crawler;
