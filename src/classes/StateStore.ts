import {ScanState} from "#/interfaces/Scan";
import {StateBackend} from "#/interfaces/StateStore";
import * as couch from "./CouchDbClient";
import * as json from "./JsonStateStore";

class StateStore {
    constructor(private backend: StateBackend, private outputDir: string) {}

    public async scanExists(domain: string): Promise<boolean> {
        return this.backend === "json"
            ? json.scanExists(this.outputDir)
            : couch.scanExists(domain);
    }

    public async loadState(domain: string): Promise<ScanState | null> {
        return this.backend === "json"
            ? json.loadState(this.outputDir)
            : couch.loadState(domain);
    }

    public async saveState(state: ScanState): Promise<void> {
        return this.backend === "json"
            ? json.saveState(this.outputDir, state)
            : couch.saveState(state);
    }
}

export function parseStorageFlag(args: string[], fallback: StateBackend = "json"): StateBackend {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--storage" && args[i + 1]) {
            const value = args[i + 1].toLowerCase();
            if (value === "json" || value === "couchdb") return value;
        } else if (arg.startsWith("--storage=")) {
            const value = arg.slice("--storage=".length).toLowerCase();
            if (value === "json" || value === "couchdb") return value;
        }
    }
    return fallback;
}

export default StateStore;
