import "dotenv/config";
import nano, {DocumentScope} from "nano";
import {ScanDoc, ScanState} from "#/interfaces/Scan";

const COUCHDB_USER = process.env.COUCHDB_USER || "";
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || "";
const COUCHDB_HOST = process.env.COUCHDB_HOST || "localhost";
const COUCHDB_PORT = process.env.COUCHDB_PORT || "5984";
const COUCHDB_DATABASE = process.env.COUCHDB_DATABASE || "accessibility_scans";

let dbInstance: DocumentScope<ScanDoc> | undefined;
const revCache = new Map<string, string>();

async function getDb(): Promise<DocumentScope<ScanDoc>> {
    if (dbInstance) return dbInstance;

    const auth = COUCHDB_USER && COUCHDB_PASSWORD
        ? `${encodeURIComponent(COUCHDB_USER)}:${encodeURIComponent(COUCHDB_PASSWORD)}@`
        : "";
    const url = `http://${auth}${COUCHDB_HOST}:${COUCHDB_PORT}`;
    const server = nano(url);

    try {
        await server.db.get(COUCHDB_DATABASE);
    } catch (err: any) {
        if (err.statusCode === 404) {
            await server.db.create(COUCHDB_DATABASE);
        } else {
            throw err;
        }
    }

    dbInstance = server.db.use<ScanDoc>(COUCHDB_DATABASE);
    return dbInstance;
}

function docIdForDomain(domain: string): string {
    return domain.replace(/\//g, "_");
}

export async function scanExists(domain: string): Promise<boolean> {
    const db = await getDb();
    try {
        await db.head(docIdForDomain(domain));
        return true;
    } catch (err: any) {
        if (err.statusCode === 404) return false;
        throw err;
    }
}

export async function loadState(domain: string): Promise<ScanState | null> {
    const db = await getDb();
    const id = docIdForDomain(domain);
    try {
        const doc = await db.get(id);
        if (doc._rev) revCache.set(id, doc._rev);
        return {
            domain: doc.domain || domain,
            baseURL: doc.baseURL || "",
            entries: doc.entries || [],
            analyzerResults: doc.analyzerResults || {},
            domainResults: doc.domainResults || {}
        };
    } catch (err: any) {
        if (err.statusCode === 404) return null;
        throw err;
    }
}

export async function saveState(state: ScanState): Promise<void> {
    if (!state.domain) return;
    const db = await getDb();
    const id = docIdForDomain(state.domain);

    const buildBody = (rev: string | undefined): ScanDoc => ({
        _id: id,
        ...(rev ? {_rev: rev} : {}),
        type: "scan",
        domain: state.domain,
        baseURL: state.baseURL,
        updatedAt: new Date().toISOString(),
        entries: state.entries,
        analyzerResults: state.analyzerResults,
        domainResults: state.domainResults
    });

    try {
        const result = await db.insert(buildBody(revCache.get(id)));
        revCache.set(id, result.rev);
    } catch (err: any) {
        if (err.statusCode !== 409) throw err;
        // Conflict: refresh _rev and retry once.
        const existing = await db.get(id);
        const result = await db.insert(buildBody(existing._rev));
        revCache.set(id, result.rev);
    }
}
