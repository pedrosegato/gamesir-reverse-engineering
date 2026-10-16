import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./data-dir.js";

export const LOG_FILE = join(DATA_DIR, "log.txt");

export function startLog(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LOG_FILE, "");
}

export function log(line: string): void {
  try {
    appendFileSync(LOG_FILE, `${new Date().toLocaleString("pt-BR")}  ${line}\n`);
  } catch {}
}
