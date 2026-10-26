// Regresní testy celé stránky (Playwright + Chromium) nad statickými soubory, které jdou na Vercel.
// Spuštění: npm run e2e   (vyžaduje nainstalovaný balíček playwright s Chromiem)
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { console.error("Chybí balíček playwright (npm i -D playwright && npx playwright install chromium)."); process.exit(2); }

const ROOT = path.join(__dirname, "..");
const IGNORE = fs.existsSync(path.join(ROOT, ".vercelignore")) ? fs.readFileSync(path.join(ROOT, ".vercelignore"), "utf8").split(/\r?\n/).filter(Boolean) : [];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      if (IGNORE.some((g) => rel.startsWith(g.replace(/\/$/, "")))) { res.writeHead(404); return res.end(); }
      const f = path.join(ROOT, rel);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve(srv));
  });
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("ok   " + name); }
  catch (e) { results.push({ name, ok: false, err: String(e && e.message || e) }); console.log("FAIL " + name + "\n     " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assert"); }
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, " ").trim();
const kc = (s) => Number(String(s).replace(/[^\d-]/g, ""));

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  for (const [vp, label] of [[{ width: 1366, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobil"]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: label === "mobil", hasTouch: label === "mobil", deviceScaleFactor: label === "mobil" ? 2 : 1 });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await p.goto(base, { waitUntil: "load" });

    await t(`[${label}] úvodní statistiky mají skutečná čísla`, async () => {
      const nums = await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/\s+/g, "")));
      assert(nums.join("|") === "103let|€363|17|546", nums.join("|"));
    });
    await t(`[${label}] evropský přehled: mapa, žebříček, karty zemí`, async () => {
      assert((await p.$$("#mapSvg path.c")).length >= 40, "mapa");
      assert((await p.$$("#mapSvg rect.dotm")).length === 5, "mikrostáty");
      assert((await p.$$("#barChart .bar-row:not(.out)")).length >= 18, "žebříček");
      assert((await p.$$("#countryGrid .ccard")).length === 45, "karty");
      await p.fill("#countrySearch", "svycar"); await p.waitForTimeout(150);
      assert((await txt(p, "#countryCount")).startsWith("Zobrazeno 2 ze 45"), "hledání");
      await p.fill("#countrySearch", ""); await p.waitForTimeout(150);
    });
    await t(`[${label}] detail země a přímý odkaz #zeme-CZ`, async () => {
      const q = await ctx.newPage(); await q.goto(base + "#zeme-CZ"); await q.waitForTimeout(600);
      assert((await txt(q, "#dlgName")) === "Česko", "dialog");
      await q.close();
    });
    await t(`[${label}] přímý odkaz #kalkulacka po načtení míří na kalkulačku`, async () => {
      const q = await ctx.newPage(); await q.goto(base + "#kalkulacka"); await q.waitForTimeout(800);
      const top = await q.$eval("#kalkulacka", (e) => e.getBoundingClientRect().top);
      assert(top > -5 && top < 160, "pozice " + top);
      await q.close();
    });
    await t(`[${label}] vstup z úvodu vede do kalkulačky`, async () => {
      const href = await p.getAttribute(".cz-cta", "href"); assert(href === "#kalkulacka", href);
    });

    // výchozí stav kalkulačky: 45 000 + 36 000 Kč, dva zaměstnanci
    await t(`[${label}] determinismus: dvě načtení dávají shodné výsledky`, async () => {
      const a = await txt(p, "#hhOut"), b = await txt(p, "#simOut");
      const q = await ctx.newPage(); await q.goto(base); await q.waitForTimeout(400);
      assert(a === await txt(q, "#hhOut") && b === await txt(q, "#simOut"), "liší se");
      await q.close();
    });
    await t(`[${label}] výstupy odpovídají jádru (A, C, graf A)`, async () => {
      const exp = await p.evaluate(() => {
        const P = window.POPLATKY_PARAMS, E = window.PoplatkyEngine;
        const h = { adults: [{ type: "emp", grossMonthly: 45000 }, { type: "emp", grossMonthly: 36000 }] };
        const c = E.compareHousehold(P, h, P.levyDefault);
        return { cur: c.current.annual, levy: Math.round(c.levy.total), pc: E.payCurve(P, P.levyDefault, [45000])[0] };
      });
      const c = await txt(p, "#hhOut .res.c .res-big"); assert(kc(c) === exp.levy, c + " vs " + exp.levy);
      const ra = await txt(p, "#readA"); assert(ra.includes(Math.round(exp.pc.levy).toLocaleString("cs-CZ").replace(/\s/g, " ")) || kc(ra.split("C · odvod")[1]) === Math.round(exp.pc.levy), ra);
    });
    await t(`[${label}] změna příjmu aktualizuje výsledek C`, async () => {
      const before = await txt(p, "#hhOut .res.c .res-big");
      await p.fill("#inc0", "90000"); await p.waitForTimeout(100);
      const after = await txt(p, "#hhOut .res.c .res-big");
      assert(before !== after, "beze změny");
      await p.fill("#inc0", "45000");
    });
    await t(`[${label}] výjimky: slepota u všech dospělých vs. smíšená domácnost`, async () => {
      const boxes = await p.$$('#adultRows [data-f="sensory"]');
      await boxes[0].check(); await p.waitForTimeout(50);
      assert((await txt(p, "#hhOut .res.a .res-mid")).startsWith("2 460"), "smíšená domácnost má platit");
      await (await p.$$('#adultRows [data-f="sensory"]'))[1].check(); await p.waitForTimeout(50);
      assert(kc(await txt(p, "#hhOut .res.a .res-mid")) === 0, "oba dospělí → 0");
      for (const b of await p.$$('#adultRows [data-f="sensory"]')) await b.uncheck();
    });
    await t(`[${label}] výjimky: příjmový test je podmíněný (pravděpodobně / hranice)`, async () => {
      await p.click('#adultRows .adult[data-i="1"] [data-f="rm"]');
      await p.selectOption("#adultRows select", "pens");
      await p.fill("#inc0", "8000"); await p.waitForTimeout(50);
      assert((await txt(p, "#hhOut .status")).startsWith("Pravděpodobně"), "pravděpodobně");
      await p.fill("#inc0", "11825"); await p.waitForTimeout(50);
      assert((await txt(p, "#hhOut .status")).startsWith("Na hranici"), "hranice");
      await p.fill("#inc0", "30000"); await p.waitForTimeout(50);
      assert((await txt(p, "#hhOut .status")) === "Platíte", "platí");
      await p.selectOption("#adultRows select", "emp"); await p.fill("#inc0", "45000");
      await p.click("#addAdult"); await p.waitForTimeout(50);
    });
    await t(`[${label}] neplatný vstup příjmu nezpůsobí pád ani NaN`, async () => {
      for (const v of ["-5000", "1e12", "", "999999999"]) {
        await p.fill("#inc0", v); await p.waitForTimeout(30);
        const o = await txt(p, "#simulace"); assert(!/NaN|undefined|Infinity/.test(o), "v=" + v);
      }
      await p.fill("#inc0", "45000");
    });
    await t(`[${label}] hraniční sazba a strop: nula dává nulový výnos`, async () => {
      await p.evaluate(() => { const r = document.getElementById("pRate"); r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true })); });
      await p.waitForTimeout(400);
      assert((await txt(p, "#simOut .kpi .v")).startsWith("0,0"), await txt(p, "#simOut .kpi .v"));
      await p.evaluate(() => { const r = document.getElementById("pRate"); r.value = "0.011"; r.dispatchEvent(new Event("input", { bubbles: true })); });
      await p.evaluate(() => { const r = document.getElementById("pCap"); r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true })); });
      await p.waitForTimeout(400);
      assert((await txt(p, "#simOut .kpi .v")).startsWith("0,0"), "strop 0");
      await p.evaluate(() => { const r = document.getElementById("pCap"); r.value = "3000"; r.dispatchEvent(new Event("input", { bubbles: true })); });
      await p.waitForTimeout(400);
    });
    await t(`[${label}] simulace nezobrazí neplatný výsledek potichu`, async () => {
      const r = await p.evaluate(() => { const E = window.PoplatkyEngine, P = window.POPLATKY_PARAMS; return E.simulate(P, Object.assign({}, P.levyDefault, { rate: NaN }), 7e9); });
      assert(r.valid === false && !r.mid, "engine");
      const v = await txt(p, "#simOut .verdict .vt"); assert(/POKRYJE|NEJISTÉ|NEPOKRYJE|Pokryje|Nejisté|Nepokryje/.test(v), v);
    });
    await t(`[${label}] kalibrace sazby dá hodnotu a nastaví posuvník`, async () => {
      await p.click("#calRate"); await p.waitForTimeout(600);
      const o = await txt(p, "#calOut"); assert(/Sazba pro cíl .* %/.test(o), o);
    });
    await t(`[${label}] graf C a D jsou vykreslené s daty`, async () => {
      assert((await p.$$("#chartC .cbar")).length === 4, "C");
      assert((await p.$$("#chartD svg path")).length >= 3, "D");
      const d = await txt(p, "#chartD .data-table"); assert(/2036/.test(d), "D data");
    });
    await t(`[${label}] důležité odkazy jsou platné absolutní https adresy`, async () => {
      const bad = await p.$$eval("#simulace a[href^='http'], #zdroje a[href^='http']", (as) => as.map((a) => a.href).filter((h) => !/^https:\/\/[^\s]+\.[a-z]{2,}/.test(h)));
      assert(bad.length === 0, bad.join(", "));
    });
    await t(`[${label}] žádné chyby v konzoli`, async () => { assert(errors.length === 0, errors.join(" | ")); });
    await ctx.close();
  }

  await t("bez JavaScriptu zůstávají úvodní čísla a texty čitelné", async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const p = await ctx.newPage(); await p.goto(base);
    const nums = await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/\s+/g, "")));
    assert(nums.join("|") === "103let|€363|17|546", nums.join("|"));
    assert((await p.textContent("#simulace")).includes("Co kdybychom platili jinak?"));
    await ctx.close();
  });

  await browser.close(); srv.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(ROOT, "tests", "e2e-results.json"), JSON.stringify({ date: new Date().toISOString(), browser: "Chromium (Playwright " + require("playwright/package.json").version + ")", results }, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} prošlo`);
  process.exit(failed.length ? 1 : 0);
})();
