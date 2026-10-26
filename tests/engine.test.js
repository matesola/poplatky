// Jednotkové testy výpočetního jádra. Spuštění: npm test  (node --test)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../lab/params.js");
const E = require("../lab/engine.js");

const LP = Object.assign({}, P.levyDefault, { rate: 0.01, threshold: 300000, cap: 3000, marginal: true, includePensions: true, includeSelf: false });
const emp = (m) => ({ type: "emp", grossMonthly: m });
const pens = (m) => ({ type: "pens", grossMonthly: m });

test("současný poplatek: plná výše 205 Kč měsíčně, 2 460 Kč ročně", () => {
  const r = E.currentFee(P, { adults: [emp(40000)] });
  assert.equal(r.monthly, 205);
  assert.equal(r.annual, 2460);
  assert.equal(r.exempt, false);
});

test("současný poplatek: jednou za domácnost bez ohledu na počet dospělých", () => {
  const r = E.currentFee(P, { adults: [emp(40000), emp(60000), emp(30000)] });
  assert.equal(r.annual, 2460);
});

test("osvobození: nulový příjem domácnosti", () => {
  const r = E.currentFee(P, { adults: [{ type: "none", grossMonthly: 0 }] });
  assert.equal(r.exempt, true);
  assert.equal(r.annual, 0);
  assert.equal(r.certain, false);
});

test("osvobození: limit 2,15 × ŽM jednotlivce k 26. 10. 2026 = 11 825 Kč, s přesným čistým příjmem", () => {
  const h = { adults: [pens(11824)], netOverride: 11824 };
  assert.equal(Math.round(E.currentFee(P, h).limit), 11825);
  assert.equal(E.currentFee(P, h).exempt, true);
  assert.equal(E.currentFee(P, { adults: [pens(11826)], netOverride: 11826 }).exempt, false);
  assert.equal(E.currentFee(P, { adults: [pens(11825)], netOverride: 11825 }).exempt, false, "limit je ostrý: „nižší než“");
});

test("osvobození: před 1. 10. 2026 platil nižší limit 10 449 Kč", () => {
  const r = E.currentFee(P, { adults: [pens(11000)], date: "2026-09-15", netOverride: 11000 });
  assert.equal(Math.round(r.limit), 10449);
  assert.equal(r.exempt, false);
});

test("osvobození: pár dospělých, limit 2,15 × (5 000 + 3 750)", () => {
  const r = E.currentFee(P, { adults: [pens(9000), pens(9000)], netOverride: 18000 });
  assert.equal(Math.round(r.limit * 100) / 100, 18812.5);
  assert.equal(r.exempt, true);
});

test("osvobození: děti zvyšují limit", () => {
  const a = E.currentFee(P, { adults: [emp(25000)] });
  const b = E.currentFee(P, { adults: [emp(25000)], kids6_15: 2 });
  assert.ok(b.limit > a.limit);
  assert.equal(Math.round(b.limit), Math.round(2.15 * (5000 + 2 * 3050)));
});

test("osvobození: slepota/hluchota jen když ji mají všichni dospělí", () => {
  const blind = { type: "emp", grossMonthly: 80000, sensory: true };
  assert.equal(E.currentFee(P, { adults: [blind] }).annual, 0);
  assert.equal(E.currentFee(P, { adults: [blind], kids6_15: 2 }).annual, 0, "nezaopatřené děti se nepočítají");
  assert.equal(E.currentFee(P, { adults: [blind, { ...blind }] }).annual, 0);
  const mixed = E.currentFee(P, { adults: [blind, emp(50000)] });
  assert.equal(mixed.annual, 2460, "s dospělým bez postižení se zdravotní osvobození neuplatní");
  assert.match(mixed.reason, /neuplatní/);
});

test("osvobození: domácnost bez zařízení", () => {
  assert.equal(E.currentFee(P, { adults: [emp(80000)], noDevice: true }).annual, 0);
});

test("osvobození z odhadu je vždy podmíněné, v pásmu u limitu nerozhodnuté", () => {
  const low = E.currentFee(P, { adults: [pens(8000)] });
  assert.equal(low.status, "pravdepodobne"); assert.equal(low.certain, false); assert.equal(low.annual, 0);
  const edge = E.currentFee(P, { adults: [pens(11825)] });
  assert.equal(edge.status, "hranice"); assert.equal(edge.certain, false);
  const high = E.currentFee(P, { adults: [pens(30000)] });
  assert.equal(high.status, "plati"); assert.equal(high.certain, true);
});

test("osvobození: ruční zadání čistého příjmu má přednost před odhadem", () => {
  assert.equal(E.currentFee(P, { adults: [emp(80000)], netOverride: 5000 }).exempt, true);
});

test("čistý příjem: minimální mzda 22 400 Kč dává přibližně 19 000 Kč", () => {
  const n = E.netMonthly(P, emp(22400));
  assert.ok(n > 18800 && n < 19300, String(n));
});

test("odvod: nulový příjem i příjem na hranici = 0", () => {
  assert.equal(E.levyPerson(0, LP), 0);
  assert.equal(E.levyPerson(-5, LP), 0);
  assert.equal(E.levyPerson(300000, LP), 0);
});

test("odvod: sazba jen z části nad hranicí", () => {
  assert.equal(E.levyPerson(400000, LP), 1000);
});

test("odvod: překročení stropu", () => {
  assert.equal(E.levyPerson(10_000_000, LP), 3000);
  assert.equal(E.levyPerson(600000, LP), 3000);
  assert.equal(E.levyPerson(599999, LP) < 3000, true);
});

test("odvod: varianta z celého příjmu nad hranicí", () => {
  const p = Object.assign({}, LP, { marginal: false });
  assert.equal(E.levyPerson(300001, p), Math.min(3000, 300001 * 0.01));
});

test("odvod: individuální, ne z příjmu domácnosti", () => {
  const two = E.householdLevy({ adults: [emp(30000), emp(30000)] }, LP, 0).total;
  const one = E.householdLevy({ adults: [emp(60000), { type: "none", grossMonthly: 0 }] }, LP, 0).total;
  assert.equal(two, 2 * E.levyPerson(360000, LP));
  assert.notEqual(two, one);
});

test("odvod: OSVČ jsou v kalkulačce domácnosti vždy v okruhu (volba OSVČ se týká jen celostátních dat)", () => {
  const p = Object.assign({}, LP, { includeSelf: false });
  assert.equal(E.householdLevy({ adults: [{ type: "self", grossMonthly: 60000 }] }, p, 0).total, E.levyPerson(720000, p));
});

test("odvod: souběh mzdy a důchodu se sčítá do jednoho základu", () => {
  const a = { type: "emppens", grossMonthly: 20000, pensionMonthly: 20000 };
  assert.equal(E.householdLevy({ adults: [a] }, LP, 0).total, E.levyPerson(480000, LP));
  const noP = Object.assign({}, LP, { includePensions: false });
  assert.equal(E.householdLevy({ adults: [a] }, noP, 0).total, E.levyPerson(240000, noP));
});

test("odvod: důchody lze vyřadit z okruhu", () => {
  const p = Object.assign({}, LP, { includePensions: false });
  assert.equal(E.householdLevy({ adults: [pens(40000)] }, p, 0).total, 0);
  assert.ok(E.householdLevy({ adults: [pens(40000)] }, LP, 0).total > 0);
});

test("odvod: efektivní podíl a rozdíl proti dnešku", () => {
  const r = E.householdLevy({ adults: [emp(50000)] }, LP, 2460);
  assert.equal(r.total, 3000);
  assert.equal(r.diffVsCurrent, 540);
  assert.equal(Math.round(r.effShare * 1e6), Math.round(3000 / 600000 * 1e6));
});

test("rozpočtový model: přímá platba 0, celkové náklady nejsou nulové", () => {
  const c = E.compareHousehold(P, { adults: [emp(40000)] }, LP);
  assert.equal(c.budget.direct, 0);
  assert.equal(c.budget.orientation.total, 5741826000 + 2065766000);
  assert.ok(c.budget.orientation.perCapita > 600 && c.budget.orientation.perCapita < 800);
});

test("rozdělení: kvantilová funkce prochází publikovanými kvantily a drží průměr", () => {
  const g = P.groups.emp, f = E.quantileFn(g.q, g.mean, 0.4);
  for (const [p, v] of g.q) assert.ok(Math.abs(f(p) - v) < 1, `${p}`);
  let s = 0; const n = 20000;
  for (let i = 0; i < n; i++) s += f((i + 0.5) / n);
  assert.ok(Math.abs(s / n - g.mean) / g.mean < 0.01, String(s / n));
});

test("inverzní normální rozdělení", () => {
  assert.ok(Math.abs(E.invNorm(0.5)) < 1e-9);
  assert.ok(Math.abs(E.invNorm(0.975) - 1.959964) < 1e-4);
});

test("simulátor: bilance hrubý = čistý + správa + rezerva ve všech scénářích", () => {
  const s = E.simulate(P, LP, 7.8e9);
  assert.equal(s.balanced, true);
  for (const k of ["low", "mid", "high"]) {
    assert.ok(Math.abs(s[k].gross - s[k].net - s[k].admin - s[k].reserve) < 1);
  }
  assert.ok(s.low.net <= s.mid.net && s.mid.net <= s.high.net);
});

test("simulátor: nulová sazba nebo strop dají nulový výnos", () => {
  assert.equal(E.simulate(P, Object.assign({}, LP, { rate: 0 }), 1).mid.gross, 0);
  assert.equal(E.simulate(P, Object.assign({}, LP, { cap: 0 }), 1).mid.gross, 0);
});

test("simulátor: výnos nemůže přesáhnout strop × počet osob", () => {
  const s = E.simulate(P, LP, 0);
  assert.ok(s.high.gross <= LP.cap * s.high.people + 1);
});

test("simulátor: decily pokrývají 10 skupin a odvod nad stropem neroste", () => {
  const d = E.simulate(P, LP, 0).deciles;
  assert.equal(d.length, 10);
  d.forEach((x) => assert.ok(x.avgLevy <= LP.cap + 1e-6));
  assert.ok(d[0].avgLevy <= d[9].avgLevy);
});

test("simulátor: verdikt dostatečnosti jen podle spočteného intervalu", () => {
  const s0 = E.simulate(P, LP, 1); assert.equal(s0.sufficient, "ano");
  const s1 = E.simulate(P, LP, 1e12); assert.equal(s1.sufficient, "ne");
});

test("kalibrace: nalezená sazba dosáhne cíle a je minimální", () => {
  const target = 7.805e9;
  const c = E.calibrate(P, LP, target, "rate", "mid");
  assert.equal(c.ok, true);
  assert.ok(c.achieved >= target - 1);
  const less = E.simulate(P, Object.assign({}, LP, { rate: c.value * 0.98 }), target).mid.net;
  assert.ok(less < target);
});

test("kalibrace: nedosažitelný cíl je ohlášen, ne zamlčen", () => {
  const c = E.calibrate(P, LP, 1e12, "rate", "mid", { rateMax: 0.02 });
  assert.equal(c.ok, false);
});

test("projekce: rozpočtový model se zvýší o 10 % až po překročení 10 % inflace", () => {
  const pr = E.project(P, Object.assign({}, LP), { inflation: 0.02, realWageGrowth: 0.015, levyIndexed: true });
  const base = 5741826000 + 2065766000;
  assert.equal(pr[0].budget.nominal, base);
  const firstRaise = pr.find((y) => y.budget.nominal > base);
  assert.ok(firstRaise && firstRaise.year >= 2030);
  assert.equal(Math.round(firstRaise.budget.nominal), Math.round(base * 1.1));
});

test("projekce: bez inflace se nic nevalorizuje a reálná = nominální", () => {
  const pr = E.project(P, Object.assign({}, LP), { inflation: 0, realWageGrowth: 0, levyIndexed: true });
  const last = pr[pr.length - 1];
  assert.equal(last.budget.nominal, 5741826000 + 2065766000);
  assert.equal(last.budget.real, last.budget.nominal);
});

test("parametry: každý údaj tisku 231 je označen jako návrh, zákonné sazby jako fakt", () => {
  assert.equal(P.budget.ct.cat, "navrh");
  assert.equal(P.budget.cro.cat, "navrh");
  assert.equal(P.fee.tvMonthly.cat, "fakt");
  assert.equal(P.levyDefault.cat, "autor");
});

/* ---------- povinné hraniční případy a invarianty (audit 2026-10-26) ---------- */
test("hranice: těsně pod, přesně na a těsně nad hranicí", () => {
  assert.equal(E.levyPerson(299999.99, LP), 0);
  assert.equal(E.levyPerson(300000, LP), 0);
  assert.ok(E.levyPerson(300001, LP) > 0);
  assert.ok(Math.abs(E.levyPerson(300001, LP) - 0.01) < 1e-9);
});

test("extrémně vysoký příjem a neplatné vstupy osoby", () => {
  assert.equal(E.levyPerson(1e12, LP), LP.cap);
  assert.equal(E.levyPerson(NaN, LP), 0);
  assert.equal(E.levyPerson(Infinity, LP), 0);
  assert.equal(E.levyPerson("abc", LP), 0);
});

test("dva dospělí s různými příjmy", () => {
  const r = E.householdLevy({ adults: [emp(20000), emp(70000)] }, LP, 2460);
  assert.deepEqual(r.perAdult, [0, 3000]);
  assert.equal(r.total, 3000);
});

test("nulová sazba: nulový odvod i výnos", () => {
  const p = Object.assign({}, LP, { rate: 0 });
  assert.equal(E.levyPerson(1e6, p), 0);
  assert.equal(E.simulate(P, p, 0).mid.gross, 0);
});

test("správní náklady 0 % a extrémní; neplatné kombinace se odmítnou", () => {
  const z = E.simulate(P, Object.assign({}, LP, { adminCostRate: 0, reserveRate: 0 }), 0);
  assert.equal(z.mid.net, z.mid.gross);
  const hi = E.simulate(P, Object.assign({}, LP, { adminCostRate: 0.5, reserveRate: 0.49 }), 0);
  assert.ok(hi.valid && hi.mid.net >= 0);
  const bad = E.simulate(P, Object.assign({}, LP, { adminCostRate: 0.6, reserveRate: 0.5 }), 0);
  assert.equal(bad.valid, false);
});

test("chybějící nebo neplatné parametry: simulace odmítne počítat, nic tiše nezobrazí", () => {
  for (const patch of [{ rate: NaN }, { rate: -0.01 }, { cap: undefined }, { threshold: "300000" }, { rate: 5 }]) {
    const s = E.simulate(P, Object.assign({}, LP, patch), 7e9);
    assert.equal(s.valid, false, JSON.stringify(patch));
    assert.ok(s.errors.length > 0);
    assert.equal(s.mid, undefined);
  }
  assert.equal(E.simulate(P, LP, NaN).valid, false);
  assert.equal(E.calibrate(P, Object.assign({}, LP, { cap: NaN }), 7e9, "rate", "mid").ok, false);
});

test("invariant: výnos nikdy záporný, odvod osoby nikdy nad strop", () => {
  for (const rate of [0, 0.001, 0.01, 0.05, 0.2]) for (const cap of [0, 100, 3000, 1e6]) for (const threshold of [0, 300000, 1e7]) {
    const p = Object.assign({}, LP, { rate, cap, threshold });
    const s = E.simulate(P, p, 0);
    for (const k of ["low", "mid", "high"]) { assert.ok(s[k].gross >= 0 && s[k].net >= 0); }
    for (const y of [0, 1, 299999, 300001, 1e6, 1e9]) { const l = E.levyPerson(y, p); assert.ok(l >= 0 && l <= cap); }
  }
});

test("invariant: osvobozený poplatník neplatí", () => {
  for (const y of [0, 100000, 300000]) assert.equal(E.levyPerson(y, LP), 0);
});

test("invariant: vyšší sazba ani vyšší strop nesnižují hrubý výnos", () => {
  let prev = -1;
  for (const rate of [0, 0.002, 0.005, 0.008, 0.011, 0.015, 0.03]) {
    const g = E.simulate(P, Object.assign({}, LP, { rate }), 0).mid.gross; assert.ok(g >= prev - 1e-6); prev = g;
  }
  prev = -1;
  for (const cap of [0, 500, 1000, 3000, 6000, 15000]) {
    const g = E.simulate(P, Object.assign({}, LP, { cap }), 0).mid.gross; assert.ok(g >= prev - 1e-6); prev = g;
  }
});

test("invariant: součet skupin = celek ve všech scénářích", () => {
  for (const inc of [{ includePensions: true, includeSelf: true }, { includePensions: false, includeSelf: false }]) {
    const s = E.simulate(P, Object.assign({}, LP, inc), 0);
    for (const k of ["low", "mid", "high"]) {
      const sum = Object.values(s[k].groups).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - s[k].gross) < 1, `${k}: ${sum} vs ${s[k].gross}`);
    }
  }
});

test("determinismus: stejné vstupy dávají stejné výsledky", () => {
  assert.deepEqual(E.simulate(P, LP, 7.8e9).mid, E.simulate(P, LP, 7.8e9).mid);
});

test("nezávislý přepočet: výsledek audit/recompute.py se shoduje s jádrem do 0,5 %", () => {
  const fs = require("node:fs"), path = require("node:path");
  const f = path.join(__dirname, "..", "audit", "recompute-results.json");
  if (!fs.existsSync(f)) return; // výsledky se generují skriptem v Pythonu
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.deepEqual(r.transcription_errors, []);
  for (const c of r.cases) assert.ok(Math.abs(c.rel_diff_mid) < 0.005, c.label);
});

test("projekce: důchody se valorizují, výnos odvodu bez indexace roste", () => {
  const pr = E.project(P, Object.assign({}, LP), { inflation: 0.025, realWageGrowth: 0.015, levyIndexed: false });
  assert.ok(pr[9].levy.nominal > pr[0].levy.nominal);
  pr.forEach((y) => { assert.ok(y.levy.nominal >= 0 && y.fee.nominal > 0 && y.budget.nominal > 0); });
});
