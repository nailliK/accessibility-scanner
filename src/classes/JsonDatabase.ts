import fs from "fs";
import path from "path";
import LooseObject from "@/interfaces/LooseObject";
import JsonDatabaseOptions from "@/interfaces/JsonDatabaseOptions";

class JsonDatabase {
	public databaseName: string | undefined;
	private options: JsonDatabaseOptions;

	constructor(databaseName: string, options: JsonDatabaseOptions) {
		this.databaseName = databaseName;
		this.options = options;

		if (typeof this.databaseName !== "undefined") {
			if (!fs.existsSync(path.resolve(process.cwd(), "data"))) {
				fs.mkdirSync(path.resolve(process.cwd(), "data"));
			}

			if (!fs.existsSync(path.resolve(process.cwd(), "data", `${this.databaseName}.json`))) {
				fs.writeFileSync(path.resolve(process.cwd(), "data", `${this.databaseName}.json`), JSON.stringify({}));
			}
		}
	}

	public read = (attribute: string): Promise<any> => {
		return new Promise(async (resolve, reject) => {
			const jsonString: string = fs.readFileSync(path.resolve(process.cwd(), "data", `${this.databaseName}.json`), "utf-8");
			let jsonData: LooseObject = {};
			if (jsonString.length > 0) {
				jsonData = JSON.parse(jsonString);
			}

			if (typeof this.options.mutations !== "undefined") {
				const mutator = this.options.mutations.find((m) => {
					return m.attribute = attribute;
				});

				if (typeof mutator !== "undefined" && typeof jsonData[attribute] !== "undefined") {
					jsonData[attribute] = mutator.mutation(jsonData[attribute]);
				}
			}

			resolve(jsonData[attribute]);
		});
	};

	public write = async (attribute: string, data: any): Promise<boolean> => {
		return new Promise((resolve, reject) => {
			const jsonString: string = fs.readFileSync(path.resolve(process.cwd(), "data", `${this.databaseName}.json`), "utf-8");
			let jsonData: LooseObject = {};
			if (jsonString.length > 0) {
				jsonData = JSON.parse(jsonString);
			}

			jsonData[attribute] = data;
			fs.writeFileSync(path.resolve(process.cwd(), "data", `${this.databaseName}.json`), JSON.stringify(jsonData));

			resolve(true);
		});
	};
}

export default JsonDatabase;
