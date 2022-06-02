import AccessibilityScanner from "./classes/AccessibilityScanner";
import clear from "clear";
import * as readline from "readline";
import {Interface} from "readline";
import chalk from "chalk";
import axios, {AxiosResponse} from "axios";
import MessageLogger from "./classes/MessageLogger";
import Handlebars from "handlebars";
import {readFileSync, writeFileSync} from "fs";
import open from "open";

// Message logger
const messageLogger: MessageLogger = new MessageLogger();

// Declare Accessibility Scanner module
const accessibilityScanner: AccessibilityScanner = new AccessibilityScanner();

// Declare CLI interface
const rl: Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Output fancy title
const printTitle = (): void => {
    console.log(chalk`
+------------------------------------------------------------------------------+
|                                                                              |
|                            {green Accessibility Scanner}                             |
|                                                                              |
+-------------------------------==[ {yellow v.0.0.2} ]==--------------------------------+
`);
};

// Ask the user for a base scan URL
const getUrl = async (): Promise<URL> => {
    return new Promise((resolve, reject) => {
        rl.question("Please enter scan base URL (https://www.example.com): ", (urlString) => {
            try {
                const url: URL = new URL(urlString);
                resolve(url);
            } catch (error) {
                reject(error);
            }
        });
    });
};

// Test base scan URL for a valid 200 status code
const resolveURL = (url: URL): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {

        try {
            const testResponse: AxiosResponse = await axios.request({
                method: "head",
                timeout: 30000,
                url: `${url.protocol}//${url.hostname}`
            });

            resolve(testResponse.status === 200);
        } catch {
            reject(false);
        }
    });
};


const init = async (): Promise<void> => {
    // Ask user for base scan URL
    try {
        console.log("checking for valid URL");
        const url: URL = await getUrl();
        messageLogger.logSuccess(`${url} is a valid url.`);

        // Ensure base scan URL resolves properly
        try {
            console.log("Attempting to resolve URL");
            await resolveURL(url);
            messageLogger.logSuccess(`${url} is resolving properly.`);
        } catch (error) {
            messageLogger.logFailure(`Base URL did not resolve.`);
            process.exit();
        }

        // Initiate scan
        try {
            console.log("Beginning Scan");
            await accessibilityScanner.init(url);
            buildOutput();
            messageLogger.logSuccess(`Scan Complete!`);
            await open("./output/scan-results.html");
        } catch (error: any) {
            messageLogger.logFailure(error);

        }

    } catch (error: any) {
        messageLogger.logFailure(error);
    } finally {
        process.exit();
    }
};

const buildOutput = (): void => {
    const source = readFileSync("./src/templates/scan-results.html", "utf-8");
    const template = Handlebars.compile(source);
    const context = {scans: accessibilityScanner.scans};
    const html = template(context);
    writeFileSync("./output/scan-results.html", html);
};

clear();
printTitle();
init();
