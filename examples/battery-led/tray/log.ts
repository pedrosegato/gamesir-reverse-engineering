import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./data-dir.js";

export const LOG_FILE = join(DATA_DIR, "log.txt");
/** Started over past this size, so an app left running for months cannot fill the disk. */
const MAX_LOG_BYTES = 1_000_000;

let previous = "";

export function startLog(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LOG_FILE, "");
}

export function log(line: string): void {
  if (line === previous) return;
  previous = line;
  try {
    if ((statSync(LOG_FILE, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) writeFileSync(LOG_FILE, "");
    appendFileSync(LOG_FILE, `${new Date().toLocaleString("pt-BR")}  ${line}\n`);
  } catch {}
}
