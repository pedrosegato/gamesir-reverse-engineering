// Splits the modules of a webpack 4 bundle without running any of them.
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const [src, outDir] = process.argv.slice(2);
let code = fs.readFileSync(src, "utf8");
const m = code.match(/t\(t\.s=(\d+)\)\}\(/);
if (!m) throw new Error("bootstrap not found");
code = code.replace(m[0], "e}(");
const ctx = { module: { exports: null } };
vm.runInNewContext(code, ctx);
const mods = ctx.module.exports;
const index = [];
for (const k of Object.keys(mods)) {
  const s = mods[k].toString();
  const ext = (s.match(/require\("([^"]+)"\)/) || [])[1];
  fs.writeFileSync(path.join(outDir, `m${k}.js`), `x=${s}\n`);
  index.push(`${k}\t${s.length}\t${ext || ""}`);
}
fs.writeFileSync(path.join(outDir, "INDEX.tsv"), `${index.join("\n")}\n`);
console.log("entry", m[1], "modules", Object.keys(mods).length);
