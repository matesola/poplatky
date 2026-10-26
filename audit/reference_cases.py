#!/usr/bin/env python3
"""Nezávislá referenční kontrola kalkulačky a simulátoru (finální kolo P0).

Proč je nezávislá:
  * Očekávané hodnoty NEJSOU spočtené voláním lab/engine.js. Každý případ má
    ručně odvozenou hodnotu (vzorec v komentáři, literál v kódu) a navíc ji
    přepočítává vlastní implementace pravidel v Pythonu nad Decimal,
    psaná podle textové specifikace v METODIKA.md a zákona, ne podle JS.
  * Zákonné konstanty (2,15 × ŽM, částky ŽM, 150 + 55 Kč) jsou zde přepsány
    ze zdrojů (zák. č. 348/2005 Sb., nař. vl. k ŽM od 1. 10. 2026), ne načteny z params.js.
  * Engine se volá jen jako „černá skříňka“ přes Node a výsledky se porovnají.

Spuštění: python3 audit/reference_cases.py  (zapíše audit/reference-results.json, exit 1 při rozdílu)
"""
import json, os, subprocess, sys
from decimal import Decimal as D, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ---------- Zákonné konstanty přepsané ze zdrojů ----------
FEE_MONTH = D(150) + D(55)                 # § 6 zák. 348/2005 Sb. ve znění 119/2025, od 1. 5. 2025
MULT = D("2.15")                            # § 4 odst. 2
ZM_NEW = dict(single=D(5500), first=D(5000), other=D(3750), k0_6=D(2480), k6_15=D(3050), k15_26=D(3490))  # od 1. 10. 2026
ZM_OLD = dict(single=D(4860), first=D(4470), other=D(4040))   # do 30. 9. 2026; dětské částky se netestují


# ---------- Vlastní implementace pravidel (podle specifikace, ne podle JS) ----------
def ref_levy_person(annual, rate, thr, cap, marginal=True):
    """METODIKA § C: 0 když příjem <= hranice; jinak min(strop, sazba*(příjem-hranice)) / min(strop, sazba*příjem)."""
    y = max(D(0), D(str(annual)))
    if y <= D(str(thr)):
        return D(0)
    base = (y - D(str(thr))) if marginal else y
    return min(D(str(cap)), base * D(str(rate)))

def ref_base(adult, include_pensions):
    t = adult["type"]; g = D(str(adult.get("grossMonthly", 0))) * 12
    if t == "none": return D(0)
    if t == "pens": return g if include_pensions else D(0)
    if t == "emppens": return g + (D(str(adult.get("pensionMonthly", 0))) * 12 if include_pensions else D(0))
    return g  # emp, self

def ref_household_levy(adults, lp):
    return sum((ref_levy_person(ref_base(a, lp["includePensions"]), lp["rate"], lp["threshold"], lp["cap"], lp["marginal"]) for a in adults), D(0))

def ref_zm(n_adults, kids=(0, 0, 0), new=True):
    z = ZM_NEW if new else ZM_OLD
    adults = z["single"] if (n_adults == 1 and sum(kids) == 0) else z["first"] + z["other"] * (n_adults - 1)
    if not any(kids): return adults
    return adults + z["k0_6"] * kids[0] + z["k6_15"] * kids[1] + z["k15_26"] * kids[2]


LP0 = dict(rate=0.011, threshold=300000, cap=3000, marginal=True, includePensions=True, includeSelf=False, adminCostRate=0.01, reserveRate=0.02)
def lp(**kw):
    x = dict(LP0); x.update(kw); return x
E = lambda m: {"type": "emp", "grossMonthly": m}

# ---------- Případy: (název, vstup, ručně odvozená hodnota) ----------
LEVY_CASES = [
    ("nulový příjem", [E(0)], lp(), 0),                                     # 0 <= 300 000
    ("přesně na hranici 25 000 Kč/měs.", [E(25000)], lp(), 0),               # 300 000 <= 300 000
    ("těsně pod hranicí 24 999 Kč/měs.", [E(24999)], lp(), 0),
    ("těsně nad hranicí 25 001 Kč/měs.", [E(25001)], lp(), 0.132),           # (300 012 − 300 000) × 0,011
    ("pod stropem 40 000 Kč/měs.", [E(40000)], lp(), 1980),                  # 180 000 × 0,011
    ("přesně na stropu", [E(25000 + 3000 / 0.011 / 12)], lp(), 3000),        # (y−T)·r = 3 000
    ("nad stropem 1 000 000 Kč/rok", [E(1_000_000 / 12)], lp(), 3000),       # 700 000 × 0,011 = 7 700 → 3 000
    ("extrémní příjem 1 mld. Kč/měs.", [E(1e9)], lp(), 3000),
    ("záporný vstup = 0", [E(-5000)], lp(), 0),
    ("tři dospělí 40 000 / 60 000 / bez příjmu", [E(40000), E(60000), {"type": "none", "grossMonthly": 0}], lp(), 4980),  # 1 980 + min(3 000; 4 620)
    ("nulová sazba", [E(80000)], lp(rate=0), 0),
    ("nulový strop", [E(80000)], lp(cap=0), 0),
    ("varianta z celého příjmu, 400 000 Kč/rok", [E(400000 / 12)], lp(marginal=False, cap=5000), 4400),  # 400 000 × 0,011
    ("výjimka: důchodce mimo okruh", [{"type": "pens", "grossMonthly": 30000}], lp(includePensions=False), 0),
    ("důchodce v okruhu 30 000 Kč/měs.", [{"type": "pens", "grossMonthly": 30000}], lp(), 660),          # 60 000 × 0,011
    ("souběh mzda 30 000 + důchod 20 000, strop 10 000", [{"type": "emppens", "grossMonthly": 30000, "pensionMonthly": 20000}], lp(cap=10000), 3300),  # 300 000 × 0,011
    ("souběh, důchody mimo okruh", [{"type": "emppens", "grossMonthly": 30000, "pensionMonthly": 20000}], lp(includePensions=False), 660),  # 60 000 × 0,011
    ("OSVČ v kalkulačce vždy v okruhu", [{"type": "self", "grossMonthly": 50000}], lp(includeSelf=False), 3000),  # 300 000 × 0,011 = 3 300 → 3 000
]

FEE_CASES = [
    # (název, domácnost, očekávaný měsíční poplatek, očekávaný limit v Kč, očekávaný stav)
    ("jednotlivec, limit od 1. 10. 2026", {"adults": [E(0)], "netOverride": 11824}, 0, 11825, "osvobozen"),        # 2,15 × 5 500
    ("jednotlivec přesně na limitu platí (ostrá nerovnost)", {"adults": [E(0)], "netOverride": 11825}, 205, 11825, "plati"),
    ("jednotlivec do 30. 9. 2026", {"adults": [E(0)], "netOverride": 10448, "date": "2026-09-30"}, 0, 10449, "osvobozen"),  # 2,15 × 4 860
    ("pár", {"adults": [E(0), E(0)], "netOverride": 18812}, 0, 18812.5, "osvobozen"),                               # 2,15 × 8 750
    ("pár s dítětem 6 až 15", {"adults": [E(0), E(0)], "kids6_15": 1, "netOverride": 30000}, 205, 25370, "plati"),  # 2,15 × 11 800
    ("bez zařízení", {"adults": [E(90000)], "noDevice": True}, 0, None, "neplati"),
    ("nevidomá žijící sama", {"adults": [{"type": "emp", "grossMonthly": 60000, "sensory": True}]}, 0, None, "osvobozen"),
    ("nevidomý s vidící partnerkou", {"adults": [{"type": "emp", "grossMonthly": 45000, "sensory": True}, E(45000)]}, 205, None, "plati"),
    ("nevidomý rodič s dítětem (výklad ČT)", {"adults": [{"type": "emp", "grossMonthly": 50000, "sensory": True}], "kids0_6": 1}, 0, None, "pravdepodobne"),
    ("vysoký příjem", {"adults": [E(80000), E(80000)]}, 205, None, "plati"),
]


def run_engine(payload):
    code = r"""
const P=require('./lab/params.js'),E=require('./lab/engine.js');
const inp=JSON.parse(require('fs').readFileSync(0,'utf8'));
const out={levy:[],fee:[],national:{}};
for(const c of inp.levy){ out.levy.push(E.householdLevy({adults:c.adults},c.lp,0).total); }
for(const c of inp.fee){ const r=E.currentFee(P,c.h); out.fee.push({monthly:r.monthly,limit:r.limit,status:r.status}); }
const lp=Object.assign({},P.levyDefault,inp.lp0);
const s=E.simulate(P,lp,0);
const n={};
for(const k of ['low','mid','high']){ const x=s[k]; n[k]={gross:x.gross,admin:x.admin,reserve:x.reserve,net:x.net,people:x.people,groups:x.groups}; }
n.balanced=s.balanced;
n.groupCounts={emp:P.groups.emp.count,pub:P.groups.pub.count,pens:P.groups.pens.count,inv:P.groups.inv.count,self:P.groups.self.count};
n.scen=P.sim.scenarios;
n.unreach=E.calibrate(P,lp,50e9,'rate','mid',{rateMax:0.03});
n.reach=E.calibrate(P,lp,7.81e9,'rate','mid',{rateMax:0.03});
n.reachCheck=E.simulate(P,Object.assign({},lp,{rate:n.reach.value}),0).mid.net;
n.withSelf=E.simulate(P,Object.assign({},lp,{includeSelf:true}),0).mid.groups;
n.noPens=E.simulate(P,Object.assign({},lp,{includePensions:false}),0).mid;
n.admin0=E.simulate(P,Object.assign({},lp,{adminCostRate:0,reserveRate:0}),0).mid;
n.adminBad=E.simulate(P,Object.assign({},lp,{adminCostRate:0.6,reserveRate:0.5}),0);
out.national=n;
console.log(JSON.stringify(out));
"""
    r = subprocess.run(["node", "-e", code], cwd=ROOT, input=json.dumps(payload), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def main():
    payload = {"levy": [{"adults": a, "lp": p} for _, a, p, _ in LEVY_CASES],
               "fee": [{"h": h} for _, h, *_ in FEE_CASES], "lp0": LP0}
    js = run_engine(payload)
    rows, fails = [], 0

    def check(group, name, expected, ref, got, tol=1e-6):
        nonlocal fails
        ok = abs(float(expected) - float(ref)) <= tol and abs(float(expected) - float(got)) <= tol
        fails += 0 if ok else 1
        rows.append(dict(skupina=group, pripad=name, rucne=float(expected), reference=float(ref), aplikace=float(got), ok=ok))

    # 1. Odvod osob a domácností
    for (name, adults, p, exp), got in zip(LEVY_CASES, js["levy"]):
        check("odvod", name, exp, ref_household_levy(adults, p), got, 1e-6)

    # 2. Dnešní poplatek a osvobození
    for (name, h, exp_m, exp_limit, exp_status), got in zip(FEE_CASES, js["fee"]):
        kids = (h.get("kids0_6", 0), h.get("kids6_15", 0), h.get("kids15_26", 0))
        new = h.get("date", "2026-10-26") >= "2026-10-01"
        ref_limit = MULT * ref_zm(len(h["adults"]), kids, new)
        if exp_limit is not None:
            check("limit osvobození", name, exp_limit, ref_limit, got["limit"], 1e-6)
        check("poplatek Kč/měs.", name, exp_m, exp_m, got["monthly"], 1e-9)
        ok = got["status"] == exp_status
        fails += 0 if ok else 1
        rows.append(dict(skupina="stav", pripad=name, rucne=exp_status, reference=exp_status, aplikace=got["status"], ok=ok))

    # 3. Celostátní kontroly
    N = js["national"]; nat = []
    def ncheck(name, ok, detail):
        nonlocal fails
        fails += 0 if ok else 1
        nat.append(dict(kontrola=name, ok=bool(ok), detail=detail))
    gc, sc = N["groupCounts"], N["scen"]
    for k in ("low", "mid", "high"):
        x = N[k]
        # Populační váhy: zaměstnanci × countF, důchodci bez škálování (data 6/2026)
        exp_people = (gc["emp"] + gc["pub"]) * sc[k]["countF"] + gc["pens"] + gc["inv"]
        ncheck(f"váhy osob ({k})", abs(x["people"] - exp_people) < 1, f"{x['people']:.0f} vs {exp_people:.0f}")
        ncheck(f"součet skupin = celek ({k})", abs(sum(x["groups"].values()) - x["gross"]) < 1, f"{sum(x['groups'].values()):.0f} vs {x['gross']:.0f}")
        ncheck(f"bilance hrubý = čistý + správa + rezerva ({k})", abs(x["gross"] - x["admin"] - x["reserve"] - x["net"]) < 1 and abs(x["admin"] - 0.01 * x["gross"]) < 1 and abs(x["reserve"] - 0.02 * x["gross"]) < 1, "1 % a 2 % z hrubého")
        ncheck(f"horní mez výnosu: strop × osoby ({k})", x["gross"] <= 3000 * x["people"] + 1, f"{x['gross']/1e9:.3f} ≤ {3000*x['people']/1e9:.3f} mld.")
    ncheck("pořadí scénářů pesimistický < střední < optimistický", N["low"]["gross"] < N["mid"]["gross"] < N["high"]["gross"], f"{N['low']['gross']/1e9:.2f} / {N['mid']['gross']/1e9:.2f} / {N['high']['gross']/1e9:.2f}")
    ncheck("OSVČ ve výchozím stavu nejsou v součtu", "self" not in N["mid"]["groups"], ",".join(N["mid"]["groups"]))
    ncheck("OSVČ po zapnutí jsou samostatná skupina", "self" in N["withSelf"], f"{N['withSelf'].get('self', 0)/1e9:.2f} mld. (neověřený předpoklad)")
    ncheck("bez důchodů zmizí skupiny pens a inv", not any(g in N["noPens"]["groups"] for g in ("pens", "inv")), ",".join(N["noPens"]["groups"]))
    ncheck("nulové správní náklady: čistý = hrubý", abs(N["admin0"]["net"] - N["admin0"]["gross"]) < 1, "")
    ncheck("správa + rezerva ≥ 100 % je odmítnuto", N["adminBad"].get("valid") is False, "; ".join(N["adminBad"].get("errors", [])))
    ncheck("nedosažitelná kalibrace 50 mld. hlásí neúspěch", N["unreach"]["ok"] is False and N["unreach"]["achieved"] < 50e9, f"max {N['unreach']['achieved']/1e9:.2f} mld. při sazbě 3 %")
    ncheck("kalibrace 7,81 mld. dosáhne cíle", N["reach"]["ok"] and N["reachCheck"] >= 7.81e9 - 1, f"sazba {N['reach']['value']*100:.3f} %, čistý {N['reachCheck']/1e9:.4f} mld.")

    res = dict(cases=rows, national=nat, failures=fails)
    with open(os.path.join(HERE, "reference-results.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1, default=str)
    for r in rows:
        print(f"{'OK ' if r['ok'] else 'CHYBA'} {r['skupina']:18s} {r['pripad']:52s} ručně {r['rucne']!s:>14s}  aplikace {r['aplikace']!s:>14s}")
    for r in nat:
        print(f"{'OK ' if r['ok'] else 'CHYBA'} {r['kontrola']:58s} {r['detail']}")
    print(f"Případů: {len(rows)}, celostátních kontrol: {len(nat)}, chyb: {fails}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
