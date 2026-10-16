import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = (path: string) => fileURLToPath(new URL(`./lib/src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^gamesir-hid$/, replacement: source("index.ts") },
      { find: /^gamesir-hid\/node$/, replacement: source("transport/node-hid.ts") },
    ],
  },
});
