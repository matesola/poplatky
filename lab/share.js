// @ts-check
/* Kdo platí? · Sdílení scénářů přes URL.
 * Čisté funkce bez DOM: převod stavu kalkulačky a simulátoru na parametry odkazu a zpět.
 * Zásady:
 *  - příjmy se do odkazu dostanou jen po výslovném souhlasu (includeIncome) a zaokrouhlené na 1 000 Kč,
 *  - přesný čistý příjem domácnosti se nesdílí nikdy,
 *  - každý načtený parametr se validuje a ořízne na rozsah ovládacích prvků; neznámé nebo vadné hodnoty se ignorují,
 *  - porovnání zemí přijímá jen kódy existujících zemí, nejvýš 4, bez opakování.
 */
(function (root) {
  "use strict";

  var TYPES = ["emp", "self", "pens", "emppens", "none"];
  /** Rozsahy odpovídají posuvníkům v index.html. */
  /** @type {Object<string, number[]>} */
  var RANGE = {
    rate: [0, 0.03], threshold: [0, 600000], cap: [0, 15000], adminCostRate: [0, 0.03], reserveRate: [0, 0.1],
    gross: [0, 10000000], pension: [0, 1000000], kids: [0, 8], targetMld: [0, 100]
  };
  var MAX_ADULTS = 4, MAX_COUNTRIES = 4, INCOME_ROUND = 1000;

  /** @param {number} v @param {number[]} r */
  function clamp(v, r) { return Math.min(r[1], Math.max(r[0], v)); }
  /** @param {string|null} s @returns {number|null} */
  function num(s) { if (s === null || s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null; var v = +s; return isFinite(v) ? v : null; }
  /** @param {number} v */
  function roundInc(v) { return Math.round(v / INCOME_ROUND) * INCOME_ROUND; }

  /**
   * @typedef {{type:string, gross:number, pension?:number, sensory?:boolean}} SAdult
   * @typedef {{adults:SAdult[], kids0_6:number, kids6_15:number, kids15_26:number, noDev:boolean, date:string,
   *   lp:{rate:number, threshold:number, cap:number, marginal:boolean, includePensions:boolean, includeSelf?:boolean, adminCostRate:number, reserveRate:number},
   *   target:string, targetCustom:number}} SState
   */

  /** Stav kalkulačky a simulátoru do parametrů odkazu.
   * @param {SState} st @param {{includeIncome?:boolean}} [opt] @returns {string} query bez „?“ */
  function encodeScenario(st, opt) {
    var o = opt || {}, q = [];
    q.push("v=1");
    q.push("a=" + st.adults.slice(0, MAX_ADULTS).map(function (a) {
      var t = TYPES.indexOf(a.type) >= 0 ? a.type : "emp";
      if (!o.includeIncome || t === "none") return t;
      var s = t + "-" + roundInc(clamp(+a.gross || 0, RANGE.gross));
      if (t === "emppens") s += "-" + roundInc(clamp(+(a.pension || 0), RANGE.pension));
      return s;
    }).join("."));
    if (o.includeIncome) q.push("p=1");
    var sens = st.adults.slice(0, MAX_ADULTS).map(function (a, i) { return a.sensory ? i : -1; }).filter(function (i) { return i >= 0; });
    if (sens.length) q.push("s=" + sens.join("."));
    if (st.kids0_6 || st.kids6_15 || st.kids15_26) q.push("k=" + [st.kids0_6, st.kids6_15, st.kids15_26].join("."));
    if (st.noDev) q.push("nd=1");
    if (st.date < "2026-10-01") q.push("zm=0930");
    var lp = st.lp;
    q.push("r=" + lp.rate, "t=" + lp.threshold, "c=" + lp.cap, "m=" + (lp.marginal ? 1 : 0), "pp=" + (lp.includePensions ? 1 : 0));
    if (lp.includeSelf) q.push("os=1");
    q.push("adm=" + lp.adminCostRate, "res=" + lp.reserveRate);
    q.push("cil=" + (st.target === "custom" ? String(Math.round(st.targetCustom / 1e7) / 100) : st.target));
    return q.join("&");
  }

  /** Parametry odkazu do (částečného) stavu. Vrací jen platné hodnoty.
   * @param {string} search např. "?v=1&a=emp.emp" @param {{rate:number, threshold:number, cap:number, marginal:boolean, includePensions:boolean, includeSelf?:boolean, adminCostRate:number, reserveRate:number}} defaults
   * @returns {{ok:boolean, incomes:boolean, state:any, ignored:string[]}} */
  function decodeScenario(search, defaults) {
    var u = parseQuery(search), out = /** @type {any} */ ({}), ignored = /** @type {string[]} */ ([]);
    if (u.v !== "1") return { ok: false, incomes: false, state: {}, ignored: [] };
    var incomes = u.p === "1";
    if (u.a) {
      var adults = u.a.split(".").slice(0, MAX_ADULTS).map(function (tok) {
        var parts = tok.split("-"), t = parts[0];
        if (TYPES.indexOf(t) < 0) { ignored.push("a:" + tok); return null; }
        var a = /** @type {SAdult} */ ({ type: t, gross: 0 });
        if (incomes && t !== "none") {
          var g = num(parts[1] || null); if (g !== null) a.gross = clamp(g, RANGE.gross); else ignored.push("a:" + tok);
          if (t === "emppens") { var pe = num(parts[2] || null); a.pension = pe !== null ? clamp(pe, RANGE.pension) : 0; }
        }
        return a;
      }).filter(Boolean);
      if (adults.length) out.adults = adults;
    }
    if (u.s && out.adults) u.s.split(".").forEach(function (x) { var i = num(x); if (i !== null && out.adults[i]) out.adults[i].sensory = true; else ignored.push("s:" + x); });
    if (u.k) {
      var k = u.k.split(".").map(function (x) { var v = num(x); return v === null ? null : Math.round(clamp(v, RANGE.kids)); });
      if (k.length === 3 && k.every(function (v) { return v !== null; })) { out.kids0_6 = k[0]; out.kids6_15 = k[1]; out.kids15_26 = k[2]; } else ignored.push("k");
    }
    if (u.nd === "1") out.noDev = true;
    if (u.zm === "0930") out.date = "2026-09-30";
    var lp = /** @type {any} */ (Object.assign({}, defaults)), lpTouched = false;
    /** @param {string} key @param {string} field */
    function n(key, field) { var v = num(u[key] === undefined ? null : u[key]); if (u[key] === undefined) return; if (v === null) { ignored.push(key); return; } lp[field] = clamp(v, RANGE[field]); lpTouched = true; }
    n("r", "rate"); n("t", "threshold"); n("c", "cap"); n("adm", "adminCostRate"); n("res", "reserveRate");
    /** @param {string} key @param {string} field */
    function b(key, field) { if (u[key] === "1" || u[key] === "0") { lp[field] = u[key] === "1"; lpTouched = true; } else if (u[key] !== undefined) ignored.push(key); }
    b("m", "marginal"); b("pp", "includePensions"); b("os", "includeSelf");
    if (lpTouched) out.lp = lp;
    if (u.cil !== undefined) {
      if (u.cil === "budget" || u.cil === "plan2026") out.target = u.cil;
      else { var t = num(u.cil); if (t !== null) { out.target = "custom"; out.targetCustom = clamp(t, RANGE.targetMld) * 1e9; } else ignored.push("cil"); }
    }
    return { ok: true, incomes: incomes, state: out, ignored: ignored };
  }

  /** Porovnání zemí z parametru „srovnat“. @param {string} search @param {string[]} validIso @returns {string[]} */
  function decodeCompare(search, validIso) {
    var u = parseQuery(search), seen = /** @type {Object<string, boolean>} */ ({});
    if (!u.srovnat) return [];
    return u.srovnat.toUpperCase().split(/[.,]/).filter(function (c) {
      if (!/^[A-Z]{2}$/.test(c) || validIso.indexOf(c) < 0 || seen[c]) return false;
      seen[c] = true; return true;
    }).slice(0, MAX_COUNTRIES);
  }

  /** @param {string} search @returns {Object<string,string>} */
  function parseQuery(search) {
    var out = /** @type {Object<string,string>} */ ({});
    String(search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("="), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? "" : kv.slice(i + 1);
      try { k = decodeURIComponent(k); v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return; }
      if (/^[a-z]{1,8}$/.test(k) && v.length <= 200) out[k] = v;
    });
    return out;
  }

  var api = { encodeScenario: encodeScenario, decodeScenario: decodeScenario, decodeCompare: decodeCompare, parseQuery: parseQuery, RANGE: RANGE, INCOME_ROUND: INCOME_ROUND };
  /** @type {any} */ (root).PoplatkyShare = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
