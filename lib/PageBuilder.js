import handlebars from "handlebars";
import fs from "fs";


class PageBuilder {
	url = "";
	scans = [];

	async buildTOC() {

		this.scans.forEach((scan) => {
			scan.violationsLength = 0;
			if (scan.results !== null) {
				scan.violationsLength = scan.violations.length;
			}
		});

		fs.readFile("templates/output.hbs", "utf8", (err, source) => {
			const template = handlebars.compile(source);
			const output = template({
				url: this.url,
				scans: this.scans
			});

			fs.writeFile("build/index.html", output, err => {
				if (err) {
					console.log(err);
				}

			});
		});

	}

	async init(url, scans) {
		this.url = url;
		this.scans = scans;
		await this.buildTOC();
	}

}

export default PageBuilder;
