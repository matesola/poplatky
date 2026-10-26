// @ts-check
/* Poplatky · výpočetní jádro „Jak by mohlo Česko platit“
 * Čisté funkce bez DOM. Stejný kód běží v prohlížeči (globalThis.PoplatkyEngine)
 * i v Node pro testy (module.exports). Žádná data neodcházejí ze zařízení.
 */
(function (root) {
  "use strict";

  /**
   * @typedef {"emp"|"self"|"pens"|"none"} IncomeType
   * @typedef {{type: IncomeType, grossMonthly: number}} Adult
   * @typedef {{adults: Adult[], kids0_6?: number, kids6_15?: number, kids15_26?: number,
   *            disabilityExempt?: boolean, noDevice?: boolean, netOverride?: number|null, date?: string}} Household
   * @typedef {{rate:number, threshold:number, cap:number, marginal:boolean, includePensions:boolean, includeSelf?:boolean}} LevyParams
   * @typedef {{monthly:number, annual:number, exempt:boolean, reason:string, limit:number, netMonthly:number, legalDate:string}} CurrentResult
   * @typedef {{perAdult:number[], total:number, diffVsCurrent:number, effShare:number, grossAnnual:number}} LevyResult
   * @typedef {{countF:number, growthAdj:number, lowTail:number, compliance:number}} Scenario
   */

  /** Zaokrouhlení na celé Kč (pro zobrazení i testy). @param {number} x */
  function kc(x) { return Math.round(x); }
  /** @param {number} x @param {number} a @param {number} b */
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ================= SOUČASNÝ SYSTÉM ================= */

  /** Životní minimum platné k datu. @param {any} P @param {string} date ISO */
  function zmRow(P, date) {
    var row = P.zm[0];
    P.zm.forEach(function (/** @type {any} */ r) { if (date >= r.from && (!r.to || date <= r.to)) row = r; });
    return row;
  }

  /** Životní minimum domácnosti (zák. č. 110/2006 Sb.). @param {any} P @param {Household} h */
  function zmHousehold(P, h) {
    var r = zmRow(P, h.date || P.meta.legalDate);
    var nAd = h.adults.length;
    var kids = (h.kids0_6 || 0) + (h.kids6_15 || 0) + (h.kids15_26 || 0);
    var base;
    if (nAd === 1 && kids === 0) base = r.single;
    else if (nAd === 0) base = 0;
    else base = r.firstAdult + (nAd - 1) * r.nextAdult;
    return base + (h.kids0_6 || 0) * r.child0_6 + (h.kids6_15 || 0) * r.child6_15 + (h.kids15_26 || 0) * r.child15_26;
  }

  /** Orientační čistý měsíční příjem jedné osoby. @param {any} P @param {Adult} a */
  function netMonthly(P, a) {
    var g = Math.max(0, a.grossMonthly || 0), n = P.netCalc;
    if (a.type === "pens") return g;            // důchod do limitu nezdaněn
    if (a.type === "none") return g;            // např. dávka, zadáno přímo
    if (a.type === "self") return g * n.selfNetRatio;
    var ins = g * (n.empSocial + n.empHealth);
    var tax = Math.min(g, n.taxHighThresholdMonthly) * n.taxRate + Math.max(0, g - n.taxHighThresholdMonthly) * n.taxRateHigh;
    tax = Math.max(0, tax - n.taxCreditMonthly);
    return g - ins - tax;
  }

  /** Kolik domácnost platí dnes (zák. č. 348/2005 Sb.). @param {any} P @param {Household} h @returns {CurrentResult} */
  function currentFee(P, h) {
    var full = P.fee.tvMonthly.value + P.fee.radioMonthly.value;
    var limit = P.fee.exemptMultiple.value * zmHousehold(P, h);
    var net = (h.netOverride != null && isFinite(h.netOverride)) ? Math.max(0, h.netOverride)
      : h.adults.reduce(function (s, a) { return s + netMonthly(P, a); }, 0);
    var legalDate = h.date || P.meta.legalDate;
    /** @param {string} reason */
    function zero(reason) { return { monthly: 0, annual: 0, exempt: true, reason: reason, limit: limit, netMonthly: net, legalDate: legalDate }; }
    if (h.noDevice) return zero("Domácnost nemá žádné zařízení schopné příjmu.");
    if (h.disabilityExempt) return zero("Osvobození: člen domácnosti s těžkým zrakovým nebo sluchovým postižením.");
    if (h.adults.length && net < limit) return zero("Osvobození: čistý příjem domácnosti je pod 2,15násobkem životního minima. O osvobození je nutné požádat.");
    return { monthly: full, annual: full * 12, exempt: false, reason: "Platí se jednou za domácnost, oba poplatky.", limit: limit, netMonthly: net, legalDate: legalDate };
  }

  /* ================= ÚČELOVÝ ODVOD ================= */

  /** Roční odvod jedné osoby z ročního hrubého příjmu.
   * marginal=true: sazba z části příjmu nad hranicí (finský typ), jinak z celého příjmu nad hranicí.
   * @param {number} annual @param {LevyParams} p */
  function levyPerson(annual, p) {
    var y = Math.max(0, annual || 0);
    if (y <= p.threshold) return 0;
    var base = p.marginal ? (y - p.threshold) : y;
    return Math.min(p.cap, base * p.rate);
  }

  /** Je osoba v okruhu odvodu? @param {IncomeType} type @param {LevyParams} p */
  function inScope(type, p) {
    if (type === "pens") return !!p.includePensions;
    if (type === "self") return p.includeSelf !== false;
    if (type === "none") return false;
    return true;
  }

  /** @param {Household} h @param {LevyParams} p @param {number} currentAnnual @returns {LevyResult} */
  function householdLevy(h, p, currentAnnual) {
    var per = h.adults.map(function (a) { return inScope(a.type, p) ? levyPerson(a.grossMonthly * 12, p) : 0; });
    var total = per.reduce(function (s, x) { return s + x; }, 0);
    var gross = h.adults.reduce(function (s, a) { return s + Math.max(0, a.grossMonthly) * 12; }, 0);
    return { perAdult: per, total: total, diffVsCurrent: total - currentAnnual, effShare: gross > 0 ? total / gross : 0, grossAnnual: gross };
  }

  /** Orientační přepočty rozpočtového modelu. NEJDE o platbu domácnosti. @param {any} P */
  function budgetOrientation(P) {
    var total = P.budget.ct.value + P.budget.cro.value;
    return { total: total, perCapita: total / P.population.value, perHousehold: total / P.households.value };
  }

  /** Srovnání tří scénářů pro domácnost. @param {any} P @param {Household} h @param {LevyParams} lp */
  function compareHousehold(P, h, lp) {
    var cur = currentFee(P, h);
    return { current: cur, budget: { direct: 0, orientation: budgetOrientation(P) }, levy: householdLevy(h, lp, cur.annual) };
  }

  /* ================= ROZDĚLENÍ PŘÍJMŮ ================= */

  /** Kvantilová funkce z publikovaných kvantilů: log-lineární interpolace,
   * lineární dolní chvost k lowTail×P10, Paretův horní chvost kalibrovaný tak, aby průměr seděl.
   * Vrací funkci p -> měsíční příjem. @param {[number,number][]} q @param {number} mean @param {number} lowTail */
  function quantileFn(q, mean, lowTail) {
    var pts = q.slice().sort(function (a, b) { return a[0] - b[0]; });
    var p0 = pts[0][0], v0 = pts[0][1], pN = pts[pts.length - 1][0], vN = pts[pts.length - 1][1];
    var vMin = lowTail * v0;
    /** @param {number} p */
    function body(p) {
      if (p <= p0) return vMin + (v0 - vMin) * (p / p0);
      for (var i = 1; i < pts.length; i++) {
        if (p <= pts[i][0]) {
          var a = pts[i - 1], b = pts[i], t = (p - a[0]) / (b[0] - a[0]);
          return Math.exp(Math.log(a[1]) + t * (Math.log(b[1]) - Math.log(a[1])));
        }
      }
      return vN;
    }
    // průměr těla (numericky) a dopočet Paretova exponentu alfa pro chvost nad pN
    var n = 4000, s = 0;
    for (var k = 0; k < n; k++) { var pp = (k + 0.5) / n * pN; s += body(pp); }
    var bodyMean = s / n * pN;                       // ∫_0^pN Q
    var tailMass = 1 - pN;
    var needed = (mean - bodyMean) / tailMass;       // průměr chvostu
    var alpha = needed > vN * 1.0001 ? needed / (needed - vN) : 50; // E[X|tail]=vN·α/(α-1)
    alpha = clamp(alpha, 1.05, 50);
    /** @param {number} p */
    var fn = function (p) {
      if (p <= pN) return body(p);
      return vN * Math.pow(tailMass / Math.max(1e-9, 1 - p), 1 / alpha);
    };
    /** @type {any} */ (fn).alpha = alpha;
    return fn;
  }

  /** Lognormální kvantil přes inverzní normální rozdělení. @param {number} p */
  function invNorm(p) {
    // Acklamův algoritmus
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /** @typedef {{group:string, type:IncomeType, annual:number, w:number}} Person */

  /** Syntetická populace (ročních hrubých příjmů) pro scénář. @param {any} P @param {LevyParams} lp @param {Scenario} sc @returns {Person[]} */
  function population(P, lp, sc) {
    var G = P.groups, n = P.sim.points, out = /** @type {Person[]} */ ([]);
    var growth = 1 + P.sim.wageGrowth2026.value + sc.growthAdj;
    [["emp", G.emp], ["pub", G.pub]].forEach(function (pair) {
      var g = pair[1], f = quantileFn(g.q, g.mean, sc.lowTail), w = g.count * sc.countF / n;
      for (var i = 0; i < n; i++) out.push({ group: String(pair[0]), type: "emp", annual: 12 * growth * f((i + 0.5) / n), w: w });
    });
    if (lp.includePensions) {
      [["pens", G.pens], ["inv", G.inv]].forEach(function (pair) {
        var g = pair[1], s2 = Math.log(1 + g.cv * g.cv), mu = Math.log(g.mean) - s2 / 2, s = Math.sqrt(s2), w = g.count / n;
        for (var i = 0; i < n; i++) out.push({ group: String(pair[0]), type: "pens", annual: 12 * Math.exp(mu + s * invNorm((i + 0.5) / n)), w: w });
      });
    }
    if (lp.includeSelf) {
      var g = G.self, w = g.count * sc.countF / n, mu = Math.log(g.medianAnnual * growth);
      for (var i = 0; i < n; i++) out.push({ group: "self", type: "self", annual: Math.exp(mu + g.sigma * invNorm((i + 0.5) / n)), w: w });
    }
    return out;
  }

  /** Výnos jednoho scénáře. @param {any} P @param {LevyParams} lp @param {Scenario} sc */
  function revenue(P, lp, sc) {
    var pop = population(P, lp, sc), gross = 0, people = 0, exempt = 0, capped = 0;
    pop.forEach(function (x) {
      var l = levyPerson(x.annual, lp);
      gross += l * x.w; people += x.w;
      if (l === 0) exempt += x.w;
      if (l >= lp.cap - 1e-9 && lp.cap > 0) capped += x.w;
    });
    gross *= sc.compliance;
    return { gross: gross, people: people, exemptShare: people ? exempt / people : 0, cappedShare: people ? capped / people : 0, pop: pop };
  }

  /** Celostátní simulace s intervalem a bilancí.
   * @param {any} P @param {LevyParams & {adminCostRate:number, reserveRate:number}} lp @param {number} target cílový čistý výnos (Kč) */
  function simulate(P, lp, target) {
    var S = P.sim.scenarios, res = /** @type {any} */ ({});
    ["low", "mid", "high"].forEach(function (k) {
      var r = revenue(P, lp, S[k]);
      var admin = r.gross * lp.adminCostRate, reserve = r.gross * lp.reserveRate, net = r.gross - admin - reserve;
      res[k] = { gross: r.gross, admin: admin, reserve: reserve, net: net, gap: net - target, exemptShare: r.exemptShare, cappedShare: r.cappedShare, people: r.people };
      if (k === "mid") res.deciles = deciles(r.pop, lp);
    });
    res.balanced = ["low", "mid", "high"].every(function (k) { var x = res[k]; return Math.abs(x.gross - x.admin - x.reserve - x.net) < 1; });
    res.target = target;
    res.sufficient = res.low.net >= target ? "ano" : (res.high.net >= target ? "nejisté" : "ne");
    return res;
  }

  /** Zatížení podle decilů osob v okruhu odvodu. @param {Person[]} pop @param {LevyParams} lp */
  function deciles(pop, lp) {
    var arr = pop.slice().sort(function (a, b) { return a.annual - b.annual; });
    var tot = arr.reduce(function (s, x) { return s + x.w; }, 0), step = tot / 10;
    var out = [], acc = 0, k = 0, cur = { w: 0, inc: 0, lev: 0, max: 0 };
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i], l = levyPerson(x.annual, lp);
      cur.w += x.w; cur.inc += x.annual * x.w; cur.lev += l * x.w; cur.max = x.annual; acc += x.w;
      if (acc >= step * (k + 1) - 1e-6 || i === arr.length - 1) {
        out.push({ d: k + 1, upper: cur.max, avgIncome: cur.inc / cur.w, avgLevy: cur.lev / cur.w, share: cur.inc ? cur.lev / cur.inc : 0, total: cur.lev });
        k++; cur = { w: 0, inc: 0, lev: 0, max: 0 };
        if (k === 10) break;
      }
    }
    return out;
  }

  /** Kalibrace: najde sazbu (při daném stropu) nebo strop (při dané sazbě) pro cílový čistý výnos ve zvoleném scénáři.
   * @param {any} P @param {LevyParams & {adminCostRate:number, reserveRate:number}} lp @param {number} target
   * @param {"rate"|"cap"} solveFor @param {"low"|"mid"|"high"} scenario
   * @param {{rateMax?:number, capMax?:number}} [limits] */
  function calibrate(P, lp, target, solveFor, scenario, limits) {
    var L = limits || {}, sc = P.sim.scenarios[scenario];
    var keep = 1 - lp.adminCostRate - lp.reserveRate;
    /** @param {number} x */
    function netFor(x) {
      var q = Object.assign({}, lp); q[solveFor] = x;
      return revenue(P, q, sc).gross * keep;
    }
    var lo = 0, hi = solveFor === "rate" ? (L.rateMax || 0.05) : (L.capMax || 20000);
    if (netFor(hi) < target) return { ok: false, value: hi, achieved: netFor(hi), reason: "Cíl nelze dosáhnout ani na horní mezi " + (solveFor === "rate" ? "sazby" : "stropu") + "." };
    for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if (netFor(mid) >= target) hi = mid; else lo = mid; }
    return { ok: true, value: hi, achieved: netFor(hi), reason: "" };
  }

  /** Citlivost čistého výnosu (centrální scénář) na změnu parametrů. @param {any} P @param {any} lp */
  function sensitivity(P, lp) {
    var base = simulate(P, lp, 0).mid.net;
    /** @param {string} k @param {number} d @param {string} label */
    function delta(k, d, label) {
      var q = Object.assign({}, lp); q[k] = Math.max(0, lp[k] + d);
      return { label: label, value: simulate(P, q, 0).mid.net - base };
    }
    return [
      delta("rate", 0.001, "sazba +0,1 p. b."), delta("rate", -0.001, "sazba −0,1 p. b."),
      delta("cap", 500, "strop +500 Kč"), delta("cap", -500, "strop −500 Kč"),
      delta("threshold", 50000, "hranice +50 000 Kč"), delta("threshold", -50000, "hranice −50 000 Kč")
    ];
  }

  /** Křivka „Kdo kolik zaplatí“ pro jednotlivce (Graf A). @param {any} P @param {LevyParams} lp @param {number[]} monthlyIncomes */
  function payCurve(P, lp, monthlyIncomes) {
    var full = (P.fee.tvMonthly.value + P.fee.radioMonthly.value) * 12;
    return monthlyIncomes.map(function (m) {
      var hh = { adults: [{ type: /** @type {IncomeType} */ ("emp"), grossMonthly: m }] };
      var cur = currentFee(P, hh);
      return { monthly: m, current: cur.annual, currentFull: full, levy: levyPerson(m * 12, lp) };
    });
  }

  /** Rozdíl proti dnešku podle typu domácnosti (Graf B). @param {any} P @param {LevyParams} lp @param {number[]} incomes */
  function diffCurves(P, lp, incomes) {
    /** @type {{id:string,label:string,make:(m:number)=>Household}[]} */
    var types = [
      { id: "single", label: "Jednotlivec, zaměstnanec", make: function (m) { return { adults: [{ type: "emp", grossMonthly: m }] }; } },
      { id: "couple2", label: "Pár, oba vydělávají m", make: function (m) { return { adults: [{ type: "emp", grossMonthly: m }, { type: "emp", grossMonthly: m }] }; } },
      { id: "couple1", label: "Pár, jeden příjem m", make: function (m) { return { adults: [{ type: "emp", grossMonthly: m }, { type: "none", grossMonthly: 0 }] }; } },
      { id: "pens", label: "Osamělý důchodce s důchodem m", make: function (m) { return { adults: [{ type: "pens", grossMonthly: m }] }; } }
    ];
    return types.map(function (t) {
      return { id: t.id, label: t.label, points: incomes.map(function (m) { var c = compareHousehold(P, t.make(m), lp); return { monthly: m, diff: c.levy.total - c.current.annual }; }) };
    });
  }

  /** Projekce 10 let (Graf D). Nominálně i reálně (ceny roku 2026). Projekce, ne prognóza.
   * Zjednodušení: počet plátců poplatku a struktura příjmů se nemění, valorizační pravidla se uplatní mechanicky.
   * @param {any} P @param {any} lp parametry odvodu (+adminCostRate, reserveRate)
   * @param {{inflation:number, realWageGrowth:number, levyIndexed:boolean}} o */
  function project(P, lp, o) {
    var years = [], cpi = 1;
    var feeBaseRev = P.reference.filter(function (/** @type {any} */ r) { return r.year === 2026 && r.cat === "fakt" && /plán/.test(r.kind); })
      .reduce(function (/** @type {number} */ s, /** @type {any} */ r) { return s + r.value; }, 0);
    var fv = P.fee.valorization.value, bv = P.budget.valorization.value, cnb = P.projection.cnb;
    // poplatek naposledy zvýšen 1. 5. 2025; do kumulace započteme inflaci 2025 (od května, ~2/3 roku) a 2026 (prognóza ČNB)
    var feeLevel = 1, feeCum = (1 + 0.025 * 8 / 12) * (1 + cnb[2026]), pendingFee = false;
    // rozpočtový model: kumulace „od roku 2026“
    var bud = P.budget.ct.value + P.budget.cro.value, budCum = (1 + cnb[2026]);
    var keep = 1 - lp.adminCostRate - lp.reserveRate, sc = P.sim.scenarios.mid;
    var wage = 1, levyIdxBase = 0;
    for (var y = 2027; y < 2027 + P.projection.years; y++) {
      cpi *= (1 + o.inflation); wage *= (1 + o.inflation + o.realWageGrowth);
      // poplatek: zvýšení o 6 % účinné od 1. 7. roku následujícího po roce, kdy kumulace přesáhla 6 %
      var feeFactor = feeLevel;
      if (pendingFee) { feeFactor = feeLevel * (1 + fv.step * 0.5); feeLevel *= (1 + fv.step); pendingFee = false; feeCum = 1; }
      feeCum *= (1 + o.inflation);
      if (feeCum - 1 > fv.threshold) pendingFee = true;
      var feeRev = feeBaseRev * feeFactor;
      // rozpočtový model: +10 % v roce následujícím po překročení 10 p. b.
      if (budCum - 1 > bv.threshold) { bud *= (1 + bv.step); budCum = 1; }
      budCum *= (1 + o.inflation);
      // odvod: příjmy rostou s nominálními mzdami; hranice a strop buď indexované, nebo pevné
      var levyRev;
      var sc2 = Object.assign({}, sc, { growthAdj: (1 + P.sim.wageGrowth2026.value) * wage - 1 - P.sim.wageGrowth2026.value });
      if (o.levyIndexed) {
        if (!levyIdxBase) levyIdxBase = revenue(P, lp, sc2).gross * keep / wage;
        levyRev = levyIdxBase * wage;
      } else levyRev = revenue(P, lp, sc2).gross * keep;
      years.push({ year: y, cpi: cpi, wage: wage,
        fee: { nominal: feeRev, real: feeRev / cpi, perHouseholdAnnual: (P.fee.tvMonthly.value + P.fee.radioMonthly.value) * 12 * feeLevel },
        budget: { nominal: bud, real: bud / cpi }, levy: { nominal: levyRev, real: levyRev / cpi } });
    }
    return years;
  }

  var E = { kc: kc, zmHousehold: zmHousehold, netMonthly: netMonthly, currentFee: currentFee, levyPerson: levyPerson,
    householdLevy: householdLevy, budgetOrientation: budgetOrientation, compareHousehold: compareHousehold,
    quantileFn: quantileFn, invNorm: invNorm, population: population, revenue: revenue, simulate: simulate,
    deciles: deciles, calibrate: calibrate, sensitivity: sensitivity, payCurve: payCurve, diffCurves: diffCurves, project: project };
  root.PoplatkyEngine = E;
  if (typeof module !== "undefined" && module.exports) module.exports = E;
})(/** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : this));
