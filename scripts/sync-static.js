// Přepíše statické texty s atributem data-cfg v index.html hodnotami z lab/params.js.
// Použití: npm run sync  (po každé změně dat v params.meta). Test v tests/engine.test.js hlídá shodu.
"use strict";
const fs = require("fs");
const path = require("path");
const P = require("../lab/params.js");
const file = path.join(__dirname, "..", "index.html");
const RE = /(<(\w+)\b[^>]*\bdata-cfg="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g;
let html = fs.readFileSync(file, "utf8");
let n = 0;
html = html.replace(RE, (m, open, tag, key, text, close) => {
  const v = P.meta[key];
  if (typeof v !== "string" || !v) throw new Error("params.meta." + key + " chybí");
  n++;
  return open + v + close;
});
fs.writeFileSync(file, html);
console.log("data-cfg: " + n + " prvků srovnáno s params.meta");
