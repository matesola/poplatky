// Testy sdílení scénářů (lab/share.js), konzistence základního a podrobného režimu kalkulačky
// a čísel zobrazených staticky v HTML. Spuštění: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../lab/params.js");
const E = require("../lab/engine.js");
const S = require("../lab/share.js");

const base = () => ({
  adults: [{ type: "emp", gross: 45210 }, { type: "emppens", gross: 20400, pension: 18750, sensory: true }],
  kids0_6: 1, kids6_15: 0, kids15_26: 2, noDev: false, date: "2026-10-26",
  lp: Object.assign({}, P.levyDefault), target: "budget", targetCustom: 8e9
});

test("sdílení: bez souhlasu odkaz neobsahuje žádné příjmy", () => {
  const q = S.encodeScenario(base());
  assert.doesNotMatch(q, /45|20400|18750|45210/, q.replace(/r=.*$/, ""));
  assert.match(q, /a=emp\.emppens(&|$)/);
  assert.doesNotMatch(q, /(^|&)p=1(&|$)/);
  const d = S.decodeScenario("?" + q, P.levyDefault);
  assert.equal(d.ok, true); assert.equal(d.incomes, false);
  assert.equal(d.state.adults[0].gross, 0, "příjem se nenačte");
  assert.equal(d.state.adults[1].sensory, true);
});

test("sdílení: se souhlasem jsou příjmy zaokrouhlené na 1 000 Kč", () => {
  const q = S.encodeScenario(base(), { includeIncome: true });
  assert.match(q, /a=emp-45000\.emppens-20000-19000/);
  const d = S.decodeScenario("?" + q, P.levyDefault);
  assert.equal(d.incomes, true);
  assert.deepEqual(d.state.adults.map((a) => a.gross), [45000, 20000]);
  assert.equal(d.state.adults[1].pension, 19000);
});

test("sdílení: přesný čistý příjem se nesdílí nikdy", () => {
  const st = Object.assign(base(), { netOn: true, net: 23456 });
  for (const inc of [false, true]) assert.doesNotMatch(S.encodeScenario(st, { includeIncome: inc }), /23456|net/);
});

test("sdílení: cesta tam a zpět zachová domácnost, osvobození, právní stav a parametry modelu", () => {
  const st = base();
  st.noDev = true; st.date = "2026-09-30";
  st.lp = Object.assign({}, P.levyDefault, { rate: 0.0145, threshold: 250000, cap: 4200, marginal: false, includePensions: false, includeSelf: true, adminCostRate: 0.015, reserveRate: 0.03 });
  st.target = "custom"; st.targetCustom = 8.5e9;
  const d = S.decodeScenario("?" + S.encodeScenario(st, { includeIncome: true }), P.levyDefault).state;
  assert.deepEqual([d.kids0_6, d.kids6_15, d.kids15_26], [1, 0, 2]);
  assert.equal(d.noDev, true); assert.equal(d.date, "2026-09-30");
  assert.deepEqual(d.lp, st.lp);
  assert.equal(d.target, "custom"); assert.equal(d.targetCustom, 8.5e9);
});

test("sdílení: výsledek jádra je po načtení odkazu stejný (příjmy násobky 1 000 Kč)", () => {
  const st = base(); st.adults[0].gross = 45000; st.adults[1].gross = 20000; st.adults[1].pension = 19000;
  const h = (s) => ({ adults: s.adults.map((a) => ({ type: a.type, grossMonthly: a.gross, pensionMonthly: a.pension || 0, sensory: !!a.sensory })), kids0_6: s.kids0_6, kids6_15: s.kids6_15, kids15_26: s.kids15_26, noDevice: s.noDev, date: s.date });
  const d = S.decodeScenario("?" + S.encodeScenario(st, { includeIncome: true }), P.levyDefault).state;
  const a = E.compareHousehold(P, h(st), st.lp), b = E.compareHousehold(P, h(Object.assign({}, st, d)), d.lp);
  assert.equal(b.current.annual, a.current.annual); assert.equal(b.levy.total, a.levy.total); assert.equal(b.current.status, a.current.status);
});

test("sdílení: neplatné a nebezpečné hodnoty se ignorují nebo ořežou", () => {
  const d = S.decodeScenario("?v=1&p=1&a=emp-99999999999.hacker.pens-abc.self-50000.emp-1.emp-2&r=5&t=-10&c=NaN&m=2&k=1.2&s=9&cil=%3Cscript%3E&zz=1", P.levyDefault);
  assert.equal(d.ok, true);
  assert.equal(d.state.adults.length, 3, "neznámý typ vypadne, nejvýš 4 dospělí");
  assert.equal(d.state.adults[0].gross, S.RANGE.gross[1], "příjem oříznutý na maximum");
  assert.equal(d.state.lp.rate, 0.03, "sazba oříznutá na rozsah posuvníku");
  assert.equal(d.state.lp.threshold, 0);
  assert.equal(d.state.lp.cap, P.levyDefault.cap, "NaN se nepoužije");
  assert.equal(d.state.lp.marginal, P.levyDefault.marginal);
  assert.equal(d.state.kids0_6, undefined, "neúplné děti se nepoužijí");
  assert.equal(d.state.target, undefined);
  assert.ok(d.ignored.length >= 5);
  assert.equal(E.validateLevy(d.state.lp).ok, true, "načtené parametry projdou validací jádra");
});

test("sdílení: odkaz bez verze se nenačte", () => {
  assert.equal(S.decodeScenario("?a=emp-50000&r=0.02", P.levyDefault).ok, false);
});

test("porovnání zemí: jen existující kódy, bez opakování, nejvýš 4", () => {
  const iso = ["CZ", "SK", "DE", "AT", "PL"];
  assert.deepEqual(S.decodeCompare("?srovnat=cz.SK.xx.CZ.de.AT.PL", iso), ["CZ", "SK", "DE", "AT"]);
  assert.deepEqual(S.decodeCompare("?srovnat=%3Cb%3E", iso), []);
});

/* ---------- konzistence základního a podrobného zadání ---------- */
test("kalkulačka: základní zadání = podrobné zadání s výchozími hodnotami", () => {
  const basic = { adults: [{ type: "emp", grossMonthly: 45000 }, { type: "emp", grossMonthly: 36000 }] };
  const adv = Object.assign({}, basic, { kids0_6: 0, kids6_15: 0, kids15_26: 0, noDevice: false, netOverride: null, date: P.meta.legalDate });
  const a = E.compareHousehold(P, basic, P.levyDefault), b = E.compareHousehold(P, adv, P.levyDefault);
  assert.deepEqual(b.current, a.current); assert.deepEqual(b.levy, a.levy);
});
test("kalkulačka: podrobné zadání mění jen dnešní poplatek, ne odvod C", () => {
  const basic = { adults: [{ type: "emp", grossMonthly: 9000 }] };
  const kids = Object.assign({}, basic, { kids6_15: 2 });
  const a = E.compareHousehold(P, basic, P.levyDefault), b = E.compareHousehold(P, kids, P.levyDefault);
  assert.ok(b.current.limit > a.current.limit, "děti zvyšují limit osvobození");
  assert.equal(b.levy.total, a.levy.total, "odvod je individuální, děti ho nemění");
});

/* ---------- statická čísla v HTML odpovídají datům ---------- */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function countries() {
  const i = html.indexOf("var COUNTRIES ="), j = Math.min(html.indexOf("</script>", i), html.indexOf("var TIMELINE", i));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(i, j).replace("var COUNTRIES", "this.COUNTRIES"), ctx);
  return ctx;
}
test("HTML: počet zemí v textech (data-n-countries) = délka datové sady", () => {
  const n = countries().COUNTRIES.length;
  const vals = [...html.matchAll(/data-n-countries>(\d+)</g)].map((m) => +m[1]);
  assert.ok(vals.length >= 3); vals.forEach((v) => assert.equal(v, n));
  assert.ok(html.includes("Prozkoumejte 45 evropských zemí") ? n === 45 : true, "metadata uvádějí 45");
});
test("HTML: roční poplatek v bloku Aktuální Česko = (150 + 55) × 12 z params", () => {
  const annual = (P.fee.tvMonthly.value + P.fee.radioMonthly.value) * 12;
  const m = html.match(/data-fee-annual>([\d&nbsp;\s]+)</);
  assert.ok(m); assert.equal(+m[1].replace(/&nbsp;|\s/g, ""), annual);
});
test("HTML: zátěž počítá jen srovnatelné země a nikdy rozpočtové", () => {
  const ctx = countries();
  const inc = html.match(/var INCOME = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":');
  const INCOME = JSON.parse(inc);
  for (const iso of Object.keys(INCOME)) {
    const c = ctx.COUNTRIES.find((x) => x.iso === iso);
    assert.ok(c, iso); assert.ok(["dom", "dev", "ele"].includes(c.model), iso + " má paušální poplatek za domácnost"); assert.ok(c.eur > 0, iso);
  }
  assert.equal(Object.keys(INCOME).length, 13);
  assert.ok(Math.abs(101 / INCOME.CZ * 100 - 0.667) < 0.01, "Česko asi 0,67 %");
});
