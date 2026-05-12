import {Page} from "playwright";
import {Analyzer, AnalyzerOutput, AnalyzerPageResult, AnalyzerSummary} from "#/interfaces/Analyzer";
import {Scan} from "#/interfaces/Scan";
import {HeadingIssue} from "#/interfaces/Findings";

class SeoAnalyzer implements Analyzer {
    readonly name = "SEO";
    readonly type = "seo";

    public async analyzePage(page: Page, url: URL): Promise<AnalyzerPageResult> {
        const findings = await page.evaluate(() => {
            // Title
            const titleEl = document.querySelector("title");
            const title = titleEl?.textContent?.trim() || null;

            // Meta description
            const metaDesc = document.querySelector('meta[name="description"]');
            const metaDescription = metaDesc?.getAttribute("content")?.trim() || null;

            // Canonical
            const canonicalEl = document.querySelector('link[rel="canonical"]');
            const canonicalUrl = canonicalEl?.getAttribute("href") || null;

            // Robots meta
            const robotsMeta = document.querySelector('meta[name="robots"]');
            const hasRobotsMeta = robotsMeta !== null;
            const robotsContent = robotsMeta?.getAttribute("content") || null;

            // Open Graph
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || null;
            const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || null;
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
            const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") || null;

            // Twitter Card
            const twitterCard = document.querySelector('meta[name="twitter:card"]')?.getAttribute("content") || null;
            const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || null;

            // Structured data (JSON-LD)
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            const structuredDataTypes: string[] = [];
            jsonLdScripts.forEach(script => {
                try {
                    const data = JSON.parse(script.textContent || "");
                    if (data["@type"]) structuredDataTypes.push(data["@type"]);
                    if (Array.isArray(data["@graph"])) {
                        data["@graph"].forEach((item: any) => {
                            if (item["@type"]) structuredDataTypes.push(item["@type"]);
                        });
                    }
                } catch {
                    // Invalid JSON-LD
                }
            });

            // Headings
            const headings: {tag: string; text: string}[] = [];
            document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(h => {
                headings.push({
                    tag: h.tagName.toLowerCase(),
                    text: (h.textContent?.trim() || "").substring(0, 120)
                });
            });

            // Images
            const images = document.querySelectorAll("img");
            const imagesTotal = images.length;
            const imagesMissingAlt: {src: string; html: string}[] = [];
            images.forEach(img => {
                const alt = img.getAttribute("alt");
                if (alt === null || alt.trim() === "") {
                    imagesMissingAlt.push({
                        src: img.getAttribute("src") || "",
                        html: img.outerHTML.substring(0, 200)
                    });
                }
            });

            // Links
            const internalLinks = document.querySelectorAll('a[href]');
            let internalLinkCount = 0;
            let externalLinkCount = 0;
            let linksWithoutText = 0;
            internalLinks.forEach(a => {
                const href = a.getAttribute("href") || "";
                const text = (a.textContent?.trim() || "");
                const ariaLabel = a.getAttribute("aria-label") || "";
                if (href.startsWith("http") && !href.includes(window.location.hostname)) {
                    externalLinkCount++;
                } else if (!href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
                    internalLinkCount++;
                }
                if (!text && !ariaLabel && !a.querySelector("img[alt]")) {
                    linksWithoutText++;
                }
            });

            // Language attribute
            const htmlLang = document.documentElement.getAttribute("lang") || null;

            // Word count (rough)
            const bodyText = document.body?.innerText || "";
            const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;

            return {
                title,
                titleLength: title?.length || 0,
                metaDescription,
                metaDescriptionLength: metaDescription?.length || 0,
                canonicalUrl,
                hasRobotsMeta,
                robotsContent,
                ogTitle,
                ogDescription,
                ogImage,
                ogType,
                twitterCard,
                twitterTitle,
                structuredDataTypes,
                headings,
                imagesTotal,
                imagesMissingAlt,
                internalLinkCount,
                externalLinkCount,
                linksWithoutText,
                htmlLang,
                wordCount
            };
        });

        // Analyze heading hierarchy
        const headingIssues: HeadingIssue[] = [];
        const h1s = findings.headings.filter(h => h.tag === "h1");
        if (h1s.length === 0) {
            headingIssues.push({type: "missing-h1", detail: "Page has no H1 element"});
        } else if (h1s.length > 1) {
            headingIssues.push({type: "multiple-h1", detail: `Page has ${h1s.length} H1 elements`});
        }

        const levels = findings.headings.map(h => parseInt(h.tag.charAt(1)));
        for (let i = 1; i < levels.length; i++) {
            if (levels[i] > levels[i - 1] + 1) {
                headingIssues.push({
                    type: "skipped-level",
                    detail: `Heading jumps from H${levels[i - 1]} to H${levels[i]}`
                });
            }
        }

        return {
            url: url.toString(),
            findings: {
                ...findings,
                headingIssues
            } as unknown as Record<string, unknown>
        };
    }

    public summarize(output: AnalyzerOutput, _scan: Scan): AnalyzerSummary {
        const total = output.pageResults.length;
        const keyFindings: string[] = [];
        const overview: string[] = [];

        // Key findings — most impactful issues
        const keyParts: string[] = [];
        const pagesWithoutTitle = output.pageResults.filter(p => !(p.findings as any).title).length;
        const pagesWithoutDesc = output.pageResults.filter(p => !(p.findings as any).metaDescription).length;
        const totalMissingAlt = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).imagesMissingAlt?.length || 0), 0);
        if (pagesWithoutTitle > 0) keyParts.push(`${pagesWithoutTitle} pages missing title tags`);
        if (pagesWithoutDesc > 0) keyParts.push(`${pagesWithoutDesc} pages missing meta descriptions`);
        if (totalMissingAlt > 0) keyParts.push(`${totalMissingAlt} images missing alt text`);
        if (keyParts.length > 0) keyFindings.push(keyParts.join(", ") + ".");

        const hasStructuredData = output.pageResults.some(p => ((p.findings as any).structuredDataTypes?.length || 0) > 0);
        if (!hasStructuredData) {
            keyFindings.push("No structured data detected — not eligible for Google rich results.");
        }

        const pagesWithoutOG = output.pageResults.filter(p => !(p.findings as any).ogTitle && !(p.findings as any).ogDescription).length;
        if (pagesWithoutOG > 0) {
            keyFindings.push(`Open Graph metadata missing on ${pagesWithoutOG} pages — social shares display without controlled previews.`);
        }

        // Overview — full breakdown
        const titleLengthIssues = output.pageResults.filter(p => {
            const len = (p.findings as any).titleLength || 0;
            return len > 0 && (len < 30 || len > 60);
        });
        const titles = output.pageResults
            .map(p => (p.findings as any).title)
            .filter((t): t is string => !!t);
        const titleCounts = new Map<string, number>();
        for (const t of titles) titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
        const duplicateTitles = [...titleCounts.entries()].filter(([, c]) => c > 1);

        if (pagesWithoutTitle > 0) {
            overview.push(`${pagesWithoutTitle} of ${total} pages missing title tags — search engines cannot properly index or display these pages in results.`);
        }
        if (duplicateTitles.length > 0) {
            const dupeCount = duplicateTitles.reduce((s, [, c]) => s + c, 0);
            overview.push(`${dupeCount} pages share duplicate title tags — search engines may have difficulty distinguishing these pages from each other.`);
        }
        if (titleLengthIssues.length > 0) {
            overview.push(`${titleLengthIssues.length} pages have title tags outside the recommended 30–60 character range, which may be truncated or underutilized in search results.`);
        }
        if (pagesWithoutDesc > 0) {
            overview.push(`${pagesWithoutDesc} of ${total} pages missing meta descriptions — search engines will auto-generate snippets, which may not represent the brand or content accurately.`);
        }

        const pagesMissingH1 = output.pageResults.filter(p =>
            ((p.findings as any).headingIssues || []).some((i: any) => i.type === "missing-h1")
        );
        const pagesSkippedLevels = output.pageResults.filter(p =>
            ((p.findings as any).headingIssues || []).some((i: any) => i.type === "skipped-level")
        );
        if (pagesMissingH1.length > 0) {
            overview.push(`${pagesMissingH1.length} pages have no H1 heading — the primary heading signals page topic to search engines and screen readers.`);
        }
        if (pagesSkippedLevels.length > 0) {
            overview.push(`${pagesSkippedLevels.length} pages have heading hierarchy issues (e.g., jumping from H2 to H4), which can confuse search engine content parsing.`);
        }

        const totalImages = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).imagesTotal || 0), 0);
        if (totalMissingAlt > 0) {
            overview.push(`${totalMissingAlt} of ${totalImages} images missing alt text — these images are invisible to search engines and screen readers.`);
        }

        const pagesWithoutCanonical = output.pageResults.filter(p => !(p.findings as any).canonicalUrl);
        if (pagesWithoutCanonical.length > 0) {
            overview.push(`${pagesWithoutCanonical.length} of ${total} pages missing canonical URLs — without these, search engines may index duplicate versions of pages.`);
        }

        const pagesWithoutOGImage = output.pageResults.filter(p => !(p.findings as any).ogImage);
        if (pagesWithoutOG > 0) {
            overview.push(`${pagesWithoutOG} of ${total} pages missing Open Graph metadata — links shared on social media (Facebook, LinkedIn, Slack) will display without a controlled title or description.`);
        }
        if (pagesWithoutOGImage.length > 0 && pagesWithoutOGImage.length !== pagesWithoutOG) {
            overview.push(`${pagesWithoutOGImage.length} pages missing Open Graph image — shared links will appear without a preview image on social platforms.`);
        }

        const pagesWithoutTwitter = output.pageResults.filter(p => !(p.findings as any).twitterCard);
        if (pagesWithoutTwitter.length > 0 && pagesWithoutTwitter.length !== pagesWithoutOG) {
            overview.push(`${pagesWithoutTwitter.length} pages missing Twitter Card metadata.`);
        }

        const pagesWithStructuredData = output.pageResults.filter(p => ((p.findings as any).structuredDataTypes?.length || 0) > 0);
        if (pagesWithStructuredData.length === 0) {
            overview.push("No structured data (JSON-LD) found on any page — adding schema markup can enable rich results in Google (star ratings, FAQs, breadcrumbs, etc.).");
        } else {
            const allTypes = new Set<string>();
            for (const p of pagesWithStructuredData) {
                for (const t of (p.findings as any).structuredDataTypes || []) allTypes.add(t);
            }
            overview.push(`Structured data found on ${pagesWithStructuredData.length} of ${total} pages (types: ${[...allTypes].join(", ")}).`);
        }

        const pagesWithoutLang = output.pageResults.filter(p => !(p.findings as any).htmlLang);
        if (pagesWithoutLang.length > 0) {
            overview.push(`${pagesWithoutLang.length} pages missing the HTML lang attribute — this helps search engines serve the right language version and assists screen readers.`);
        }

        const thinPages = output.pageResults.filter(p => ((p.findings as any).wordCount || 0) < 100);
        if (thinPages.length > 0) {
            overview.push(`${thinPages.length} pages have fewer than 100 words of content — search engines may consider these "thin content" and rank them lower.`);
        }

        const totalInternalLinks = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).internalLinkCount || 0), 0);
        const totalExternalLinks = output.pageResults.reduce((sum, p) => sum + ((p.findings as any).externalLinkCount || 0), 0);
        overview.push(`${totalInternalLinks} internal links and ${totalExternalLinks} external links found across ${total} pages.`);

        if (overview.length === 0) {
            overview.push("All pages have proper SEO metadata.");
        }

        return {keyFindings, overview};
    }

    public renderMarkdown(findings: Record<string, unknown>): string {
        const f = findings as any;
        const lines: string[] = [];

        lines.push(`| Property | Value |`);
        lines.push(`| --- | --- |`);
        lines.push(`| Title | ${f.title ? `${f.title} (${f.titleLength} chars)` : "*Missing*"} |`);
        lines.push(`| Meta Description | ${f.metaDescription ? `${f.metaDescription.substring(0, 80)}... (${f.metaDescriptionLength} chars)` : "*Missing*"} |`);
        lines.push(`| Canonical URL | ${f.canonicalUrl || "*Not set*"} |`);
        lines.push(`| Language | ${f.htmlLang || "*Not set*"} |`);
        lines.push(`| Word Count | ${f.wordCount || 0} |`);
        lines.push(`| Internal Links | ${f.internalLinkCount || 0} |`);
        lines.push(`| External Links | ${f.externalLinkCount || 0} |`);

        const hasOG = f.ogTitle || f.ogDescription || f.ogImage;
        if (hasOG) {
            lines.push(`| OG Title | ${f.ogTitle || "*Not set*"} |`);
            lines.push(`| OG Description | ${f.ogDescription ? f.ogDescription.substring(0, 80) + "..." : "*Not set*"} |`);
            lines.push(`| OG Image | ${f.ogImage ? "Present" : "*Missing*"} |`);
        } else {
            lines.push(`| Open Graph | *Not configured* |`);
        }

        if (f.twitterCard) {
            lines.push(`| Twitter Card | ${f.twitterCard} |`);
        }

        if (f.structuredDataTypes?.length > 0) {
            lines.push(`| Structured Data | ${f.structuredDataTypes.join(", ")} |`);
        } else {
            lines.push(`| Structured Data | *None found* |`);
        }

        if (f.headingIssues?.length > 0) {
            lines.push(``);
            lines.push(`**Heading Issues:**`);
            for (const issue of f.headingIssues) {
                lines.push(`- ${issue.detail}`);
            }
        }

        if (f.imagesMissingAlt?.length > 0) {
            lines.push(``);
            lines.push(`**Images Missing Alt Text (${f.imagesMissingAlt.length} of ${f.imagesTotal}):**`);
            lines.push(``);
            lines.push(`| Source | HTML |`);
            lines.push(`| --- | --- |`);
            for (const img of f.imagesMissingAlt.slice(0, 20)) {
                lines.push(`| ${img.src} | \`${img.html.substring(0, 80)}\` |`);
            }
        }

        return lines.join("\n");
    }
}

export default SeoAnalyzer;
