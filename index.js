import Scanner from "./lib/Scanner.js";
import request from "request";
import readline from "readline";

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

rl.question("Please enter the full website URL that you'd like to scan: \n", (url) => {
	if (url) {
		// Resolve url and start scan
		request.get(url, async function () {
			console.log("URL resolved. Initializing scan");

			url = `${this.uri.protocol}//${this.uri.hostname}`;
			const scanner = new Scanner(url);
			await scanner.init();
		});
	}
});
