/* Poplatky · prezentační vrstva kapitoly „Co kdybychom platili jinak?“
 * Čte POPLATKY_PARAMS, počítá přes PoplatkyEngine. Nic neodesílá, nic neukládá.
 */
(function () {
  "use strict";
  var P = window.POPLATKY_PARAMS, E = window.PoplatkyEngine;
  if (!P || !E || !document.getElementById("simulace")) return;
  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- formátování ---------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(x, d) { return (x).toLocaleString("cs-CZ", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function kc(x) { return num(Math.round(x)) + " Kč"; }
  function mld(x, d) { return num(x / 1e9, d == null ? 1 : d) + " mld. Kč"; }
  function mldN(x, d) { return num(x / 1e9, d == null ? 1 : d); }
  function pct(x, d) { return num(x * 100, d == null ? 1 : d) + " %"; }
  function signKc(x) { var r = Math.round(x); return (r > 0 ? "+" : r < 0 ? "−" : "±") + num(Math.abs(r)) + " Kč"; }
  var TAGTXT = { fakt: "Ověřený fakt", navrh: "Legislativní návrh", model: "Modelový výpočet", autor: "Autorský návrh" };
  function tag(cat, txt) { return '<span class="tag ' + cat + '">' + esc(txt || TAGTXT[cat]) + "</span>"; }
  function srcLink(s) { return s ? '<a class="src" href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + "</a>" : ""; }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  document.querySelectorAll("[data-legal-date]").forEach(function (el) { el.textContent = P.meta.legalDateLabel; });

  /* ---------- stav ---------- */
  var TYPES = [["emp", "Zaměstnanec"], ["self", "OSVČ"], ["pens", "Důchodce"], ["none", "Bez příjmu z práce"]];
  var st = {
    adults: [{ type: "emp", gross: 45000 }, { type: "emp", gross: 36000 }],
    kids0_6: 0, kids6_15: 0, kids15_26: 0, ztp: false, noDev: false, netOn: false, net: 0,
    date: P.meta.legalDate,
    lp: Object.assign({}, P.levyDefault),
    target: "budget", targetCustom: 8e9,
    projInf: P.projection.inflationDefault, projMode: "real", projIdx: true,
    scrub: 45000
  };
  var BUDGET = P.budget.ct.value + P.budget.cro.value;
  var PLAN2026 = P.reference.filter(function (r) { return r.year === 2026; }).reduce(function (s, r) { return s + r.value; }, 0);
  function target() { return st.target === "budget" ? BUDGET : st.target === "plan2026" ? PLAN2026 : st.targetCustom; }
  function household() {
    return {
      adults: st.adults.map(function (a) { return { type: a.type, grossMonthly: a.type === "none" ? 0 : Math.max(0, +a.gross || 0) }; }),
      kids0_6: st.kids0_6, kids6_15: st.kids6_15, kids15_26: st.kids15_26,
      disabilityExempt: st.ztp, noDevice: st.noDev, netOverride: st.netOn ? Math.max(0, +st.net || 0) : null, date: st.date
    };
  }

  /* ================= 1. KALKULAČKA ================= */
  function renderAdults() {
    var box = $("adultRows"), html = "";
    st.adults.forEach(function (a, i) {
      html += '<div class="adult' + (a.type === "none" ? " off" : "") + '" data-i="' + i + '">'
        + '<span class="an" aria-hidden="true">' + (i + 1) + "</span>"
        + '<select aria-label="Typ příjmu, dospělý ' + (i + 1) + '" data-f="type">' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === a.type ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>"
        + (st.adults.length > 1 ? '<button type="button" class="rm" data-f="rm" aria-label="Odebrat dospělého ' + (i + 1) + '">✕</button>' : "<span></span>")
        + '<div class="inc"><label for="inc' + i + '">' + (a.type === "pens" ? "Měsíční důchod" : a.type === "self" ? "Měsíční zisk (příjmy minus výdaje)" : "Hrubý měsíční příjem") + "</label>"
        + '<input type="range" min="0" max="150000" step="500" value="' + Math.min(150000, a.gross) + '" data-f="range" aria-label="Příjem posuvníkem, dospělý ' + (i + 1) + '"' + (a.type === "none" ? " disabled" : "") + " />"
        + '<input type="number" id="inc' + i + '" min="0" step="500" inputmode="numeric" value="' + a.gross + '" data-f="gross"' + (a.type === "none" ? " disabled" : "") + " /></div>"
        + "</div>";
    });
    box.innerHTML = html;
    $("addAdult").disabled = st.adults.length >= 4;
  }
  $("adultRows").addEventListener("input", function (e) {
    var t = e.target, row = t.closest(".adult"); if (!row) return;
    var i = +row.dataset.i, f = t.dataset.f, a = st.adults[i];
    if (f === "gross" || f === "range") {
      a.gross = Math.max(0, Math.min(10000000, +t.value || 0));
      var other = row.querySelector(f === "gross" ? '[data-f="range"]' : '[data-f="gross"]');
      other.value = f === "gross" ? Math.min(150000, a.gross) : a.gross;
      if (i === 0) { st.scrub = Math.min(150000, a.gross); $("scrub").value = st.scrub; }
      updateHH(); updateAB();
    }
  });
  $("adultRows").addEventListener("change", function (e) {
    var t = e.target, row = t.closest(".adult"); if (!row) return;
    if (t.dataset.f === "type") {
      var a = st.adults[+row.dataset.i]; a.type = t.value;
      if (a.type === "pens" && a.gross > 60000) a.gross = 21800;
      renderAdults(); updateHH();
      var sel = $("adultRows").querySelector('.adult[data-i="' + row.dataset.i + '"] select'); if (sel) sel.focus();
    }
  });
  $("adultRows").addEventListener("click", function (e) {
    var b = e.target.closest('[data-f="rm"]'); if (!b) return;
    st.adults.splice(+b.closest(".adult").dataset.i, 1); renderAdults(); updateHH();
    $("addAdult").focus();
  });
  $("addAdult").addEventListener("click", function () {
    if (st.adults.length >= 4) return;
    st.adults.push({ type: "emp", gross: 35000 }); renderAdults(); updateHH();
    var inputs = $("adultRows").querySelectorAll("select"); inputs[inputs.length - 1].focus();
  });
  document.querySelectorAll(".kids [data-k]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.k; st[k] = Math.max(0, Math.min(8, st[k] + (+b.dataset.d))); $(k).textContent = st[k]; updateHH();
    });
  });
  $("hhZtp").addEventListener("change", function () { st.ztp = this.checked; updateHH(); });
  $("hhNoDev").addEventListener("change", function () { st.noDev = this.checked; updateHH(); });
  $("hhNetOn").addEventListener("change", function () { st.netOn = this.checked; $("netOvrBox").hidden = !this.checked; if (this.checked) { if (!st.net) { st.net = Math.round(E.currentFee(P, household()).netMonthly); } $("hhNet").value = st.net; $("hhNet").focus(); } updateHH(); });
  $("hhNet").addEventListener("input", function () { st.net = +this.value || 0; updateHH(); });
  document.querySelectorAll("[data-date]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.date = b.dataset.date;
      document.querySelectorAll("[data-date]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      updateHH();
    });
  });

  function updateHH() {
    var h = household(), c = E.compareHousehold(P, h, st.lp), cur = c.current, lv = c.levy, bo = c.budget.orientation;
    var dateLbl = st.date < "2026-10-01" ? "30. 9. 2026" : P.meta.legalDateLabel;
    var limitTxt = "Limit osvobození: " + kc(cur.limit) + " čistého měsíčně, odhad čistého příjmu domácnosti: " + kc(cur.netMonthly) + (st.netOn ? " (zadáno ručně)" : " (orientační výpočet)") + ".";
    var dCls = lv.diffVsCurrent > 0.5 ? "up" : lv.diffVsCurrent < -0.5 ? "down" : "eq";
    var dTxt = lv.diffVsCurrent > 0.5 ? "připlatíte" : lv.diffVsCurrent < -0.5 ? "ušetříte" : "stejně";
    var per = st.adults.map(function (a, i) {
      var inS = a.type === "pens" ? st.lp.includePensions : a.type === "self" ? st.lp.includeSelf !== false : a.type !== "none";
      return "<div><span>Dospělý " + (i + 1) + " · " + TYPES.filter(function (t) { return t[0] === a.type; })[0][1].toLowerCase() + "</span><span>" + (inS ? kc(lv.perAdult[i]) : "mimo okruh") + "</span></div>";
    }).join("");
    $("hhOut").innerHTML =
      '<div class="res a"><div class="res-h"><b>A · Dnes platíte</b>' + tag("fakt") + "</div>"
      + '<div class="res-nums"><span class="res-big">' + kc(cur.monthly) + "<small>měsíčně</small></span>"
      + '<span class="res-mid">' + kc(cur.annual) + " <small>ročně</small></span></div>"
      + "<p>" + esc(cur.reason) + " " + (cur.exempt ? "" : esc(limitTxt)) + "</p>"
      + '<p class="src">Právní stav k ' + dateLbl + ", zák. č. 348/2005 Sb.</p></div>"

      + '<div class="res b"><div class="res-h"><b>B · Ze státního rozpočtu</b>' + tag("navrh") + "</div>"
      + '<div class="res-nums"><span class="res-big">0 Kč<small>přímá platba</small></span></div>'
      + "<p>Služba ale zdarma není: ČT a ČRo by dostaly " + mld(BUDGET, 2) + " ročně ze státního rozpočtu, tedy z daní a dluhu, které nesou všichni. Kolik z toho připadá na vás, závisí na celé vaší daňové zátěži a nedá se poctivě spočítat.</p>"
      + '<div class="orient"><span class="k">Orientační přepočet, ne vaše platba ' + tag("model") + "</span>"
      + '<div class="per"><div><span>na obyvatele (' + num(P.population.value / 1e6, 2) + " mil.)</span><span>" + kc(bo.perCapita) + " ročně</span></div>"
      + "<div><span>na hospodařící domácnost (SLDB 2021)</span><span>" + kc(bo.perHousehold) + " ročně</span></div></div></div></div>"

      + '<div class="res c"><div class="res-h"><b>C · Účelový odvod</b>' + tag("autor") + "</div>"
      + '<div class="res-nums"><span class="res-big">' + kc(lv.total) + "<small>ročně za domácnost</small></span>"
      + '<span class="delta ' + dCls + '">' + signKc(lv.diffVsCurrent) + " " + dTxt + "</span></div>"
      + '<div class="per">' + per
      + "<div><span>Efektivní podíl na hrubém příjmu domácnosti</span><span>" + (lv.grossAnnual ? pct(lv.effShare, 2) : "-") + "</span></div></div>"
      + "<p>Parametry: " + pct(st.lp.rate, 2) + (st.lp.marginal ? " z příjmu nad " : " z celého příjmu nad ") + kc(st.lp.threshold) + " ročně, strop " + kc(st.lp.cap) + " na osobu" + (st.lp.includePensions ? ", včetně důchodů" : ", bez důchodů") + '. <a href="#simulator">Změnit v simulátoru</a></p></div>';
  }

  /* ================= SVG pomocníci ================= */
  function scale(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function niceMax(v) { if (v <= 0) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
  function ticks(a, b, n) { var step = niceMax((b - a) / n), out = []; for (var v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6); return out; }
  /** Čárový graf. o: {series:[{name,color,dash,points:[[x,y]]}], x:[min,max], y:[min,max], xf, yf, marker, h, zero} */
  function lineChart(el, o) {
    var W = Math.max(280, el.clientWidth), mob = W < 480, H = o.h || (mob ? 240 : 300);
    var L = mob ? 50 : 62, R = mob ? 10 : 16, T = 14, B = 34;
    var X = scale(o.x[0], o.x[1], L, W - R), Y = scale(o.y[0], o.y[1], H - B, T);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || "") + '">';
    ticks(o.y[0], o.y[1], mob ? 4 : 5).forEach(function (v) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>'
        + '<text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="' + (mob ? 10 : 11) + '">' + o.yf(v) + "</text>";
    });
    ticks(o.x[0], o.x[1], mob ? 4 : 6).forEach(function (v) {
      s += '<text x="' + X(v) + '" y="' + (H - B + 18) + '" text-anchor="middle" font-size="' + (mob ? 10 : 11) + '">' + o.xf(v) + "</text>";
    });
    if (o.zero) s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    s += '<line class="axis" x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (H - B) + '"/><line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    (o.bands || []).forEach(function (b) {
      s += '<path d="' + b.hi.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ")
        + " " + b.lo.slice().reverse().map(function (p) { return "L" + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ") + ' Z" style="fill:' + b.color + '" opacity=".18"/>';
    });
    o.series.forEach(function (sr) {
      var d = sr.points.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      s += '<path d="' + d + '" fill="none" style="stroke:' + sr.color + '" stroke-width="' + (sr.w || 3.5) + '" stroke-linejoin="round"' + (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : "") + "/>";
      if (sr.label) {
        var lp = sr.points[sr.labelAt != null ? sr.labelAt : sr.points.length - 1];
        s += '<text class="lbl" x="' + Math.min(W - R - 2, X(lp[0]) + (sr.labelDx || 0)) + '" y="' + (Y(lp[1]) + (sr.labelDy || -8)) + '" text-anchor="' + (sr.anchor || "end") + '" font-size="' + (mob ? 10.5 : 12) + '" style="fill:' + sr.color + ';paint-order:stroke;stroke:var(--card);stroke-width:4px">' + esc(sr.label) + "</text>";
      }
    });
    if (o.marker != null) {
      var mx = X(o.marker);
      s += '<line x1="' + mx + '" x2="' + mx + '" y1="' + T + '" y2="' + (H - B) + '" style="stroke:var(--ink)" stroke-width="2" stroke-dasharray="4 3"/>';
      (o.markerDots || []).forEach(function (dpt) { s += '<rect x="' + (mx - 5) + '" y="' + (Y(dpt.y) - 5) + '" width="10" height="10" style="fill:' + dpt.color + ';stroke:var(--ink)" stroke-width="2"/>'; });
    }
    s += "</svg>";
    el.innerHTML = s + (o.table || "");
  }
  function dataTable(head, rows) {
    return '<details class="data-table"><summary>Data grafu</summary><table><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>"
      + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></details>";
  }
  var COL = { cur: "var(--ink)", levy: "var(--accent)", budget: "var(--tax)", single: "var(--accent)", couple2: "var(--tax)", couple1: "var(--dev)", pens: "var(--good)" };

  /* ================= 2. GRAFY A + B ================= */
  var INC = []; for (var m = 0; m <= 150000; m += 1000) INC.push(m);
  function kshort(v) { return v === 0 ? "0" : num(v / 1000) + " tis."; }
  function updateAB() {
    $("scrubVal").textContent = kc(st.scrub) + " hrubého";
    var pc = E.payCurve(P, st.lp, INC);
    var yMax = niceMax(Math.max(2460, st.lp.cap) * 1.25);
    var at = E.payCurve(P, st.lp, [st.scrub])[0];
    lineChart($("chartA"), {
      x: [0, 150000], y: [0, yMax], xf: kshort, yf: function (v) { return num(v); }, marker: st.scrub,
      series: [
        { name: "Dnes", color: COL.cur, points: pc.map(function (p) { return [p.monthly, p.current]; }), },
        { name: "Rozpočet", color: COL.budget, dash: "2 5", w: 3, points: [[0, 0], [150000, 0]], label: "B · přímá platba 0 Kč", labelDy: -8 },
        { name: "Odvod", color: COL.levy, points: pc.map(function (p) { return [p.monthly, p.levy]; }), }
      ],
      markerDots: [{ y: at.current, color: COL.cur }, { y: at.levy, color: COL.levy }],
      aria: "Graf A: roční platba jednočlenné domácnosti podle hrubého měsíčního příjmu. Dnešní poplatek je 2 460 Kč nad hranicí osvobození, odvod roste od hranice " + kc(st.lp.threshold) + " ročně až ke stropu " + kc(st.lp.cap) + ".",
      table: dataTable(["Hrubý měsíčně", "Dnes ročně", "Odvod ročně"], [10000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000].map(function (v) { var p = E.payCurve(P, st.lp, [v])[0]; return [kc(v), kc(p.current), kc(p.levy)]; }))
    });
    $("readA").innerHTML = '<div><span><i style="background:' + COL.cur + '"></i>A · dnes</span><b>' + kc(at.current) + " ročně</b></div>"
      + '<div><span><i style="background:' + COL.budget + '"></i>B · přímá platba</span><b>0 Kč</b></div>'
      + '<div><span><i style="background:' + COL.levy + '"></i>C · odvod</span><b>' + kc(at.levy) + " ročně</b></div>";

    var dc = E.diffCurves(P, st.lp, INC), lo = 0, hi = 0;
    dc.forEach(function (s) { s.points.forEach(function (p) { lo = Math.min(lo, p.diff); hi = Math.max(hi, p.diff); }); });
    var yr = niceMax(Math.max(Math.abs(lo), Math.abs(hi)) * 1.1);
    var dAt = E.diffCurves(P, st.lp, [st.scrub]);
    lineChart($("chartB"), {
      x: [0, 150000], y: [Math.min(-yr * 0.5, lo * 1.15), Math.max(hi * 1.15, 500)], xf: kshort, yf: function (v) { return (v > 0 ? "+" : "") + num(v); }, zero: true, marker: st.scrub,
      series: dc.map(function (s) { return { name: s.label, color: COL[s.id], points: s.points.map(function (p) { return [p.monthly, p.diff]; }), w: 3 }; }),
      markerDots: dAt.map(function (s) { return { y: s.points[0].diff, color: COL[s.id] }; }),
      aria: "Graf B: rozdíl ročního odvodu proti dnešnímu poplatku podle příjmu pro čtyři typy domácností.",
      table: dataTable(["Hrubý měsíčně"].concat(dc.map(function (s) { return s.label; })), [15000, 25000, 35000, 45000, 60000, 80000, 120000].map(function (v) { var r = E.diffCurves(P, st.lp, [v]); return [kc(v)].concat(r.map(function (s) { return signKc(s.points[0].diff); })); }))
    });
    $("readB").innerHTML = dAt.map(function (s) { var d = s.points[0].diff; return '<div><span><i style="background:' + COL[s.id] + '"></i>' + esc(s.label.replace(" m", " " + kc(st.scrub))) + "</span><b>" + signKc(d) + "</b></div>"; }).join("");
  }
  $("scrub").addEventListener("input", function () { st.scrub = +this.value; updateAB(); });

  /* ================= 3. SIMULÁTOR ================= */
  var CTRL = [["pRate", "rate", function (v) { return pct(v, 2); }], ["pThr", "threshold", function (v) { return kc(v) + " / rok (" + kc(v / 12) + " měs.)"; }],
    ["pCap", "cap", function (v) { return kc(v) + " / rok"; }], ["pAdm", "adminCostRate", function (v) { return pct(v, 1); }], ["pRes", "reserveRate", function (v) { return pct(v, 1); }]];
  function syncCtrls() {
    CTRL.forEach(function (c) { $(c[0]).value = st.lp[c[1]]; $(c[0] + "V").textContent = c[2](st.lp[c[1]]); });
    $("pMarg").checked = st.lp.marginal; $("pPens").checked = st.lp.includePensions; $("pSelf").checked = !!st.lp.includeSelf;
  }
  var simLater = debounce(function () { updateSim(); updateC(); updateD(); }, reduced ? 0 : 140);
  function onParam() { syncCtrls(); updateHH(); updateAB(); simLater(); }
  CTRL.forEach(function (c) { $(c[0]).addEventListener("input", function () { st.lp[c[1]] = +this.value; onParam(); }); });
  $("pMarg").addEventListener("change", function () { st.lp.marginal = this.checked; onParam(); });
  $("pPens").addEventListener("change", function () { st.lp.includePensions = this.checked; onParam(); });
  $("pSelf").addEventListener("change", function () { st.lp.includeSelf = this.checked; onParam(); });
  $("pTarget").addEventListener("change", function () { st.target = this.value; $("pTargetCustom").hidden = this.value !== "custom"; simLater(); });
  $("pTargetCustom").addEventListener("input", function () { st.targetCustom = Math.max(0, +this.value || 0) * 1e9; simLater(); });

  var lastSim = null;
  function updateSim() {
    var T = target(), s = E.simulate(P, st.lp, T); lastSim = s;
    var vt = { ano: "Pokryje cíl ve všech třech scénářích", "nejisté": "Nejisté: cíl pokryje jen část scénářů", ne: "Nepokryje cíl ani v optimistickém scénáři" }[s.sufficient];
    var cls = s.sufficient === "nejisté" ? "nejiste" : s.sufficient;
    function rng(k) { return mldN(s.low[k]) + " až " + mldN(s.high[k]) + " mld."; }
    $("simOut").innerHTML =
      '<div class="verdict ' + cls + '"><div class="vk">Výsledek výpočtu, cíl ' + mld(T, 2) + " čistého</div>"
      + '<div class="vt">' + vt + "</div>"
      + "<p>Čistý výnos " + rng("net") + " (střed " + mld(s.mid.net) + "). Rozdíl proti cíli " + (s.mid.gap >= 0 ? "+" : "−") + mldN(Math.abs(s.mid.gap), 2) + " mld. ve středu, " + (s.low.gap >= 0 ? "+" : "−") + mldN(Math.abs(s.low.gap), 2) + " mld. v pesimistickém a " + (s.high.gap >= 0 ? "+" : "−") + mldN(Math.abs(s.high.gap), 2) + " mld. v optimistickém scénáři.</p></div>"
      + '<div class="kpis">'
      + '<div class="kpi"><div class="k">Hrubý výnos</div><div class="v">' + mld(s.mid.gross) + '</div><div class="r">interval ' + rng("gross") + "</div></div>"
      + '<div class="kpi"><div class="k">Čistý výnos</div><div class="v">' + mld(s.mid.net) + '</div><div class="r">po správě a rezervě</div></div>'
      + '<div class="kpi"><div class="k">Osvobozeno</div><div class="v">' + pct(s.mid.exemptShare, 0) + '</div><div class="r">osob v okruhu (' + num(s.mid.people / 1e6, 2) + " mil.)</div></div>"
      + '<div class="kpi"><div class="k">Na stropu</div><div class="v">' + pct(s.mid.cappedShare, 0) + '</div><div class="r">osob platí plný strop</div></div>'
      + "</div>"
      + '<div class="bal" aria-label="Kontrola bilance"><div><span>Hrubý výnos (střed)</span><span>' + mld(s.mid.gross, 2) + "</span></div>"
      + "<div><span>− správní náklady " + pct(st.lp.adminCostRate, 1) + "</span><span>" + mld(s.mid.admin, 2) + "</span></div>"
      + "<div><span>− stabilizační rezerva " + pct(st.lp.reserveRate, 1) + "</span><span>" + mld(s.mid.reserve, 2) + "</span></div>"
      + '<div class="t"><span>= čistý výnos pro ČT a ČRo</span><span>' + mld(s.mid.net, 2) + "</span></div>"
      + "<div><span>Bilance sedí</span><span>" + (s.balanced ? "ano" : "NE") + "</span></div></div>";
    drawDeciles(s.deciles); drawSens();
  }
  function barsHTML() { return ""; }
  function drawDeciles(d) {
    var el = $("chartDec"), W = Math.max(280, el.clientWidth), mob = W < 480, H = mob ? 220 : 260, L = mob ? 40 : 52, R = 8, T = 22, B = 34;
    var mx = niceMax(Math.max.apply(null, d.map(function (x) { return x.avgLevy; }).concat([st.lp.cap || 1])));
    var Y = scale(0, mx, H - B, T), bw = (W - L - R) / d.length;
    var top = d.slice().sort(function (a, b) { return b.share - a.share; })[0];
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc("Průměrný odvod podle decilů příjmu. Nejvyšší podíl na příjmu má decil " + top.d + " (" + pct(top.share, 2) + "). Podrobná data v tabulce pod grafem.") + '">';
    ticks(0, mx, 4).forEach(function (v) { s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="10.5">' + num(v) + "</text>"; });
    if (st.lp.cap) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(st.lp.cap) + '" y2="' + Y(st.lp.cap) + '" style="stroke:var(--accent)" stroke-width="2" stroke-dasharray="5 4"/><text x="' + (L + 4) + '" y="' + (Y(st.lp.cap) - 5) + '" text-anchor="start" font-size="10.5" style="fill:var(--accent);font-weight:700;paint-order:stroke;stroke:var(--card);stroke-width:4px">strop ' + num(st.lp.cap) + "</text>";
    d.forEach(function (x, i) {
      var x0 = L + i * bw + 3, h = (H - B) - Y(x.avgLevy);
      s += '<rect x="' + x0 + '" y="' + Y(x.avgLevy) + '" width="' + (bw - 6) + '" height="' + Math.max(0, h) + '" style="fill:var(--ink)"/>';
      s += '<text x="' + (x0 + (bw - 6) / 2) + '" y="' + (Y(x.avgLevy) - 5) + '" text-anchor="middle" font-size="' + (mob ? 9 : 10.5) + '" class="lbl">' + num(x.share * 100, 2) + "%</text>";
      s += '<text x="' + (x0 + (bw - 6) / 2) + '" y="' + (H - B + 16) + '" text-anchor="middle" font-size="10.5">D' + x.d + "</text>";
    });
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/></svg>';
    el.innerHTML = s + dataTable(["Decil", "Horní hranice (Kč/rok)", "Průměrný příjem (Kč/měs.)", "Průměrný odvod (Kč/rok)", "Podíl na příjmu"],
      d.map(function (x) { return ["D" + x.d, num(Math.round(x.upper)), num(Math.round(x.avgIncome / 12)), num(Math.round(x.avgLevy)), pct(x.share, 2)]; }));
  }
  function drawSens() {
    var data = E.sensitivity(P, st.lp), el = $("chartSens");
    var W = Math.max(280, el.clientWidth), mob = W < 480, rowH = 30, H = data.length * rowH + 30, L = mob ? 128 : 150, R = 64;
    var mx = niceMax(Math.max.apply(null, data.map(function (x) { return Math.abs(x.value); })) || 1e8);
    var X = scale(-mx, mx, L, W - R);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc("Citlivost čistého výnosu: " + data.map(function (x) { return x.label + " " + num(x.value / 1e9, 2) + " mld."; }).join(", ")) + '">';
    s += '<line class="axis" x1="' + X(0) + '" x2="' + X(0) + '" y1="4" y2="' + (H - 22) + '"/>';
    data.forEach(function (x, i) {
      var y = 6 + i * rowH, x0 = Math.min(X(0), X(x.value)), w = Math.abs(X(x.value) - X(0));
      s += '<text x="' + (L - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="' + (mob ? 10 : 11) + '" style="fill:var(--ink)">' + esc(x.label) + "</text>";
      s += '<rect x="' + x0 + '" y="' + y + '" width="' + Math.max(1, w) + '" height="' + (rowH - 10) + '" style="fill:' + (x.value >= 0 ? "var(--good)" : "var(--accent)") + ';stroke:var(--ink)" stroke-width="1.5"/>';
      s += '<text x="' + (x.value >= 0 ? X(x.value) + 5 : X(0) + 5) + '" y="' + (y + 15) + '" font-size="10.5" class="lbl">' + (x.value >= 0 ? "+" : "−") + num(Math.abs(x.value) / 1e9, 2) + " mld.</text>";
    });
    s += '<text x="' + X(0) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10">centrální odhad ' + mld(lastSim ? lastSim.mid.net : 0) + "</text></svg>";
    el.innerHTML = s;
  }
  function calib(kind) {
    var T = target(), out = $("calOut");
    var lim = kind === "rate" ? { rateMax: 0.03 } : { capMax: 15000 };
    var mid = E.calibrate(P, st.lp, T, kind, "mid", lim), low = E.calibrate(P, st.lp, T, kind, "low", lim);
    if (!mid.ok) { out.innerHTML = "<b>Cíl nelze dosáhnout</b> ani při " + (kind === "rate" ? "sazbě 3 %" : "stropu 15 000 Kč") + " s ostatními parametry. Změňte hranici, strop nebo okruh plátců."; return; }
    var v = kind === "rate" ? Math.ceil(mid.value / 0.0005) * 0.0005 : Math.ceil(mid.value / 100) * 100;
    st.lp[kind] = v; onParam();
    out.innerHTML = (kind === "rate" ? "Sazba pro cíl " + mld(T, 2) + ": <b>" + pct(mid.value, 2) + "</b> ve středním scénáři (nastaveno zaokrouhleně " + pct(v, 2) + "). "
      + (low.ok ? "Aby cíl vydržel i v pesimistickém scénáři, je potřeba " + pct(low.value, 2) + "." : "V pesimistickém scénáři cíl nelze dosáhnout do 3 %.")
      : "Strop pro cíl " + mld(T, 2) + ": <b>" + kc(mid.value) + "</b> ve středním scénáři (nastaveno " + kc(v) + "). "
      + (low.ok ? "Pro pesimistický scénář " + kc(low.value) + "." : "V pesimistickém scénáři cíl nelze dosáhnout do 15 000 Kč."))
      + " Výsledek je modelový výpočet, ne doporučení.";
  }
  $("calRate").addEventListener("click", function () { calib("rate"); });
  $("calCap").addEventListener("click", function () { calib("cap"); });

  /* ================= 4. GRAF C ================= */
  function updateC() {
    var s = lastSim || E.simulate(P, st.lp, target());
    var share = P.budget.ct.value / BUDGET;
    var rows = [
      { lbl: "2024 · skutečný výběr poplatků", cat: "fakt", ct: 5741826000, cro: 2065766000, note: "ČT: rozpočet ČT 2026; ČRo: RIA tisku 231" },
      { lbl: "2026 · plán výběru poplatků", cat: "fakt", ct: 6730000000, cro: 2476000000, note: "Rozpočty ČT a ČRo na rok 2026" },
      { lbl: "2027 · příspěvek ze státního rozpočtu", cat: "navrh", ct: P.budget.ct.value, cro: P.budget.cro.value, note: "Sněmovní tisk 231, není zákonem" },
      { lbl: "Účelový odvod · čistý výnos", cat: "model", ct: s.mid.net * share, cro: s.mid.net * (1 - share), lo: s.low.net, hi: s.high.net, note: "Simulace výše, příjmy 2026, dělení v poměru tisku 231" }
    ];
    var mx = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.ct + r.cro, r.hi || 0); })) * 1.05);
    var html = '<div class="cbar-legend"><span><i style="background:var(--tax)"></i>ČT</span><span><i style="background:var(--dev)"></i>ČRo</span><span><i class="wh"></i>interval modelu</span></div>';
    rows.forEach(function (r) {
      var tot = r.ct + r.cro;
      html += '<div class="cbar"><div class="cbar-l"><b>' + esc(r.lbl) + "</b> " + tag(r.cat) + '<span class="small">' + esc(r.note) + "</span></div>"
        + '<div class="cbar-t"><span class="seg-ct" style="width:' + (r.ct / mx * 100) + '%"></span><span class="seg-cro" style="width:' + (r.cro / mx * 100) + '%"></span>'
        + (r.lo != null ? '<span class="whisk" style="left:' + (r.lo / mx * 100) + "%;width:" + ((r.hi - r.lo) / mx * 100) + '%"></span>' : "")
        + (r.lo == null ? '<span class="ref" style="left:' + (BUDGET / mx * 100) + '%"></span>' : "")
        + '</div><div class="cbar-v"><b>' + mld(tot, 2) + "</b><span>ČT " + mldN(r.ct, 2) + " · ČRo " + mldN(r.cro, 2) + "</span>" + (r.lo != null ? "<span>" + mldN(r.lo) + " až " + mldN(r.hi) + "</span>" : "") + "</div></div>";
    });
    $("chartC").innerHTML = html;
    $("chartC").setAttribute("aria-label", "Graf C: " + rows.map(function (r) { return r.lbl + " " + mld(r.ct + r.cro, 2); }).join("; "));
  }

  /* ================= 5. GRAF D ================= */
  (function () {
    var box = $("projInf");
    box.innerHTML = P.projection.inflationScenarios.map(function (v) {
      return '<button type="button" data-v="' + v + '" aria-pressed="' + (v === st.projInf) + '">inflace ' + num(v * 100, 1) + " %" + (v === 0.025 ? " (ČNB 2027)" : "") + "</button>";
    }).join("");
    box.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { st.projInf = +b.dataset.v; box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); updateD(); }); });
    document.querySelectorAll("#projMode button").forEach(function (b) { b.addEventListener("click", function () { st.projMode = b.dataset.m; document.querySelectorAll("#projMode button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); updateD(); }); });
    $("projIdx").addEventListener("change", function () { st.projIdx = this.checked; updateD(); });
  })();
  function updateD() {
    var pr = E.project(P, st.lp, { inflation: st.projInf, realWageGrowth: P.projection.realWageGrowth, levyIndexed: st.projIdx });
    var k = st.projMode;
    var all = []; pr.forEach(function (y) { all.push(y.fee[k], y.budget[k], y.levy[k]); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var y0 = Math.max(0, Math.floor(lo / 1e9) - 1) * 1e9, y1 = niceMax(hi * 1.08);
    if (y1 - hi > hi * 0.4) y1 = Math.ceil(hi * 1.08 / 5e8) * 5e8;
    lineChart($("chartD"), {
      x: [2027, 2036], y: [y0, y1], xf: function (v) { return String(v); }, yf: function (v) { return num(v / 1e9, 1); }, h: 300,
      series: [
        { color: "var(--ink)", points: pr.map(function (y) { return [y.year, y.fee[k]]; }) },
        { color: "var(--tax)", points: pr.map(function (y) { return [y.year, y.budget[k]]; }) },
        { color: "var(--accent)", points: pr.map(function (y) { return [y.year, y.levy[k]]; }) }
      ],
      aria: "Graf D: projekce financování ČT a ČRo 2027 až 2036 v mld. Kč, " + (k === "real" ? "v cenách roku 2026" : "nominálně") + ", při inflaci " + num(st.projInf * 100, 1) + " %.",
      table: dataTable(["Rok", "A poplatky", "B tisk 231", "C odvod"], pr.map(function (y) { return [String(y.year), mldN(y.fee[k], 2), mldN(y.budget[k], 2), mldN(y.levy[k], 2)]; }))
    });
    var raises = pr.filter(function (y, i) { return i && y.budget.nominal > pr[i - 1].budget.nominal; }).map(function (y) { return y.year; });
    var last = pr[pr.length - 1];
    $("chartD").insertAdjacentHTML("afterbegin", '<div class="readout leg"><div><span><i style="background:var(--ink)"></i>A · dnešní poplatky (plán výběru 2026 + valorizace)</span><b>' + mld(last.fee[k]) + '</b></div><div><span><i style="background:var(--tax)"></i>B · příspěvek podle tisku 231</span><b>' + mld(last.budget[k]) + '</b></div><div><span><i style="background:var(--accent)"></i>C · účelový odvod, čistý výnos</span><b>' + mld(last.levy[k]) + '</b></div><div class="small"><span>hodnoty v roce 2036</span></div></div>');
    $("projNote").innerHTML = "Osa v mld. Kč " + (k === "real" ? "v cenách roku 2026" : "nominálně") + ". Rozpočtový model se při této inflaci zvýší o 10 % v letech: " + (raises.length ? raises.join(", ") : "žádném do roku 2036")
      + ". Reálná hodnota v roce 2036: A " + mld(last.fee.real) + ", B " + mld(last.budget.real) + ", C " + mld(last.levy.real) + ". "
      + "Předpoklady: reálný růst mezd " + num(P.projection.realWageGrowth * 100, 1) + " % ročně, stejný počet plátců poplatku, valorizační pravidla uplatněna mechanicky. " + tag("model", "Projekce, ne prognóza");
  }

  /* ================= 6. NEZÁVISLOST ================= */
  (function () {
    var COLS = [["a", "A · Dnešní poplatek"], ["b", "B · Rozpočet (tisk 231)"], ["c", "C · Účelový odvod"]];
    var html = '<div class="ind-row head"><div>Pojistka</div>' + COLS.map(function (c) { return "<div>" + c[1] + "</div>"; }).join("") + "</div>";
    P.independence.forEach(function (r) {
      html += '<div class="ind-row"><div>' + esc(r.q) + "</div>" + COLS.map(function (c) {
        var x = r[c[0]];
        return '<div><span class="lbl-m">' + c[1] + "</span>" + tag(x.cat) + "<br />" + esc(x.t) + (x.src ? " " + srcLink(x.src) : "") + "</div>";
      }).join("") + "</div>";
    });
    $("indep").innerHTML = html;
  })();

  /* ================= 7. INSPIRACE ================= */
  (function () {
    var C = {}; (window.COUNTRIES || []).forEach(function (c) { C[c.iso] = c; });
    $("insp").innerHTML = P.inspiration.map(function (r) {
      var c = C[r.iso];
      return '<div class="ins"><div class="cn">' + esc(r.title) + "<small>" + esc(r.sub) + (c && c.eur ? " · " + c.eur + " € ročně" : "") + "</small></div>"
        + '<div><span class="k">Konstrukce</span>' + esc(r.how) + "</div>"
        + '<div><span class="k">Kontrola</span>' + esc(r.control) + "</div>"
        + '<div><span class="k">Co následovalo</span>' + esc(r.after) + "</div>"
        + '<div class="go"><button type="button" class="btn ghost" data-iso="' + r.iso + '">Detail země</button></div></div>';
    }).join("");
    $("insp").querySelectorAll("[data-iso]").forEach(function (b) { b.addEventListener("click", function () { if (window.openCountry) window.openCountry(b.dataset.iso); }); });
  })();

  /* ================= 8. METODIKA ================= */
  (function () {
    var rows = [
      ["TV poplatek", P.fee.tvMonthly], ["Rozhlasový poplatek", P.fee.radioMonthly], ["Limit osvobození", P.fee.exemptMultiple],
      ["Příspěvek ČT (tisk 231)", P.budget.ct], ["Příspěvek ČRo (tisk 231)", P.budget.cro],
      ["Obyvatelé", P.population], ["Hospodařící domácnosti", P.households], ["Růst mezd 2025→2026", P.sim.wageGrowth2026],
      ["Náklady výběru TV poplatku", P.fee.collectionCostCT], ["Platící domácnosti (TV)", P.fee.payingHouseholdsTV]
    ];
    var G = P.groups;
    function v(x) { var val = x.value; if (typeof val === "number") return val < 1 ? pct(val, 1) : num(val) + (x.unit ? " " + x.unit.replace("Kč/měs.", "Kč/měs.") : ""); return esc(typeof val === "object" ? JSON.stringify(val) : String(val)); }
    var html = '<p class="small">Verze parametrů ' + esc(P.meta.version) + ", právní stav " + esc(P.meta.legalDateLabel) + ". " + esc(P.meta.dataNote) + "</p>"
      + "<h4>Klíčové parametry</h4><table class=\"ptab\"><thead><tr><th>Údaj</th><th>Hodnota</th><th>Typ</th><th class=\"hide-m\">Zdroj a poznámka</th></tr></thead><tbody>"
      + rows.map(function (r) { var x = r[1]; return "<tr><td>" + esc(r[0]) + (x.date ? '<br /><span class="small">' + esc(x.date) + "</span>" : "") + '</td><td class="v">' + v(x) + "</td><td>" + tag(x.cat) + '</td><td class="hide-m">' + srcLink(x.src) + (x.note ? '<br /><span class="small">' + esc(x.note) + "</span>" : "") + "</td></tr>"; }).join("")
      + Object.keys(G).map(function (k) { var g = G[k]; return "<tr><td>" + esc(g.label) + '<br /><span class="small">' + g.year + '</span></td><td class="v">' + num(g.count) + " osob" + (g.mean ? "<br />průměr " + kc(g.mean) : "") + (g.medianAnnual ? "<br />medián " + kc(g.medianAnnual) + "/rok" : "") + "</td><td>" + tag(g.cat) + '</td><td class="hide-m">' + srcLink(g.src) + (g.note ? '<br /><span class="small">' + esc(g.note) + "</span>" : "") + "</td></tr>"; }).join("")
      + "</tbody></table>"
      + "<h4>Jak se počítá</h4><ul>"
      + "<li><b>Dnešní poplatek:</b> 150 + 55 Kč měsíčně jednou za domácnost. Osvobození, pokud je čistý měsíční příjem domácnosti pod 2,15násobkem životního minima (podle složení domácnosti a data právního stavu), při ZTP/P se zrakovým nebo sluchovým postižením a bez zařízení schopného příjmu. Čistý příjem je orientační (pojistné 11,6 %, daň 15 % minus sleva 2 570 Kč, bez slev na děti); lze zadat přesně.</li>"
      + "<li><b>Rozpočtový model:</b> přímá platba 0 Kč. Přepočet na obyvatele a domácnost je jen ilustrace velikosti částky, ne platba jednotlivce.</li>"
      + "<li><b>Odvod:</b> pro každou osobu zvlášť min(strop, sazba × (roční hrubý příjem − hranice)), u varianty „z celého příjmu“ sazba × příjem nad hranicí. Domácnost = součet osob v okruhu.</li>"
      + "<li><b>Celostátní simulace:</b> syntetická populace ze zveřejněných kvantilů ISPV 2025 (log-lineární interpolace, lineární dolní chvost, Paretův horní chvost kalibrovaný na zveřejněný průměr), přepočteno růstem mezd 2026. Důchody lognormálně kolem průměru ČSSZ. Interval: " + esc(P.sim.scenarioNote) + "</li>"
      + "<li><b>Bilance:</b> hrubý výnos = čistý výnos + správní náklady + rezerva; kontroluje se při každém výpočtu.</li>"
      + "<li><b>Kalibrace:</b> bisekce sazby nebo stropu na požadovaný čistý výnos, nejvýše 3 % sazby a 15 000 Kč stropu.</li>"
      + "<li><b>Projekce:</b> " + esc(P.projection.note) + " Poplatek +6 % po překročení kumulované inflace 6 % (účinnost od 1. 7. následujícího roku), rozpočtový model +10 % po překročení 10 p. b.</li></ul>"
      + "<h4>Omezení a co je nutné ověřit</h4><ul>"
      + "<li>ISPV měří zaměstnance přepočtené na placené měsíce; skutečný roční příjem osob se zkráceným úvazkem nebo neúplným rokem je nižší. Proto interval počtu a dolního chvostu.</li>"
      + "<li>Rozdělení zisků OSVČ podle výše není veřejně k dispozici; OSVČ jsou ve výchozím stavu mimo výpočet.</li>"
      + "<li>Souběh příjmů (pracující důchodci, zaměstnanci s živností) se nesčítá; každá skupina má vlastní hranici.</li>"
      + "<li>Výběr poplatků ČRo za rok 2025 není ve zdrojích; použit plán 2026.</li>"
      + "<li>Detaily valorizace v tisku 231 (index, výchozí měsíc) a případné změny po 1. čtení je nutné ověřit v textu tisku.</li>"
      + "<li>Stav ústavní novely o NKÚ (tisk 47) je ověřen podle zpráv do června 2026.</li></ul>"
      + '<p class="small">Výpočetní jádro, parametry a testy jsou v repozitáři: <a href="https://github.com/matesola/poplatky" target="_blank" rel="noopener">github.com/matesola/poplatky</a> (lab/engine.js, lab/params.js, tests/). Spuštění testů: <code>npm test</code>.</p>';
    $("methodBody").innerHTML = html;
  })();

  /* ---------- start + překreslení při změně šířky ---------- */
  renderAdults(); syncCtrls(); updateHH(); updateAB(); updateSim(); updateC(); updateD();
  var lastW = 0;
  var redraw = debounce(function () {
    var w = $("chartA").clientWidth; if (Math.abs(w - lastW) < 4) return; lastW = w;
    updateAB(); if (lastSim) { drawDeciles(lastSim.deciles); drawSens(); } updateD();
  }, 150);
  if (window.ResizeObserver) new ResizeObserver(redraw).observe($("simulace")); else addEventListener("resize", redraw);
  lastW = $("chartA").clientWidth;
})();
