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
      const nums = await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/[\s\u00a0]+/g, "")));
      assert(nums.join("|") === "103let|€363|17|2633", nums.join("|"));
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
      const href = await p.getAttribute(".path-me", "href"); assert(href === "#kalkulacka", href);
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
    const nums = await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/[\s\u00a0]+/g, "")));
    assert(nums.join("|") === "103let|€363|17|2633", nums.join("|"));
    assert((await p.textContent("#simulace")).includes("Kolik bych platil já?"));
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
      await p.click(".path-me");
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
  const STATS = "103let|€363|17|2633";
  await t("statistiky: s JavaScriptem", async () => {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(base);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/[\s\u00a0]+/g, "")))).join("|") === STATS); await ctx.close();
  });
  await t("statistiky: omezené animace (prefers-reduced-motion)", async () => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" }); const p = await ctx.newPage(); await p.goto(base);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/[\s\u00a0]+/g, "")))).join("|") === STATS);
    await p.waitForTimeout(1500);
    assert((await p.$$eval(".stat .num", (els) => els.map((e) => e.textContent.replace(/[\s\u00a0]+/g, "")))).join("|") === STATS, "po 1,5 s"); await ctx.close();
  });
  await t("statistiky a datum: textový extraktor surového HTML (jako crawler, bez DOM)", async () => {
    const raw = await (await fetch(base)).text();
    const text = raw.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/ ([.;,)])/g, "$1");
    for (const s of ["103 let", "€ 363", "2 633 hlasů", "znění účinné od 1. 5. 2025; legislativa ověřena k 26. 10. 2026"]) assert(text.includes(s) || text.replace(/€ /g, "€").includes(s.replace("€ ", "€")), "chybí: " + s);
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

  await t("čísla v HTML bez JS = čísla po spuštění JS (žádné výchozí hodnoty vydávané za data)", async () => {
    const grab = async (js) => { const c = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1366, height: 900 } }); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(js ? 1500 : 200);
      const r = await p.evaluate(() => { const o = {}; document.querySelectorAll("[id]").forEach((e) => { if (e.children.length > 3) return; const t = e.textContent.replace(/\s+/g, " ").trim(); if (t && /\d/.test(t) && t.length < 200) o[e.id] = t; }); return o; }); await c.close(); return r; };
    const a = await grab(false), j = await grab(true);
    const bad = Object.keys(a).filter((k) => j[k] !== undefined && j[k] !== a[k]).map((k) => k + ": " + a[k] + " ≠ " + j[k]);
    assert(bad.length === 0, bad.join("; "));
  });

  /* ================= Identita „Kdo platí?“, metadata, SEO soubory ================= */
  await t("identita: H1, podtitulek a perex v přesném znění, bez JS i s JS", async () => {
    for (const js of [false, true]) {
      const c = await browser.newContext({ javaScriptEnabled: js }); const p = await c.newPage(); await p.goto(base);
      const h1 = (await p.textContent("h1")).replace(/\s+/g, " ").trim();
      const sub = (await p.textContent(".hero-sub")).trim(), lede = (await p.textContent(".hero .lede")).replace(/\s+/g, " ").trim();
      assert(h1 === "Kdo platí?", "H1: " + h1);
      assert(sub === "Jak financujeme média veřejné služby.", "podtitulek: " + sub);
      assert(lede === "Co by se stalo, kdyby Česko zrušilo televizní a rozhlasové poplatky? Porovnejte alternativy, spočítejte jejich dopad na vlastní domácnost a prozkoumejte, co znamenají pro veřejné finance a nezávislost médií. Podívejte se také, jak podobné otázky řeší Evropa.", "perex: " + lede);
      assert(!/\d/.test(lede), "perex bez počtu zemí");
      assert((await p.$$("h1")).length === 1, "jediné H1");
      const go = await p.$$eval(".paths .path-t, .paths-more a", (as) => as.map((a) => a.textContent.trim() + ">" + (a.closest("a") || a).getAttribute("href")));
      assert(go.join("|") === "Kolik bych platil já?>#kalkulacka|Jak platí Evropa?>#mapa|Co by změna znamenala pro Česko?>#cele-cesko|Česko podrobně>#cesko|Nezávislost médií>#pojistky|Metodika a zdroje>#zdroje", go.join("|"));
      for (const g of go) assert(await p.$(g.split(">")[1]), "cíl " + g);
      await c.close();
    }
  });
  await t("metadata: title, description, canonical, OG, Twitter, JSON-LD, manifest", async () => {
    const c = await browser.newContext({ javaScriptEnabled: false }); const p = await c.newPage(); await p.goto(base);
    const m = await p.evaluate(() => { const g = (s) => { const e = document.querySelector(s); return e && (e.content || e.href || e.textContent); }; return {
      title: document.title, desc: g('meta[name="description"]'), canon: g('link[rel="canonical"]'), ogt: g('meta[property="og:title"]'), ogd: g('meta[property="og:description"]'), ogu: g('meta[property="og:url"]'),
      ogi: g('meta[property="og:image"]'), site: g('meta[property="og:site_name"]'), tw: g('meta[name="twitter:card"]'), twt: g('meta[name="twitter:title"]'), ld: g('script[type="application/ld+json"]'), man: document.querySelector('link[rel="manifest"]').getAttribute("href") }; });
    assert(m.title === "Kdo platí? Jak financujeme média veřejné služby", m.title);
    assert(m.canon === "https://poplatky.app/" && m.ogu === "https://poplatky.app/", "canonical " + m.canon);
    assert(m.site === "Kdo platí?" && m.ogt === m.title && m.twt === m.title && m.tw === "summary_large_image", "OG/Twitter");
    assert(m.desc.startsWith("Co by se stalo, kdyby Česko zrušilo") && m.ogd.startsWith(m.desc.slice(0, 60)), "description");
    assert(m.ogi === "https://poplatky.app/og.png", "og:image");
    const ld = JSON.parse(m.ld); assert(ld.name === "Kdo platí?" && ld.url === "https://poplatky.app/" && ld["@type"] === "WebSite", "JSON-LD");
    const head = (await (await fetch(base)).text()).slice(0, 6000); assert(!/Poplatky za vysílání v Evropě/.test(head), "starý název v hlavičce");
    const man = await (await fetch(base + m.man)).json(); assert(man.short_name === "Kdo platí?", "manifest");
    await c.close();
  });
  await t("SEO soubory: robots.txt, sitemap.xml, og.png 1200×630 se nasazují", async () => {
    const r = await fetch(base + "robots.txt"); assert(r.ok && /Sitemap: https:\/\/poplatky\.app\/sitemap\.xml/.test(await r.text()), "robots");
    const sm = await fetch(base + "sitemap.xml"); assert(sm.ok && /<loc>https:\/\/poplatky\.app\/<\/loc>/.test(await sm.text()), "sitemap");
    const og = Buffer.from(await (await fetch(base + "og.png")).arrayBuffer());
    assert(og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630, "rozměr og.png");
  });
  for (const [vp, label] of [[{ width: 1366, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobil"]]) {
    await t(`[flow ${label}] přechod do evropského srovnání a sdílení konkrétní sekce`, async () => {
      const c = await browser.newContext({ viewport: vp, isMobile: label === "mobil", hasTouch: label === "mobil" }); const p = await c.newPage(); await p.goto(base);
      await p.click('.path-eu');
      let top = 1e9; for (let i = 0, prev = -1; i < 40; i++) { await p.waitForTimeout(150); top = await p.$eval("#mapa", (e) => e.getBoundingClientRect().top); if (Math.abs(top - prev) < 1) break; prev = top; }
      assert(top > -5 && top < 200, "mapa " + top);
      assert((await p.$$("#mapSvg path.c")).length >= 40, "mapa vykreslena");
      const navHashes = await p.$$eval("nav.toc .links a", (as) => as.map((a) => a.getAttribute("href")));
      assert(navHashes.length === 11, "navigace " + navHashes.length);
      for (const [h, sel] of [["#zeme-CZ", "#dlgName"], ["#kalkulacka", "#kalkulacka"], ["#metodika", "#metodika"]].concat(navHashes.map((x) => [x, x]))) {
        const q = await c.newPage(); await q.goto(base + h); await q.waitForTimeout(1100);
        if (h === "#zeme-CZ") assert((await q.textContent(sel)).trim() === "Česko", "dialog CZ");
        else { const tp = await q.$eval(sel, (e) => e.getBoundingClientRect().top); assert(tp > -5 && tp < 200, h + " " + tp); }
        await q.close();
      }
      await c.close();
    });
  }

  await t("motiv: výchozí světlý i při tmavém systému; tmavý jen po volbě a pamatuje se", async () => {
    const c = await browser.newContext({ colorScheme: "dark" }); const p = await c.newPage(); await p.goto(base);
    const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(await bg() === "rgb(242, 239, 230)", "výchozí pozadí " + await bg());
    await p.click("#themeBtn"); await p.waitForTimeout(50);
    assert(await bg() === "rgb(16, 16, 16)", "po přepnutí " + await bg());
    await p.reload(); await p.waitForTimeout(100);
    assert(await bg() === "rgb(16, 16, 16)", "tmavý po obnovení");
    await p.click("#themeBtn"); await p.reload(); await p.waitForTimeout(100);
    assert(await bg() === "rgb(242, 239, 230)", "zpět světlý");
    await c.close();
  });

  /* ================= KDO PLATÍ? 2.0 (větev ux-2) ================= */
  await t("ux2: pořadí kapitol podle nové informační hierarchie", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    const ids = await p.$$eval("main section[id]", (ss) => ss.map((x) => x.id));
    assert(ids.join(",") === "simulace,cesko,mapa,zebricek,zeme,kontext,pojistky,osa,hlasy,cele-cesko,zdroje", ids.join(","));
    await c.close();
  });
  await t("ux2: všechny dříve veřejné kotvy (main 865685d) dál existují", async () => {
    const old = require("child_process").execSync("git show 865685d:index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 });
    const anchors = [...new Set([...old.matchAll(/href="#([A-Za-z][\w-]*)"/g)].map((m) => m[1]))];
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    const missing = []; for (const a of anchors) if (!(await p.$("#" + a))) missing.push(a);
    assert(missing.length === 0, "chybí: " + missing.join(", "));
    assert(anchors.length >= 16, "kotev " + anchors.length);
    await c.close();
  });
  await t("ux2: blok Aktuální Česko (bez JS i s JS): poplatek, stav návrhu, datum, odkaz", async () => {
    for (const js of [false, true]) {
      const c = await browser.newContext({ javaScriptEnabled: js }); const p = await c.newPage(); await p.goto(base);
      const tx = (await p.innerText(".now-cz")).replace(/\s+/g, " ");
      assert(/2 460 Kč ročně/.test(tx) && /Schválený není/.test(tx) && /26\. 10\. 2026/.test(tx) && /tisk 231/.test(tx), tx);
      assert(!/schválen[oa]? (zrušení|změna)/i.test(tx), "návrh nesmí znít jako schválený");
      assert((await p.getAttribute(".now-more", "href")) === "#legislativa" && await p.$("#legislativa"), "odkaz");
      await c.close();
    }
  });
  await t("ux2: stav legislativy ve 4 krocích, aktuální je projednávání", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    const k = await p.$$eval(".legis-steps li", (ls) => ls.map((l) => l.className + ":" + l.querySelector(".legis-k").textContent.trim()));
    assert(k.join("|") === "st-done:Platná legislativa|st-done:Předložený návrh|st-now:Projednávání a hlasování|st-todo:Schválená změna a účinnost", k.join("|"));
    await c.close();
  });
  for (const [vp, label] of [[{ width: 1366, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobil"]]) {
    await t(`[ux2 ${label}] rychlá odpověď = plný výsledek kalkulačky`, async () => {
      const c = await browser.newContext({ viewport: vp, isMobile: label === "mobil", hasTouch: label === "mobil" }); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(400);
      await p.fill("#inc0", "52000"); await p.waitForTimeout(150);
      const q = await p.$$eval("#hhQuick .q-row b", (bs) => bs.map((b) => b.textContent));
      const fullA = kc(await txt(p, "#hhOut .res.a .res-mid")), fullC = kc(await txt(p, "#hhOut .res.c .res-big"));
      assert(kc(q[0]) === fullA && kc(q[2]) === fullC, q.join("|") + " vs " + fullA + "/" + fullC);
      const vis = await p.$eval("#hhQuick", (e) => getComputedStyle(e).display !== "none");
      assert(vis === (label === "mobil"), "rychlá odpověď viditelná jen na úzkém displeji");
      await c.close();
    });
  }
  await t("ux2: sdílení bez příjmů: odkaz neobsahuje příjmy, po otevření sedí domácnost a parametry", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(300);
    await p.fill("#inc0", "61234"); await p.selectOption('#adultRows .adult[data-i="1"] select', "pens"); await p.fill("#inc1", "23456");
    await (await p.$$('#adultRows [data-f="sensory"]'))[1].check();
    await p.evaluate(() => { const r = document.getElementById("pRate"); r.value = "0.015"; r.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.waitForTimeout(200);
    const url = await p.inputValue("#shUrl");
    assert(!/61234|61000|23456|23000/.test(url), url);
    assert(/a=emp\.pens/.test(url) && /s=1/.test(url) && /r=0\.015/.test(url) && url.endsWith("#kalkulacka"), url);
    const q = await c.newPage(); await q.goto(url); await q.waitForTimeout(600);
    assert((await q.$$("#adultRows .adult")).length === 2, "dospělí");
    assert((await q.$eval('#adultRows .adult[data-i="1"] select', (s) => s.value)) === "pens", "typ");
    assert(await q.$eval('#adultRows .adult[data-i="1"] [data-f="sensory"]', (x) => x.checked), "osvobození");
    assert((await q.inputValue("#pRate")) === "0.015", "sazba");
    assert(!/61234|23456/.test(await q.inputValue("#inc0") + await q.inputValue("#inc1")), "příjmy se nepřenesly");
    assert(/Příjmy v odkazu nejsou/.test(await q.textContent("#shNote")), "upozornění");
    await c.close();
  });
  await t("ux2: sdílení s příjmy (souhlas): stejný výsledek C po otevření odkazu", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(300);
    await p.fill("#inc0", "58000"); await p.fill("#inc1", "41000"); await p.check("#shInc"); await p.waitForTimeout(150);
    const url = await p.inputValue("#shUrl"); assert(/[?&]p=1(&|#|$)/.test(url) && /emp-58000\.emp-41000/.test(url), url);
    const cA = await txt(p, "#hhOut .res.c .res-big");
    const q = await c.newPage(); await q.goto(url); await q.waitForTimeout(600);
    assert(await txt(q, "#hhOut .res.c .res-big") === cA, "C se liší");
    await c.close();
  });
  await t("ux2: neplatný odkaz nerozbije stránku", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); const err = []; p.on("pageerror", (e) => err.push(e.message));
    await p.goto(base + "?v=1&a=%3Cimg%20src=x%3E.emp-1e99&r=abc&k=99.99.99&cil=-5&srovnat=XX.%3Cb%3E#kalkulacka"); await p.waitForTimeout(600);
    assert(err.length === 0, err.join("|")); assert(!/NaN|undefined/.test(await txt(p, "#simulace")), "NaN");
    assert(!(await p.$("img[src=x]")), "vložené HTML");
    await c.close();
  });
  await t("ux2: odkaz simulátoru nese jen parametry", async () => {
    const c = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] }); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(300);
    await p.evaluate(() => { const r = document.getElementById("pCap"); r.value = "5000"; r.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.click("#simShare"); await p.waitForTimeout(150);
    const url = await p.evaluate(() => navigator.clipboard.readText());
    assert(/c=5000/.test(url) && url.endsWith("#simulator") && !/[?&]p=1(&|#|$)/.test(url) && !/45000|36000/.test(url), url);
    await c.close();
  });
  await t("ux2: karta výsledku se vygeneruje jako PNG 1200×630", async () => {
    const c = await browser.newContext({ acceptDownloads: true }); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#shCard")]);
    const buf = fs.readFileSync(await dl.path());
    assert(dl.suggestedFilename() === "kdo-plati-vysledek.png" && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630, "png");
    await c.close();
  });
  for (const [vp, label] of [[{ width: 1366, height: 900 }, "desktop"], [{ width: 360, height: 800 }, "mobil"]]) {
    await t(`[ux2 ${label}] porovnání zemí: výběr, odkaz, čitelnost`, async () => {
      const c = await browser.newContext({ viewport: vp, isMobile: label === "mobil", hasTouch: label === "mobil" }); const p = await c.newPage();
      await p.goto(base + "?srovnat=CZ.AT.PL.IE#porovnani"); await p.waitForTimeout(800);
      const names = await p.$$eval("#cmpPick select", (ss) => ss.map((s) => s.value));
      assert(names.join(",") === "CZ,AT,PL,IE", names.join(","));
      const rowTxt = (await p.innerText("#cmpOut")).replace(/\s+/g, " ");
      assert(/0,67 %/.test(rowTxt) && /101 € ročně/.test(rowTxt), "zátěž a platba CZ");
      await p.selectOption('#cmpPick select[data-ci="1"]', "SK"); await p.waitForTimeout(100);
      assert(/0 € přímo; financuje státní rozpočet/.test(await p.innerText("#cmpOut")), "rozpočet ne jako nulová cena");
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(over <= 0, "přetečení " + over);
      if (label === "mobil") assert(await p.$eval(".ct-v .ct-c", (e) => getComputedStyle(e).display !== "none"), "na mobilu jméno země u každé hodnoty");
      await c.close();
    });
  }
  await t("ux2: mapa, pohled Zátěž: jen srovnatelné země, poznámka a zdroj", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base); await p.waitForTimeout(400);
    await p.click("#mapModeBurden"); await p.waitForTimeout(150);
    assert(/0,67 %/.test(await p.innerText("#mapInfo")), "Česko 0,67 %");
    assert(!(await p.$eval("#mapNote", (e) => e.hidden)) && /Eurostat/.test(await p.innerText("#mapNote")), "poznámka");
    await p.evaluate(() => { const e = document.querySelector('#mapSvg path.c[data-iso="SK"]') || null; return !!e; });
    await p.click("#mapModeModel"); assert(await p.$eval("#mapNote", (e) => e.hidden), "poznámka zmizí");
    await c.close();
  });
  await t("ux2: detail rozpočtové země: přímá platba vs. veřejné výdaje, údaje a omezení", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base + "#zeme-SK"); await p.waitForTimeout(700);
    const d = (await p.innerText("#dlgIn")).replace(/\s+/g, " ");
    assert(/Přímá platba domácnosti/i.test(d) && /neznamená bez nákladů/.test(d) && !/neplatí nic/.test(d), d.slice(0, 200));
    assert(/Stav údajů/i.test(d) && /Primární zdroj/i.test(d) && /Omezení/i.test(d), "údaje o zemi");
    const q = await c.newPage(); await q.goto(base + "#zeme-SI"); await q.waitForTimeout(700);
    assert(/neoficiální/.test(await q.innerText("#dlgIn")), "omezení u Slovinska");
    await c.close();
  });
  await t("ux2: klávesnice: hlavní cesty mají viditelný fokus", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    await p.focus(".path-me"); await p.keyboard.press("Tab"); await p.keyboard.press("Shift+Tab");
    const o = await p.$eval(".path-me", (e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
    assert(/solid 3px/.test(o), o);
    await c.close();
  });

  /* ================= Premisa (větev premisa) ================= */
  await t("premisa: hero bez evropských čísel, statistiky až v evropské kapitole", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    assert(!(await p.$("header.hero .stat-strip")), "statistiky v úvodu");
    assert(await p.$("#mapa .eu-stats"), "statistiky v kapitole Mapa");
    const intro = (await p.innerText("#mapa .eu-intro")).replace(/\s+/g, " ").trim();
    assert(intro === "Evropa nemá jeden správný model financování médií veřejné služby. Jednotlivé země používají poplatky, daně, státní rozpočty i kombinovaná řešení. Tento přehled slouží jako kontext pro českou debatu, nikoli jako žebříček nejlepších systémů.", intro);
    const order = await p.evaluate(() => { const a = document.querySelector("#mapa .eu-intro"), b = document.querySelector("#mapSvg"); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); });
    assert(order, "úvod před mapou");
    await c.close();
  });
  await t("premisa: přiznání inspirace s funkčním odkazem, bez tvrzení o partnerství", async () => {
    const c = await browser.newContext({ javaScriptEnabled: false }); const p = await c.newPage(); await p.goto(base);
    const a = await p.$('#o-projektu a[href="https://poplatkyvevrope.cz/"]'); assert(a, "odkaz");
    const tx = (await p.innerText("#o-projektu")).replace(/\s+/g, " ");
    assert(/Impulsem ke vzniku projektu byl mimo jiné web poplatkyvevrope\.cz/.test(tx), "znění");
    assert(!/partner|spolupr|ve spolupráci|oficiál/i.test(tx), "nesmí sugerovat partnerství");
    await c.close();
  });
  await t("premisa: všechny odkazy Souvislost s Českem míří na existující obsah", async () => {
    const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base);
    const hrefs = await p.$$eval(".ctx-link a", (as) => as.map((a) => a.getAttribute("href")));
    assert(hrefs.length >= 8, "odkazů " + hrefs.length);
    for (const h of hrefs) assert(await p.$(h), "chybí cíl " + h);
    for (const iso of ["FI", "SK", "DE", "GB", "IT"]) {
      await p.evaluate((i) => window.openCountry(i), iso); await p.waitForTimeout(80);
      const l = await p.$$eval("#dlgIn .ctx-link a", (as) => as.map((a) => a.getAttribute("href")));
      assert(l.length >= 1, iso + " bez souvislosti"); for (const h of l) assert(await p.$(h), iso + " cíl " + h);
    }
    await p.click('#dlgIn .ctx-link a'); await p.waitForTimeout(300);
    assert(!(await p.$eval("#detail", (d) => d.open)), "dialog se po kliknutí zavře");
    await c.close();
  });

  /* ================= Mobil: šířky 320 až 430 (Chromium, emulace) ================= */
  for (const w of [320, 360, 375, 390, 414, 430, 768, 1440]) {
    await t(`[mobil ${w}px] bez vodorovného přetečení, ovladatelné prvky`, async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: w < 700, hasTouch: w < 1000, deviceScaleFactor: w < 700 ? 3 : 1 });
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
      if (w < 700) assert(r.fonts.length === 0, "písmo polí pod 16 px (iOS přiblíží): " + r.fonts.join(", "));
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
