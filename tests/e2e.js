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

  /* ================= FINÁLNÍ KOLO: uživatelský průchod v 10 krocích ================= */
  for (const [vp, label] of [[{ width: 1366, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobil"]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: label === "mobil", hasTouch: label === "mobil", deviceScaleFactor: label === "mobil" ? 2 : 1 });
    const p = await ctx.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    const eng = (fn, arg) => p.evaluate(fn, arg);
    const engineFor = (h, lpPatch) => eng(([h, lpPatch]) => {
      const P = window.POPLATKY_PARAMS, E = window.PoplatkyEngine;
      const lp = Object.assign({}, P.levyDefault, lpPatch || {});
      const c = E.compareHousehold(P, h, lp);
      const pc = E.payCurve(P, lp, [h.adults[0].grossMonthly])[0];
      return { cur: c.current.annual, status: c.current.status, levy: Math.round(c.levy.total), curveA: Math.round(pc.current), curveC: Math.round(pc.levy) };
    }, [h, lpPatch]);
    const readA = async () => { const r = await txt(p, "#readA"); const m = r.match(/A · dnes\s*([\d\s ]+)\s*Kč ročně.*C · odvod\s*([\d\s ]+)\s*Kč ročně/); return m ? [kc(m[1]), kc(m[2])] : [NaN, NaN, r]; };

    await t(`[flow ${label}] 1 otevření webu`, async () => {
      await p.goto(base, { waitUntil: "load" });
      assert((await p.title()).length > 5, "title");
    });
    await t(`[flow ${label}] 2 přechod na kalkulačku z úvodu`, async () => {
      await p.click(".cz-cta");
      let top = 1e9; // plynulé posouvání přes celou stránku trvá až ~2 s; čekáme, až se ustálí
      for (let i = 0, prev = -1; i < 40; i++) { await p.waitForTimeout(150); top = await p.$eval("#kalkulacka", (e) => e.getBoundingClientRect().top); if (Math.abs(top - prev) < 1) break; prev = top; }
      assert(top > -5 && top < 200, "pozice " + top);
    });
    await t(`[flow ${label}] 3 individuální příjmy: kalkulačka = jádro = graf A`, async () => {
      // jeden dospělý, aby šel výsledek přímo porovnat s křivkou grafu A (jednotlivec)
      if ((await p.$$("#adultRows .adult")).length > 1) { await p.click('#adultRows .adult[data-i="1"] [data-f="rm"]'); await p.waitForTimeout(80); }
      await p.fill("#inc0", "60000"); await p.waitForTimeout(150);
      const e = await engineFor({ adults: [{ type: "emp", grossMonthly: 60000 }] });
      const c = kc(await txt(p, "#hhOut .res.c .res-big")), a = kc(await txt(p, "#hhOut .res.a .res-mid"));
      const [ga, gc] = await readA();
      assert(c === e.levy && a === e.cur, `kalkulačka A ${a} C ${c} vs jádro ${e.cur} / ${e.levy}`);
      assert(ga === a && gc === c, `graf A ukazuje A ${ga} C ${gc}, kalkulačka A ${a} C ${c}`);
    });
    await t(`[flow ${label}] 4 změna počtu osob přepočítá A i C`, async () => {
      await p.click("#addAdult"); await p.waitForTimeout(80);
      await p.fill("#inc1", "20000"); await p.waitForTimeout(150);
      const e = await engineFor({ adults: [{ type: "emp", grossMonthly: 60000 }, { type: "emp", grossMonthly: 20000 }] });
      assert(kc(await txt(p, "#hhOut .res.c .res-big")) === e.levy, "C 2 osoby");
      assert(kc(await txt(p, "#hhOut .res.a .res-mid")) === e.cur, "A 2 osoby");
      await p.click("#addAdult"); await p.waitForTimeout(80);
      assert((await p.$$("#adultRows .adult")).length === 3, "3 řádky");
      await p.click('#adultRows .adult[data-i="2"] [data-f="rm"]'); await p.waitForTimeout(80);
      assert((await p.$$("#adultRows .adult")).length === 2, "zpět 2");
    });
    await t(`[flow ${label}] 5 přepínání scénářů: právní stav ŽM a režim projekce`, async () => {
      await p.click("#hhMore summary"); await p.waitForTimeout(80);
      await p.check("#hhNetOn"); await p.fill("#hhNet", "17000"); await p.waitForTimeout(120);
      const sNew = await txt(p, "#hhOut .res.a");
      await p.click('[data-date="2026-09-30"]'); await p.waitForTimeout(120);
      const sOld = await txt(p, "#hhOut .res.a");
      assert(/18 813|18 812/.test(sNew) && /18 7|19 07|1[0-9] [0-9]{3}/.test(sOld) && sNew !== sOld, "limit se změnil: " + sNew.slice(0, 80) + " / " + sOld.slice(0, 80));
      await p.click('[data-date="2026-10-26"]'); await p.uncheck("#hhNetOn"); await p.waitForTimeout(100);
      const d1 = await p.$eval("#chartD", (e) => e.innerHTML.length);
      await p.click('#projMode button[aria-pressed="false"]'); await p.waitForTimeout(150);
      assert((await p.$eval("#chartD", (e) => e.innerHTML.length)) !== d1, "graf D reaguje");
      await p.click('#projMode button[aria-pressed="false"]'); await p.waitForTimeout(100);
    });
    await t(`[flow ${label}] 6 výpočty osvobození: smysly, smíšená, dítě`, async () => {
      const sens = await p.$$('#adultRows [data-f="sensory"]');
      await sens[0].check(); await p.waitForTimeout(60);
      assert((await txt(p, "#hhOut .status")) === "Platíte", "smíšená platí");
      assert(/ZTP\/P nárok nezakládá/.test(await txt(p, "#hhOut .res.a")), "upozornění na průkaz");
      await (await p.$$('#adultRows [data-f="sensory"]'))[1].check(); await p.waitForTimeout(60);
      assert((await txt(p, "#hhOut .status")).startsWith("Zákonné osvobození"), await txt(p, "#hhOut .status"));
      await p.click('[data-k="kids0_6"][data-d="1"]'); await p.waitForTimeout(60);
      assert((await txt(p, "#hhOut .status")).startsWith("Pravděpodobně"), "s dítětem jen pravděpodobně");
      assert(/výklad ČT/.test(await txt(p, "#hhOut .res.a")), "vysvětlení výkladu ČT");
      await p.click('[data-k="kids0_6"][data-d="-1"]');
      for (const b of await p.$$('#adultRows [data-f="sensory"]')) await b.uncheck();
      await p.waitForTimeout(60);
    });
    await t(`[flow ${label}] 7 parametry odvodu: kalkulačka, graf A i simulátor se shodují s jádrem`, async () => {
      const sim0 = await txt(p, "#simOut");
      await p.evaluate(() => { const r = document.getElementById("pRate"); r.value = "0.02"; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
      await p.waitForTimeout(500);
      const e = await engineFor({ adults: [{ type: "emp", grossMonthly: 60000 }, { type: "emp", grossMonthly: 20000 }] }, { rate: 0.02 });
      const c = kc(await txt(p, "#hhOut .res.c .res-big"));
      assert(c === e.levy, `C ${c} vs ${e.levy}`);
      const [, gc] = await readA(); assert(gc === e.curveC, `graf A C ${gc} vs ${e.curveC}`);
      assert((await txt(p, "#simOut")) !== sim0, "simulátor se nepřepočítal");
      const sim = await eng(() => { const P = window.POPLATKY_PARAMS, E = window.PoplatkyEngine; const m = E.simulate(P, Object.assign({}, P.levyDefault, { rate: 0.02 }), 0).mid; return [m.gross, m.net]; });
      const shown = await p.$$eval("#simOut .kpi .v", (els) => els.slice(0, 2).map((e) => parseFloat(e.textContent.replace(",", "."))));
      assert(Math.abs(shown[0] - sim[0] / 1e9) < 0.051 && Math.abs(shown[1] - sim[1] / 1e9) < 0.051, `simulátor hrubý/čistý ${shown} vs ${sim.map((x) => (x / 1e9).toFixed(2))}`);
      await p.evaluate(() => { const r = document.getElementById("pRate"); r.value = "0.011"; r.dispatchEvent(new Event("input", { bubbles: true })); });
      await p.waitForTimeout(400);
    });
    await t(`[flow ${label}] 8 grafy A až D a decily jsou vykreslené`, async () => {
      for (const id of ["chartA", "chartB", "chartD"]) assert((await p.$$(`#${id} svg path`)).length >= 2, id);
      assert((await p.$$("#chartC .cbar")).length === 4, "C");
      await p.evaluate(() => document.querySelectorAll("details.deep").forEach((d) => (d.open = true))); await p.waitForTimeout(200);
      assert((await p.$$("#chartDec svg rect, #chartDec svg path")).length >= 5, "decily");
    });
    await t(`[flow ${label}] 9 metodika: právní pravidla a tři data`, async () => {
      await p.click("#metodika > summary"); await p.waitForTimeout(150);
      const m = await txt(p, "#methodBody");
      assert(/písm\. g/.test(m) && /výklad ČT/.test(m) && /nárok nezakládá/.test(m), "osvobození");
      assert(m.includes("ověřena k 26. 10. 2026") && m.includes("účinné od 1. 5. 2025") && m.includes("zkontrolována 26. 10. 2026"), "data");
      assert(!/při ZTP\/P se/.test(m), "ZTP/P jako podmínka");
    });
    await t(`[flow ${label}] 10 obnovení a přímý odkaz na českou sekci`, async () => {
      await p.reload({ waitUntil: "load" }); await p.waitForTimeout(700);   // obnovení: prohlížeč smí vrátit předchozí pozici
      const c = kc(await txt(p, "#hhOut .res.c .res-big")); assert(c > 0, "kalkulačka po obnovení");
      const q = await ctx.newPage(); await q.goto(base + "#simulace"); await q.waitForTimeout(1000);   // přímý odkaz v nové kartě
      const top = await q.$eval("#simulace", (e) => e.getBoundingClientRect().top);
      assert(top > -5 && top < 200, "pozice #simulace " + top);
      await q.reload({ waitUntil: "load" }); await q.waitForTimeout(1000);
      const top2 = await q.$eval("#simulace", (e) => e.getBoundingClientRect().top);
      assert(top2 > -5 && top2 < 200, "pozice po obnovení odkazu " + top2);
      await q.close();
    });
    await t(`[flow ${label}] bez chyb v konzoli`, async () => assert(errors.length === 0, errors.join(" | ")));
    await ctx.close();
  }

  /* ================= Úvodní statistiky ve 4 variantách + nedokončené popisky ================= */
  const STATS = "103let|€363|17|546";
  await t("statistiky: s JavaScriptem", async () => {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(base);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/\s+/g, "")))).join("|") === STATS); await ctx.close();
  });
  await t("statistiky: omezené animace (prefers-reduced-motion)", async () => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" }); const p = await ctx.newPage(); await p.goto(base);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/\s+/g, "")))).join("|") === STATS);
    await p.waitForTimeout(1500);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/\s+/g, "")))).join("|") === STATS, "po 1,5 s"); await ctx.close();
  });
  await t("statistiky a datum: textový extraktor surového HTML (jako crawler, bez DOM)", async () => {
    const raw = await (await fetch(base)).text();
    const text = raw.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/ ([.;,)])/g, "$1");
    for (const s of ["103 let", "€ 363", "546 hlasů", "znění účinné od 1. 5. 2025; legislativa ověřena k 26. 10. 2026"]) assert(text.includes(s) || text.replace(/€ /g, "€").includes(s.replace("€ ", "€")), "chybí: " + s);
    assert(!/(stav k|účinné od|ověřena k|zkontrolována)\s*[.;,)]/.test(text), "nedokončený popisek s datem");
    assert(!/\b0 let\b|€ ?0\b/.test(text), "nuly");
  });
  await t("bez JavaScriptu: žádné nedokončené popisky s datem ani NaN", async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(base);
    const body = (await p.innerText("body")).replace(/\s+/g, " "); // innerText = viditelný text, bez obsahu <script>
    assert(!/(stav k|účinné od|ověřena k|zkontrolována|Právní stav)\s*([.;,)]|$)/.test(body), "nedokončený popisek");
    assert(!/NaN|undefined/.test(body), "NaN");
    assert(body.includes("legislativa ověřena k 26. 10. 2026"), "datum v kartě A");
    await ctx.close();
  });

  /* ================= Mobil: šířky 320 až 430 (Chromium, emulace) ================= */
  for (const w of [320, 360, 375, 390, 414, 430]) {
    await t(`[mobil ${w}px] bez vodorovného přetečení, ovladatelné prvky`, async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      const p = await ctx.newPage(); await p.goto(base + "#kalkulacka"); await p.waitForTimeout(700);
      await p.evaluate(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); }); await p.waitForTimeout(300);
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const inScroller = (e) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) if (getComputedStyle(x).overflowX !== "visible") return true; return false; };
        const over = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 1 || b.left < -1) && !inScroller(e); }).slice(0, 5).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().right));
        const small = [...document.querySelectorAll("#simulace button, #simulace input, #simulace select, #simulace summary")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && e.type !== "checkbox" && (b.height < 24 || b.width < 24); }).slice(0, 5).map((e) => (e.id || e.textContent.trim().slice(0, 20) || e.tagName) + " " + Math.round(e.getBoundingClientRect().width) + "×" + Math.round(e.getBoundingClientRect().height));
        const fonts = [...document.querySelectorAll("#simulace input[type=number], #simulace select")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.getAttribute("aria-label"));
        const numInputs = [...document.querySelectorAll("#simulace input[type=number]")].filter((e) => !/numeric|decimal/.test(e.getAttribute("inputmode") || "")).map((e) => e.id);
        const outCard = [...document.querySelectorAll("#adultRows .adult input, #adultRows .adult select, #adultRows .adult button")].filter((e) => { const c = e.closest(".adult").getBoundingClientRect(), b = e.getBoundingClientRect(); return b.width && (b.right > c.right + 0.5 || b.left < c.left - 0.5); }).map((e) => e.id || e.dataset.f);
        const nav = document.querySelector("nav, .nav, header"); const navPos = nav ? getComputedStyle(nav).position : "";
        return { scroll: document.documentElement.scrollWidth - vw, outCard, over, small, fonts, numInputs, navPos, bodyFont: parseFloat(getComputedStyle(document.querySelector("#hhOut p") || document.body).fontSize) };
      });
      await ctx.close();
      assert(r.scroll <= 0, "vodorovné posouvání stránky o " + r.scroll + " px");
      assert(r.over.length === 0, "přetéká: " + r.over.join(", "));
      assert(r.outCard.length === 0, "pole mimo kartu dospělého: " + r.outCard.join(", "));
      assert(r.small.length === 0, "dotykové cíle pod 24 px: " + r.small.join(", "));
      assert(r.fonts.length === 0, "písmo polí pod 16 px (iOS přiblíží): " + r.fonts.join(", "));
      assert(r.numInputs.length === 0, "chybí inputmode: " + r.numInputs.join(", "));
      assert(r.bodyFont >= 13, "čitelnost výsledků " + r.bodyFont);
    });
  }

  await browser.close(); srv.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(ROOT, "tests", "e2e-results.json"), JSON.stringify({ date: new Date().toISOString(), browser: "Chromium (Playwright " + require("playwright/package.json").version + ")", results }, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} prošlo`);
  process.exit(failed.length ? 1 : 0);
})();
