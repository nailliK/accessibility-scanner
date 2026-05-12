import fs from "fs";
import path from "path";
import {ScanState} from "#/interfaces/Scan";

const STATE_FILENAME = "state.json";

function statePath(outputDir: string): string {
    return path.join(outputDir, STATE_FILENAME);
}

export async function scanExists(outputDir: string): Promise<boolean> {
    return fs.existsSync(statePath(outputDir));
}

export async function loadState(outputDir: string): Promise<ScanState | null> {
    const file = statePath(outputDir);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as ScanState;
}

export async function saveState(outputDir: string, state: ScanState): Promise<void> {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
    }
    fs.writeFileSync(statePath(outputDir), JSON.stringify(state, null, 2));
}
