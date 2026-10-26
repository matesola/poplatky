// Regrese evropských dat: porovná COUNTRIES, TIMELINE a MAP v aktuálním index.html
// s původní evropskou verzí (commit 4718d17) a s main. Spuštění: node tests/regression-data.js [ref ...]
"use strict";
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");

function extract(html) {
  const out = {};
  for (const [name, next] of [["COUNTRIES", "var TIMELINE"], ["TIMELINE", "var MAP"], ["MAP", null]]) {
    const i = html.indexOf("var " + name + " =");
    if (i < 0) throw new Error(name + " nenalezeno");
    const ends = [html.indexOf("</script>", i), next ? html.indexOf(next, i) : -1].filter((x) => x > 0);
    const src = html.slice(i, Math.min.apply(null, ends));
    const ctx = {}; vm.createContext(ctx); vm.runInContext(src.replace("var " + name, "this." + name), ctx);
    out[name] = ctx[name];
  }
  return out;
}
function diff(a, b, p, acc) {
  if (JSON.stringify(a) === JSON.stringify(b)) return acc;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + "." + k, acc);
  } else acc.push(p + ": " + JSON.stringify(a).slice(0, 80) + " → " + JSON.stringify(b).slice(0, 80));
  return acc;
}
const cur = extract(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const refs = process.argv.slice(2).length ? process.argv.slice(2) : ["4718d17", "main"];
let bad = 0;
const report = { current: { countries: cur.COUNTRIES.length, timeline: cur.TIMELINE.length }, refs: {} };
for (const ref of refs) {
  const old = extract(execSync("git show " + ref + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 }));
  const d = { COUNTRIES: diff(old.COUNTRIES, cur.COUNTRIES, "COUNTRIES", []), TIMELINE: diff(old.TIMELINE, cur.TIMELINE, "TIMELINE", []), MAP: diff(old.MAP, cur.MAP, "MAP", []) };
  report.refs[ref] = d;
  const n = d.COUNTRIES.length + d.TIMELINE.length + d.MAP.length;
  bad += n;
  console.log(`${ref}: COUNTRIES ${old.COUNTRIES.length}→${cur.COUNTRIES.length}, TIMELINE ${old.TIMELINE.length}→${cur.TIMELINE.length}, rozdílů ${n}`);
  for (const k of Object.keys(d)) d[k].slice(0, 20).forEach((x) => console.log("  " + x));
}
fs.writeFileSync(path.join(__dirname, "regression-data-results.json"), JSON.stringify(report, null, 1));
process.exit(bad ? 1 : 0);
