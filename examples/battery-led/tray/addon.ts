import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAsset } from "node:sea";
import { DATA_DIR } from "./data-dir.js";

/**
 * Native modules cannot load from inside the executable: the `.node` embedded as a SEA asset is extracted
 * once to a folder named after its content hash and loaded from there.
 */
export function loadAddon(name: string): unknown {
  const bytes = new Uint8Array(getAsset(name));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const dir = join(DATA_DIR, "native");
  const file = join(dir, `${hash}-${name}`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    const partial = `${file}.${process.pid}`;
    writeFileSync(partial, bytes);
    renameSync(partial, file);
  }
  const module = { exports: {} };
  process.dlopen(module, file);
  return module.exports;
}
