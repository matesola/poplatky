#!/usr/bin/env python3
"""Nezávislý přepočet celostátního výnosu účelového odvodu.

Nezávislý na lab/engine.js: vstupní data jsou zde přepsána ručně ze zdrojů
(ISPV 2025, ČSSZ 6/2026, ČSÚ Q2 2026), výpočet používá jiný postup:
  1. jemná síť 400 000 bodů kvantilové funkce (JS: 2 000 středových bodů),
  2. uzavřený vzorec E[min(c, r·(Y-T)+)] = r·∫_T^{T+c/r} S(y) dy pro lognormální alternativy,
  3. dvě alternativní tvarová rozdělení mezd (lognormála z mediánu a průměru,
     lognormála z P10 a P90), která ukazují strukturní nejistotu modelu.

Spuštění: python3 audit/recompute.py  (zapíše audit/recompute-results.json)
"""
import json, math, os, subprocess, sys
import numpy as np
from scipy import stats, optimize, integrate

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- Vstupní data, přepsaná ze zdrojů ----------
# ISPV 2025 mzdová sféra (CR_254_MZS, výsledky k 25. 3. 2026), Kč/měs.
MZS = dict(n=3_010_200, mean=52_239, q={0.10: 24_919, 0.25: 32_538, 0.50: 43_241, 0.75: 58_801, 0.90: 85_087})
# ISPV 2025 platová sféra (Kurzy.cz, 10. 5. 2026)
PLS = dict(n=683_868, mean=52_037, q={0.10: 32_099, 0.50: 48_064, 0.90: 74_104})
# ČSSZ 6/2026
PENS = dict(n=2_333_762, mean=21_803, cv=0.20)
INV = dict(n=420_880, mean=14_500, cv=0.25)          # průměr = vážený odhad (předpoklad)
GROWTH_2026 = 0.064                                   # ČSÚ, průměrná mzda Q2 2026 meziročně

SCEN = {  # stejné definice scénářů jako v aplikaci (lab/params.js), ověřují se proti nim
    "low":  dict(countF=0.95, growthAdj=-0.01, lowTail=0.25, compliance=0.97),
    "mid":  dict(countF=1.00, growthAdj=0.00,  lowTail=0.40, compliance=0.99),
    "high": dict(countF=1.05, growthAdj=0.01,  lowTail=0.55, compliance=1.00),
}

def levy(y, rate, thr, cap, marginal=True):
    y = np.maximum(0.0, y)
    base = (y - thr) if marginal else y
    out = np.minimum(cap, np.maximum(0.0, base) * rate)
    return np.where(y > thr, out, 0.0)

def qfun_interp(q, mean, low_tail):
    """Kvantilová funkce: log-lineární interpolace, lineární dolní chvost, Paretův horní chvost na průměr."""
    ps = sorted(q); vs = [q[p] for p in ps]
    p0, v0, pN, vN = ps[0], vs[0], ps[-1], vs[-1]
    vmin = low_tail * v0
    def body(p):
        p = np.asarray(p, float)
        out = np.where(p <= p0, vmin + (v0 - vmin) * p / p0, 0.0)
        for a, b, va, vb in zip(ps[:-1], ps[1:], vs[:-1], vs[1:]):
            m = (p > a) & (p <= b)
            t = (p - a) / (b - a)
            out = np.where(m, np.exp(np.log(va) + t * (np.log(vb) - np.log(va))), out)
        return out
    body_mean = integrate.quad(lambda p: float(body(p)), 0, pN, limit=200, points=ps)[0]
    tail_mean = (mean - body_mean) / (1 - pN)
    alpha = tail_mean / (tail_mean - vN)
    def Q(p):
        p = np.asarray(p, float)
        return np.where(p <= pN, body(p), vN * ((1 - pN) / np.maximum(1e-12, 1 - p)) ** (1 / alpha))
    return Q, alpha, body_mean + (1 - pN) * tail_mean

def expected_levy_quantile(Q, scale, rate, thr, cap, marginal=True, n=400_000):
    p = (np.arange(n) + 0.5) / n
    return float(levy(scale * Q(p), rate, thr, cap, marginal).mean())

def expected_levy_lognormal(mu, s, scale, rate, thr, cap):
    """Uzavřený vzorec přes funkci přežití, pouze marginální varianta."""
    if rate <= 0 or cap <= 0: return 0.0
    dist = stats.lognorm(s=s, scale=math.exp(mu) * scale)
    return rate * integrate.quad(lambda y: dist.sf(y), thr, thr + cap / rate, limit=200)[0]

def lognorm_from_median_mean(med, mean):
    return math.log(med), math.sqrt(2 * math.log(mean / med))

def lognorm_from_p10_p90(p10, p90):
    z = stats.norm.ppf(0.9)
    mu = (math.log(p10) + math.log(p90)) / 2
    return mu, (math.log(p90) - math.log(p10)) / (2 * z)

def pension_levy(g, scale, rate, thr, cap):
    s2 = math.log(1 + g["cv"] ** 2); mu = math.log(g["mean"]) - s2 / 2
    return expected_levy_lognormal(mu, math.sqrt(s2), 12 * scale, rate, thr, cap)

def revenue(lp, sc, shape="interp"):
    g = 1 + GROWTH_2026 + sc["growthAdj"]
    out = {}
    for name, G in (("emp", MZS), ("pub", PLS)):
        n = G["n"] * sc["countF"]
        if shape == "interp":
            Q, _, _ = qfun_interp(G["q"], G["mean"], sc["lowTail"])
            e = expected_levy_quantile(Q, 12 * g, lp["rate"], lp["threshold"], lp["cap"], lp["marginal"])
        elif shape == "ln_med_mean":
            mu, s = lognorm_from_median_mean(G["q"][0.5], G["mean"])
            e = expected_levy_lognormal(mu, s, 12 * g, lp["rate"], lp["threshold"], lp["cap"])
        else:
            mu, s = lognorm_from_p10_p90(G["q"][0.1], G["q"][0.9])
            e = expected_levy_lognormal(mu, s, 12 * g, lp["rate"], lp["threshold"], lp["cap"])
        out[name] = e * n
    if lp.get("includePensions", True):
        out["pens"] = pension_levy(PENS, 1.0, lp["rate"], lp["threshold"], lp["cap"]) * PENS["n"]
        out["inv"] = pension_levy(INV, 1.0, lp["rate"], lp["threshold"], lp["cap"]) * INV["n"]
    gross = sum(out.values()) * sc["compliance"]
    return gross, out

def js(lp):
    """Výsledek aplikace pro porovnání (volá lab/engine.js přes Node)."""
    code = ("const P=require('./lab/params.js'),E=require('./lab/engine.js');"
            "const lp=Object.assign({},P.levyDefault," + json.dumps(lp) + ");"
            "const s=E.simulate(P,lp,0);"
            "console.log(JSON.stringify({low:s.low.gross,mid:s.mid.gross,high:s.high.gross,groups:s.mid.groups}))")
    r = subprocess.run(["node", "-e", code], cwd=os.path.dirname(HERE), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

def check_transcription():
    code = "const P=require('./lab/params.js');console.log(JSON.stringify(P.groups))"
    r = subprocess.run(["node", "-e", code], cwd=os.path.dirname(HERE), capture_output=True, text=True, check=True)
    G = json.loads(r.stdout); errs = []
    def cmp(label, a, b):
        if abs(a - b) > 1e-9: errs.append(f"{label}: aplikace {a} × zdroj {b}")
    cmp("MZS počet", G["emp"]["count"], MZS["n"]); cmp("MZS průměr", G["emp"]["mean"], MZS["mean"])
    for p, v in G["emp"]["q"]: cmp(f"MZS P{int(p*100)}", v, MZS["q"][p])
    cmp("PLS počet", G["pub"]["count"], PLS["n"]); cmp("PLS průměr", G["pub"]["mean"], PLS["mean"])
    for p, v in G["pub"]["q"]: cmp(f"PLS P{int(p*100)}", v, PLS["q"][p])
    cmp("Důchodci počet", G["pens"]["count"], PENS["n"]); cmp("Důchodci průměr", G["pens"]["mean"], PENS["mean"])
    return errs

def main():
    results = {"transcription_errors": check_transcription(), "cases": []}
    for _, (Q, a, m) in {"emp": qfun_interp(MZS["q"], MZS["mean"], 0.4), "pub": qfun_interp(PLS["q"], PLS["mean"], 0.4)}.items():
        pass
    shapes = {}
    for name, G in (("emp", MZS), ("pub", PLS)):
        Q, alpha, mean_chk = qfun_interp(G["q"], G["mean"], 0.40)
        shapes[name] = dict(pareto_alpha=round(alpha, 3), mean_reconstructed=round(mean_chk, 1), mean_source=G["mean"],
                            quantiles_ok=all(abs(float(Q(p)) - v) < 0.5 for p, v in G["q"].items()))
    results["distribution_checks"] = shapes
    cases = [
        dict(label="výchozí návrh", rate=0.011, threshold=300000, cap=3000, marginal=True, includePensions=True),
        dict(label="bez důchodů", rate=0.011, threshold=300000, cap=3000, marginal=True, includePensions=False),
        dict(label="vyšší strop 5 000", rate=0.011, threshold=300000, cap=5000, marginal=True, includePensions=True),
        dict(label="nízká hranice 150 000", rate=0.011, threshold=150000, cap=3000, marginal=True, includePensions=True),
        dict(label="finské parametry v Kč", rate=0.025, threshold=368000, cap=3890, marginal=True, includePensions=True),
    ]
    for c in cases:
        lp = {k: c[k] for k in ("rate", "threshold", "cap", "marginal", "includePensions")}
        row = {"label": c["label"], "params": lp}
        for k, sc in SCEN.items():
            g, parts = revenue(lp, sc)
            row[f"py_{k}"] = g
        row["py_mid_parts"] = revenue(lp, SCEN["mid"])[1]
        row["alt_ln_med_mean_mid"] = revenue(lp, SCEN["mid"], "ln_med_mean")[0]
        row["alt_ln_p10_p90_mid"] = revenue(lp, SCEN["mid"], "ln_p10_p90")[0]
        j = js(lp)
        row.update(js_low=j["low"], js_mid=j["mid"], js_high=j["high"], js_groups=j["groups"])
        row["rel_diff_mid"] = (j["mid"] - row["py_mid"]) / row["py_mid"] if row["py_mid"] else 0.0
        results["cases"].append(row)
    with open(os.path.join(HERE, "recompute-results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print("Chyby přepisu:", results["transcription_errors"] or "žádné")
    print("Rozdělení:", json.dumps(shapes, ensure_ascii=False))
    print(f"{'případ':24s} {'JS střed':>9s} {'PY střed':>9s} {'rozdíl':>8s} {'LN med+průměr':>14s} {'LN P10/P90':>11s}")
    for r in results["cases"]:
        print(f"{r['label']:24s} {r['js_mid']/1e9:9.3f} {r['py_mid']/1e9:9.3f} {r['rel_diff_mid']*100:7.2f}% {r['alt_ln_med_mean_mid']/1e9:14.3f} {r['alt_ln_p10_p90_mid']/1e9:11.3f}")
    bad = [r for r in results["cases"] if abs(r["rel_diff_mid"]) > 0.005]
    sys.exit(1 if bad or results["transcription_errors"] else 0)

if __name__ == "__main__":
    main()
