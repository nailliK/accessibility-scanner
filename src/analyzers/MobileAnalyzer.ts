import {Page, Browser, devices} from "playwright";
import {Analyzer, AnalyzerOutput, AnalyzerPageResult, AnalyzerSummary} from "#/interfaces/Analyzer";
import {Scan} from "#/interfaces/Scan";
import {toScanUrl} from "#/utils/UrlHelper";
import path from "path";
import fs from "fs";

class MobileAnalyzer implements Analyzer {
    readonly name = "Mobile Responsiveness";
    readonly type = "mobile";
    private outputDir: string = "";
    private browser: Browser | undefined;

    public setBrowser(browser: Browser): void {
        this.browser = browser;
    }

    public setOutputDir(outputDir: string): void {
        this.outputDir = outputDir;
    }

    public async analyzePage(page: Page, url: URL): Promise<AnalyzerPageResult> {
        // Check viewport meta from the desktop page
        const desktopInfo = await page.evaluate(() => {
            const meta = document.querySelector('meta[name="viewport"]');
            const bodyWidth = document.body?.scrollWidth || 0;
            const windowWidth = window.innerWidth || 0;

            // Check for fixed-width elements
            const allElements = document.querySelectorAll("*");
            let fixedWidthElements = 0;
            allElements.forEach(el => {
                const style = window.getComputedStyle(el);
                const width = parseInt(style.width);
                if (width > 500 && style.position !== "absolute" && style.position !== "fixed") {
                    fixedWidthElements++;
                }
            });

            // Check for text size
            let smallTextCount = 0;
            const textElements = document.querySelectorAll("p, span, a, li, td, th, label");
            textElements.forEach(el => {
                const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
                if (fontSize < 12 && el.textContent && el.textContent.trim().length > 0) {
                    smallTextCount++;
                }
            });

            return {
                hasViewportMeta: meta !== null,
                viewportContent: meta?.getAttribute("content") || null,
                desktopBodyWidth: bodyWidth,
                desktopWindowWidth: windowWidth,
                fixedWidthElements,
                smallTextCount
            };
        });

        // Emulate mobile device
        let screenshotPath: string | null = null;
        let horizontalScrolling = false;
        let tapTargetIssues: {selector: string; width: number; height: number}[] = [];
        let mobileBodyWidth = 0;
        let mobileWindowWidth = 0;
        let contentOverflowElements = 0;

        if (this.browser) {
            const iPhone = devices["iPhone 12"];
            const mobileContext = await this.browser.newContext({
                ...iPhone,
                bypassCSP: true
            });
            const mobilePage = await mobileContext.newPage();

            try {
                const scanURL = toScanUrl(url);
                await mobilePage.goto(scanURL, {
                    waitUntil: "load",
                    timeout: 30000
                });

                // Screenshot
                const screenshotsDir = path.join(this.outputDir, "screenshots");
                if (!fs.existsSync(screenshotsDir)) {
                    fs.mkdirSync(screenshotsDir, {recursive: true});
                }
                const safeName = url.pathname.replace(/\//g, "_").replace(/^_/, "") || "index";
                screenshotPath = path.join(screenshotsDir, `mobile-${safeName}.png`);
                await mobilePage.screenshot({path: screenshotPath, fullPage: true});

                const mobileMetrics = await mobilePage.evaluate(() => {
                    const scrollW = document.documentElement.scrollWidth;
                    const clientW = document.documentElement.clientWidth;

                    // Count elements that overflow viewport
                    let overflowCount = 0;
                    document.querySelectorAll("*").forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > clientW + 5 && rect.width > 0) {
                            overflowCount++;
                        }
                    });

                    // Tap targets
                    const tapIssues: {selector: string; width: number; height: number}[] = [];
                    const interactiveElements = document.querySelectorAll("a, button, input, select, textarea, [role='button']");
                    interactiveElements.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
                            const selector = el.tagName.toLowerCase() +
                                (el.id ? `#${el.id}` : "") +
                                (el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : "");
                            tapIssues.push({
                                selector: selector.substring(0, 120),
                                width: Math.round(rect.width),
                                height: Math.round(rect.height)
                            });
                        }
                    });

                    return {
                        horizontalScrolling: scrollW > clientW,
                        mobileBodyWidth: scrollW,
                        mobileWindowWidth: clientW,
                        contentOverflowElements: overflowCount,
                        tapTargetIssues: tapIssues.slice(0, 50),
                        totalInteractiveElements: interactiveElements.length
                    };
                });

                horizontalScrolling = mobileMetrics.horizontalScrolling;
                mobileBodyWidth = mobileMetrics.mobileBodyWidth;
                mobileWindowWidth = mobileMetrics.mobileWindowWidth;
                contentOverflowElements = mobileMetrics.contentOverflowElements;
                tapTargetIssues = mobileMetrics.tapTargetIssues;

                // Store total interactive for ratio calculation
                Object.assign(desktopInfo, {
                    totalInteractiveElements: mobileMetrics.totalInteractiveElements
                });

            } finally {
                await mobileContext.close();
            }
        }

        return {
            url: url.toString(),
            findings: {
                ...desktopInfo,
                screenshotPath,
                tapTargetIssues,
                horizontalScrolling,
                mobileBodyWidth,
                mobileWindowWidth,
                contentOverflowElements,
                totalInteractiveElements: (desktopInfo as any).totalInteractiveElements || 0
            } as unknown as Record<string, unknown>
        };
    }

    public summarize(output: AnalyzerOutput, _scan: Scan): AnalyzerSummary {
        const total = output.pageResults.length;
        const keyFindings: string[] = [];
        const overview: string[] = [];

        const totalTapIssues = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).tapTargetIssues?.length || 0), 0);
        const pagesWithScroll = output.pageResults.filter(p => (p.findings as any).horizontalScrolling).length;
        const pagesWithoutViewport = output.pageResults.filter(p => !(p.findings as any).hasViewportMeta).length;

        const keyParts: string[] = [];
        if (pagesWithoutViewport > 0) keyParts.push(`${pagesWithoutViewport} pages missing viewport meta`);
        if (totalTapIssues > 0) keyParts.push(`${totalTapIssues} undersized tap targets`);
        if (pagesWithScroll > 0) keyParts.push(`horizontal scrolling on ${pagesWithScroll} pages`);
        if (keyParts.length > 0) {
            keyFindings.push(keyParts.join(", ") + ".");
        } else {
            keyFindings.push("Site is mobile-friendly.");
        }

        if (pagesWithoutViewport > 0) {
            overview.push(`${pagesWithoutViewport} of ${total} pages missing the viewport meta tag — mobile browsers will render these pages at desktop width and scale down, making text unreadable without zooming.`);
        }

        if (pagesWithScroll > 0) {
            overview.push(`${pagesWithScroll} of ${total} pages require horizontal scrolling on mobile — content extends beyond the screen width, creating a poor mobile experience.`);
        }

        const totalOverflow = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).contentOverflowElements || 0), 0);
        if (totalOverflow > 0) {
            overview.push(`${totalOverflow} elements overflow the mobile viewport across ${total} pages — these may be images, tables, or containers with fixed widths.`);
        }

        const totalInteractive = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).totalInteractiveElements || 0), 0);
        const pagesWithTapIssues = output.pageResults.filter(p => ((p.findings as any).tapTargetIssues?.length || 0) > 0).length;
        if (totalTapIssues > 0) {
            const pct = totalInteractive > 0 ? Math.round((totalTapIssues / totalInteractive) * 100) : 0;
            overview.push(`${totalTapIssues} of ${totalInteractive} interactive elements (${pct}%) are smaller than the recommended 44x44px tap target size across ${pagesWithTapIssues} pages — users on touch devices may struggle to tap buttons and links accurately.`);
        }

        const totalSmallText = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).smallTextCount || 0), 0);
        if (totalSmallText > 0) {
            overview.push(`${totalSmallText} text elements use a font size below 12px — this text may be difficult to read on mobile devices without zooming.`);
        }

        const totalFixedWidth = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).fixedWidthElements || 0), 0);
        if (totalFixedWidth > 0) {
            overview.push(`${totalFixedWidth} elements use fixed widths wider than 500px — these may not adapt to smaller screens.`);
        }

        if (overview.length === 0) {
            overview.push("Site is mobile-friendly.");
        }

        return {keyFindings, overview};
    }

    public renderMarkdown(findings: Record<string, unknown>): string {
        const f = findings as any;
        const lines: string[] = [];

        lines.push(`| Property | Value |`);
        lines.push(`| --- | --- |`);
        lines.push(`| Viewport Meta | ${f.hasViewportMeta ? (f.viewportContent || "present") : "*Missing*"} |`);
        lines.push(`| Horizontal Scrolling | ${f.horizontalScrolling ? "Yes (issue)" : "No"} |`);
        lines.push(`| Undersized Tap Targets | ${f.tapTargetIssues?.length || 0} of ${f.totalInteractiveElements || "?"} interactive elements |`);
        lines.push(`| Content Overflow Elements | ${f.contentOverflowElements || 0} |`);
        lines.push(`| Small Text Elements (<12px) | ${f.smallTextCount || 0} |`);
        lines.push(`| Fixed-Width Elements (>500px) | ${f.fixedWidthElements || 0} |`);

        if (f.tapTargetIssues?.length > 0) {
            lines.push(``);
            lines.push(`**Undersized Tap Targets:**`);
            lines.push(``);
            lines.push(`| Element | Width | Height |`);
            lines.push(`| --- | --- | --- |`);
            for (const t of f.tapTargetIssues.slice(0, 20)) {
                lines.push(`| \`${t.selector}\` | ${t.width}px | ${t.height}px |`);
            }
        }

        return lines.join("\n");
    }
}

export default MobileAnalyzer;
