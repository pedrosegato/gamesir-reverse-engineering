import { tmpdir } from "node:os";
import { join } from "node:path";

export const DATA_DIR = join(process.env.LOCALAPPDATA ?? tmpdir(), "cyclone2-battery");
