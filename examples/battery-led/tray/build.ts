import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build, type Plugin } from "esbuild";
import { toRgb } from "gamesir-hid";
import * as ResEdit from "resedit";
import { icoFile } from "./icon.js";

const require = createRequire(import.meta.url);
const { inject } = require("postject") as {
  inject(file: string, resource: string, data: Buffer, options: { sentinelFuse: string }): Promise<void>;
};

const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const LANG_EN_US = 1033;
const APP_ICON = toRgb("#00ff00");
const ICON_SIZES = [16, 24, 32, 48, 64, 256];

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");

const { values } = parseArgs({
  options: {
    version: { type: "string", default: "0.0.0" },
    node: { type: "string", default: process.execPath },
    target: { type: "string", default: `${process.platform}-${process.arch}` },
  },
});
if (!/^\d+\.\d+\.\d+$/.test(values.version)) throw new Error(`invalid version: ${values.version}`);
const [platform, arch] = values.target.split("-");
const exe = join(dist, platform === "win32" ? "cyclone2-battery.exe" : "cyclone2-battery");

function addons(): Record<string, string> {
  const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
  return {
    "node-hid.node": join(packageDir("node-hid"), "prebuilds", `HID-${platform}-${arch}`, "node-napi-v4.node"),
    "koffi.node": join(packageDir(`@koromix/koffi-${platform}-${arch}`), `${platform}_${arch}`, "koffi.node"),
  };
}

/** The node-hid and koffi loaders look for the `.node` file on disk; in the executable it comes from the SEA assets. */
const seaAddons: Plugin = {
  name: "sea-addons",
  setup(esbuild) {
    esbuild.onResolve({ filter: /^pkg-prebuilds\/bindings$/ }, () => ({
      path: "node-hid.node",
      namespace: "sea-addon",
    }));
    esbuild.onResolve({ filter: /^koffi$/ }, () => ({ path: "koffi.node", namespace: "sea-addon" }));
    esbuild.onLoad({ filter: /.*/, namespace: "sea-addon" }, ({ path }) => {
      const load = `require(${JSON.stringify(join(here, "addon.ts"))}).loadAddon(${JSON.stringify(path)})`;
      const contents = path === "koffi.node" ? `module.exports = ${load};` : `module.exports = () => ${load};`;
      return { contents, loader: "js", resolveDir: here };
    });
  },
};

async function bundle(outfile: string): Promise<void> {
  await build({
    entryPoints: [join(here, "main.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    tsconfig: join(here, "..", "..", "tsconfig.json"),
    plugins: [seaAddons],
    logLevel: "warning",
  });
}

/** V8's code cache is only valid for the binary that generated the blob. */
function seaBlob(main: string, output: string): void {
  const config = join(dist, "sea-config.json");
  const useCodeCache = values.node === process.execPath;
  const assets = addons();
  writeFileSync(config, JSON.stringify({ main, output, disableExperimentalSEAWarning: true, useCodeCache, assets }));
  execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });
}

function brand(file: string): void {
  const executable = ResEdit.NtExecutable.from(readFileSync(file), { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(executable);

  const icon = ResEdit.Data.IconFile.from(icoFile(APP_ICON, ICON_SIZES));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    1,
    LANG_EN_US,
    icon.icons.map((item) => item.data),
  );

  const [info] = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  const language = { lang: LANG_EN_US, codepage: 1200 };
  info.setStringValues(language, {
    FileDescription: "Cyclone 2 Battery",
    ProductName: "Cyclone 2 Battery",
    InternalName: "cyclone2-battery",
    OriginalFilename: "cyclone2-battery.exe",
    FileVersion: values.version,
    ProductVersion: values.version,
  });
  info.removeStringValue(language, "CompanyName");
  const [major, minor, patch] = values.version.split(".").map(Number);
  info.setFileVersion(major, minor, patch, 0, LANG_EN_US);
  info.setProductVersion(major, minor, patch, 0, LANG_EN_US);
  info.outputToResourceEntries(resources.entries);

  resources.outputResource(executable);
  writeFileSync(file, Buffer.from(executable.generate()));
}

/** Without this Windows opens a console window next to the app. */
function setGuiSubsystem(file: string): void {
  const image = readFileSync(file);
  const pe = image.readUInt32LE(0x3c);
  if (image.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error(`${file} is not a PE executable`);
  const optionalHeader = pe + 4 + 20;
  image.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, optionalHeader + 68);
  writeFileSync(file, image);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const main = join(dist, "app.cjs");
const blob = join(dist, "app.blob");

await bundle(main);
seaBlob(main, blob);
copyFileSync(values.node, exe);
if (platform === "win32") brand(exe);
await inject(exe, "NODE_SEA_BLOB", readFileSync(blob), { sentinelFuse: SEA_FUSE });
if (platform === "win32") setGuiSubsystem(exe);
console.log(`${exe}: ${(statSync(exe).size / 2 ** 20).toFixed(1)} MB`);
