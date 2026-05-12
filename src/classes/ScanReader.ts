import nano, {DocumentScope, ServerScope} from "nano";
import {Scan, ScanDoc, ScanReaderOptions, assembleScan} from "#/interfaces/Scan";

function buildUrl(options: ScanReaderOptions): string {
    if (options.url) return options.url;
    const user = options.user ?? process.env.COUCHDB_USER ?? "";
    const password = options.password ?? process.env.COUCHDB_PASSWORD ?? "";
    const host = options.host ?? process.env.COUCHDB_HOST ?? "localhost";
    const port = options.port ?? process.env.COUCHDB_PORT ?? "5984";
    const auth = user && password
        ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
        : "";
    const envUrl = process.env.COUCHDB_URL;
    if (envUrl) return envUrl;
    return `http://${auth}${host}:${port}`;
}

function hostnameFromInput(input: string): string {
    if (!input.includes("://") && !input.includes("/")) return input;
    try {
        const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
        return url.hostname;
    } catch {
        return input;
    }
}

function docIdForDomain(domain: string): string {
    return domain.replace(/\//g, "_");
}

class ScanReader {
    private server: ServerScope;
    private db: DocumentScope<ScanDoc>;

    constructor(options: ScanReaderOptions = {}) {
        const url = buildUrl(options);
        const dbName = options.database
            ?? process.env.COUCHDB_DATABASE
            ?? "accessibility_scans";
        this.server = nano(url);
        this.db = this.server.db.use<ScanDoc>(dbName);
    }

    public async getByUrl(input: string): Promise<Scan | null> {
        const domain = hostnameFromInput(input);
        try {
            const doc = await this.db.get(docIdForDomain(domain));
            return assembleScan({
                domain: doc.domain || domain,
                baseURL: doc.baseURL || "",
                updatedAt: doc.updatedAt,
                entries: doc.entries || [],
                analyzerResults: doc.analyzerResults || {},
                domainResults: doc.domainResults || {}
            });
        } catch (err: any) {
            if (err.statusCode === 404) return null;
            throw err;
        }
    }

    public async listDomains(): Promise<string[]> {
        const list = await this.db.list();
        return list.rows
            .map(r => r.id)
            .filter(id => !id.startsWith("_"))
            .sort();
    }
}

export default ScanReader;
