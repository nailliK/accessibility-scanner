import {chromium, Browser, BrowserContext, Page} from "playwright";
import MessageLogger from "./MessageLogger";
import ScanResult from "../interfaces/ScanResult";
import JsonDatabase from "../classes/JsonDatabase";
import {AxeBuilder} from "@axe-core/playwright";
import {AxeResults} from "axe-core";
import {v4 as uuidv4} from "uuid";
import * as cheerio from "cheerio";
import LooseObject from "@/interfaces/LooseObject";

class AccessibilityScanner {
    public scans: Array<ScanResult> = [];
    private browser: Browser | undefined;
    private context: BrowserContext | undefined;
    private page: Page | undefined;
    private baseURL: URL | undefined;
    private messageLogger: MessageLogger = new MessageLogger();
    private axeTags: string[] = [
        "wcag2a",
        "wcag2aa",
        "wcag21aa",
        "section508"
    ];

    constructor() {
    }

    public scan = async (): Promise<boolean> => {
        return new Promise(async (resolve, reject) => {
            if (typeof this.page !== "undefined") {
                this.scans = await this.database.read("scans") || [];

                // Add base URL to scans array
                if (!this.scans.length && typeof this.baseURL !== "undefined") {
                    this.scans.push({
                        id: uuidv4(),
                        url: this.baseURL,
                        complete: false,
                        results: {
                            violations: []
                        }
                    });
                }

                // Check for next scan item
                const currentScan = this.scans.find((s) => {
                    return !s.complete;
                });

                if (typeof currentScan !== "undefined") {
                    const scanURL: string = `${currentScan.url.protocol}//${currentScan.url.hostname}${currentScan.url.pathname}`;
                    console.log(`Scanning ${scanURL}`);

                    await this.page.goto(scanURL, {
                        waitUntil: "networkidle",
                        timeout: 0
                    });

                    // Parse page for more links to scan
                    const html: string = await this.page.evaluate(() => document.body.innerHTML);
                    this.parseLinks(html);

                    // Analyze page results
                    const scanResults: AxeResults = await new AxeBuilder({page: this.page})
                        .withTags(this.axeTags)
                        .analyze();

                    scanResults.violations.forEach((v) => {
                        if (typeof currentScan.results === "undefined") {
                            currentScan.results = {violations: []};
                        }

                        console.log(v);

                        currentScan?.results.violations.push({
                            name: v.id,
                            description: v.help,
                            tags: v.tags,
                            nodes: v.nodes.map(n => {
                                return {
                                    target: n.target,
                                    html: n.html
                                };
                            })
                        });
                    });

                    // Set scan to complete and scan next page
                    currentScan.complete = true;

                    await this.database.write("scans", this.scans);
                    resolve(await this.scan());
                } else {
                    resolve(true);
                }
            } else {
                reject("Browser not loaded!");
            }
        });
    };

    public init = (url: URL): Promise<boolean> => {
        return new Promise(async (resolve, reject) => {
            if (typeof url !== "undefined") {
                this.baseURL = url;
                // Initialize Playwright
                try {
                    console.log("Creating browser instance from Playwright.");
                    this.browser = await chromium.launch();
                    this.context = await this.browser.newContext({bypassCSP: true});
                    this.page = await this.context.newPage();
                    this.messageLogger.logSuccess(`${url} Browser instance created.`);
                } catch (err) {
                    reject("Could not create browser instance.");
                }

                resolve(await this.scan());
            } else {
                reject("No URL presented");
            }
        });
    };

    private parseLinks = (html: string) => {
        const $ = cheerio.load(html);
        $("a")
            .each((i, elem) => {
                // Disregard anchors without HREF attributes
                if (typeof $(elem).attr("href") !== "undefined") {
                    const newHREF: URL = new URL(<string>$(elem)
                        .attr("href"), `${this.baseURL?.protocol}//${this.baseURL?.hostname}`);

                    // Ensure new HREF has the same hostname
                    if (newHREF.hostname === this.baseURL?.hostname && newHREF.pathname.indexOf(".pdf") < 0) {

                        // Check for existing scan with the same pathname
                        const existingScan = this.scans.find((s) => {
                            return s.url.pathname === newHREF.pathname;
                        });

                        // Add new scan if existing scan is undefined
                        if (typeof existingScan === "undefined") {
                            this.scans.push({
                                id: uuidv4(),
                                url: newHREF,
                                complete: false
                            });
                            console.log(`added ${newHREF.pathname} to scans array.`);
                        }
                    }
                }
            });
    };

    private scansMutation = (scansArray: Array<LooseObject>) => {
        scansArray.forEach((s) => {
            if (s.hasOwnProperty("url")) {
                s.url = new URL(s.url);
            }
        });

        return scansArray;
    };

    private database = new JsonDatabase("accessibility-scanner", {
        mutations: [
            {
                attribute: "scans",
                mutation: this.scansMutation
            }
        ]
    });
}

export default AccessibilityScanner;

