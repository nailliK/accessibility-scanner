import * as URL from "url";
import cheerio from "cheerio";
import puppeteer from "puppeteer";
import _ from "lodash";
import AxePuppeteer from "axe-puppeteer";
import request from "request";
import PageBuilder from "./PageBuilder.js";


/**
 * Scanner Class
 *
 * @property {string} this.url          - Top-level URL for scanning
 * @property {string} this.urlRegex     - Regex to test against legal URL strings
 * @property {object} this.axeOptions   - Global options for Axe scanner
 */
class Scanner {
	url = "";
	urlRegex = /^[A-Za-z0-9 /.?=\-:&]+$/;
	axeOptions = {
		reporter: "v2",
		runOnly: {
			type: "tag",
			values: [
				"wcag2a",
				"wcag2aa",
				"wcag21aa",
				"section508"
			]
		}
	};
	browser = {};
	page = {};
	scans = [];
	pageBuilder = new PageBuilder();

	/**
	 * Constructor function
	 *
	 * @param url
	 */
	constructor(url) {
		this.url = url;
	}

	/**
	 * Generate UUID for unique IDs
	 *
	 * @returns {string}
	 */
	uuid() {
		// Generate UUID for unique IDs
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
			/[xy]/g,
			function (c) {
				var r = Math.random() * 16 | 0,
					v = c == "x" ? r : (r & 0x3 | 0x8);
				return v.toString(16);
			}
		);
	}

	/**
	 * Parse URL for top-level domain without www
	 *
	 * @param url
	 * @returns {string}
	 */
	getHostname(url) {
		const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
		if (
			match != null
			&& match.length > 2
			&& typeof match[2] === "string"
			&& match[2].length > 0
		) {
			return match[2];
		}
	}

	/**
	 * URL Resolver
	 *
	 * @param url
	 * @returns {Promise<void>}
	 */
	async getResolvedURL(url) {
		request.get(url, {followAllRedirects: 1}, (err, res) => {
			console.log(res.request.uri);
		});
	}

	/**
	 * Error logging
	 *
	 * @param {object} err
	 * @param {string} query
	 */
	logErr(err, query = "") {
		console.log("----------");
		console.log("ERROR");
		console.log(err);
		if (query !== "") {
			console.log("QUERY");
			console.log(query);
			console.log("----------");
		}
	}

	/**
	 * Send digested scan results data back to WordPress
	 *
	 * @param {array} scans
	 * @param {string} email
	 * @param {array} violations
	 * @param {number} formId
	 * @returns {Promise<void>}
	 */

	/**
	 * Link parsing
	 * Uses Cheerio to iterate over HTML to find anchor tags. Tag HREFs are
	 * resolved to the base site URL and challenged using this.urlRegex. If tests
	 * are passed, a new scan object is added to the scans array for future use
	 *
	 * @async
	 * @param {string} html
	 * @returns {Promise<void>}
	 */
	async parseLinks(html) {
		const $ = cheerio.load(html);
		$("a")
			.each((i, elem) => {
				// Disregard anchors without HREF attributes
				if (typeof $(elem)
					.attr("href") !== "undefined") {

					// Get HREF; remove hashes to prevent redundant scans
					const unresolvedHref = $(elem)
						.attr("href")
						.split("#")[0];
					// Resolve HREF to baseURL if unresolvedHref
					// is root-relative and not canonical
					const resolvedHref = URL.resolve(this.url, unresolvedHref);

					// Challenge URL against regex, check for existence of base URL,
					// disregard redundant scans
					if (resolvedHref.includes(this.url)
						&& this.urlRegex.test(resolvedHref)
						&& _.find(this.scans, {url: resolvedHref}) === undefined) {
						this.scans.push({
							id: this.uuid(),
							url: resolvedHref,
							complete: 0,
							error: 0,
							violations: []
						});
						console.log(`Adding ${resolvedHref}`);
					}
				}
			});

	}

	/**
	 * Recursive scan
	 * Injects Axe into browser Page and scans page according to rules/spec
	 * defined in this.axeOptions. Sends rendered page HTML to this.parseLinks
	 * to parse page for new anchor tags.
	 *
	 * @async
	 * @returns {Promise<array<object>>} violations
	 */
	async scan() {
		// Check if scans already exist. If not, create one with the base URL.
		if (this.scans.length === 0) {
			this.scans.push({
				id: this.uuid(),
				url: this.url,
				complete: 0,
				error: 0,
				violations: []
			});
		}

		// Query for next scan
		let currentScan = _.find(this.scans, {complete: 0});

		// If pages are all scanned stop scan and update the data
		if (currentScan === undefined) {
			await this.browser.close();

			// Send data to be rendered for analysis
			await this.pageBuilder.init(this.url, this.scans);

			console.log("----------");
			console.log("COMPLETED SCAN");
			console.log("--------------------");

			return true;
		}

		// Navigate to next page
		try {
			console.log(`loading ${currentScan.url}`);
			await this.page.goto(
				currentScan.url,
				{
					waitUntil: "load",
					timeout: 0
				}
			);

			console.log(`scanning: ${currentScan.url}`);

			// Get page HTML and parse the page for new links
			const HTML = await this.page.evaluate(() => document.body.innerHTML);
			console.log(`parsing links: ${currentScan.url}`);
			this.parseLinks(HTML);

			// Pass the page to Axe for analyzing
			try {
				// Scan results object
				console.log(`analyzing: ${currentScan.url}`);
				let results = await new AxePuppeteer.AxePuppeteer(this.page)
					.configure(this.axeOptions)
					.analyze();

				// Parse each violation and add to the violations array
				results.violations.forEach((v) => {
					currentScan.violations.push({
						id: this.uuid(),
						impact: v.impact,
						tags: v.tags,
						description: v.description,
						help_url: v.helpUrl,
						help: v.help,
						nodes: v.nodes.map((n) => {
							return {
								html: n.html,
								target: n.target[0]
							};
						})
					});
				});
			} catch (err) {
				this.logErr(err);
				currentScan.error = 1;
			}
		} catch (err) {
			this.logErr(err);
			currentScan.error = 1;
		} finally {
			// Execute the next scan
			currentScan.complete = 1;
			await this.scan();
		}

	}

	/**
	 * Initialize scan.
	 * Creates a new Puppeteer browser instance
	 * Executes the first scan
	 *
	 * @async

	 * @returns {Promise<void>}
	 */
	async init() {

		// Create a browser and set up a page
		this.browser = await puppeteer.launch();
		this.page = await this.browser.newPage();
		await this.page.setBypassCSP(true);
		await this.page.setViewport({
			width: 1440,
			height: 1024
		});

		await this.scan();
	}
}

export default Scanner;
