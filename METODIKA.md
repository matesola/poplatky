# Jak by mohlo Česko platit: metodika

Verze parametrů `2026-10-26.1`, právní stav k 26. 10. 2026. Kapitola 04 webu.

## Architektura

| Soubor | Účel |
|---|---|
| `lab/params.js` | Jediné místo pro čísla, sazby, zdroje a předpoklady. Každý údaj má kategorii `fakt` / `navrh` / `model` / `autor`. Změna legislativy = změna tohoto souboru. |
| `lab/engine.js` | Výpočetní jádro: čisté funkce bez DOM, typy v JSDoc (`tsc --checkJs`). Běží v prohlížeči i v Node. |
| `lab/ui.js` | Prezentace: formuláře, SVG grafy, tabulky. Jen čte parametry a volá jádro. |
| `lab/lab.css` | Styly kapitoly, navazují na design webu. |
| `tests/engine.test.js` | Jednotkové testy (`npm test`). |

Výpočty probíhají jen v prohlížeči. Příjmy se nikam neodesílají a neukládají; web nemá analytiku.

## Kategorie údajů

- **Ověřený fakt**: zákon, oficiální statistika nebo dohledatelný zdroj.
- **Legislativní návrh**: sněmovní tisk 231 (po 1. čtení 24. 10. 2026), nemusí být schválen.
- **Modelový výpočet**: výsledek ze zveřejněných předpokladů.
- **Autorský návrh**: účelový odvod; není zákonem ani vládním návrhem.

## A. Současný systém

- 150 Kč TV + 55 Kč rozhlas měsíčně, jednou za domácnost (zák. č. 348/2005 Sb. ve znění zák. č. 119/2025 Sb.).
- Osvobození, když je průměrný měsíční čistý příjem domácnosti pod 2,15násobkem životního minima. Životní minimum se mění 1. 10. 2026: jednotlivec 5 500 Kč, první dospělý 5 000 Kč, další dospělý 3 750 Kč, děti 2 480 / 3 050 / 3 490 Kč. Kalkulačka umí oba právní stavy.
- Další osvobození: ZTP/P s těžkým zrakovým nebo sluchovým postižením; domácnost bez zařízení schopného příjmu.
- Čistý příjem je orientační: pojistné 11,6 %, daň 15 % (23 % nad 146 901 Kč měsíčně), sleva na poplatníka 2 570 Kč. Bez slev na děti. Lze zadat ručně.

## B. Rozpočtový model (tisk 231)

- ČT 5 741 826 000 Kč, ČRo 2 065 766 000 Kč ročně. Podle RIA to odpovídá výběru poplatků za rok 2024.
- Měsíční splátky do 15. dne, mandatorní výdaj kapitoly ministerstva kultury.
- Valorizace +10 %, jakmile kumulovaná inflace od roku 2026 přesáhne 10 p. b.
- Přímá platba domácnosti je 0 Kč. Přepočet na obyvatele (716 Kč) a domácnost (1 622 Kč, SLDB 2021) je jen ilustrace velikosti, ne platba jednotlivce.

## C. Účelový odvod (autorský návrh)

Pro každou osobu zvlášť:

```
odvod = 0                                  když roční hrubý příjem ≤ hranice
odvod = min(strop, sazba × (příjem − hranice))   finský typ (výchozí)
odvod = min(strop, sazba × příjem)               varianta „z celého příjmu“
```

Domácnost = součet osob v okruhu (zaměstnanci; volitelně důchodci a OSVČ).

Výchozí parametry: sazba 1,1 %, hranice 300 000 Kč ročně, strop 3 000 Kč, správní náklady 1 %, rezerva 2 %. Sazba 1,1 % je zaokrouhlený výsledek kalibrace na částku tisku 231 ve středním scénáři, ne doporučení.

## Celostátní simulace

1. **Zaměstnanci, mzdová sféra** (ISPV 2025, 3 010 200 osob): kvantily P10 24 919, P25 32 538, P50 43 241, P75 58 801, P90 85 087, průměr 52 239 Kč.
2. **Zaměstnanci, platová sféra** (ISPV 2025, 683 868 osob): P10 32 099, P50 48 064, P90 74 104, průměr 52 037 Kč.
3. Kvantilová funkce: log-lineární interpolace mezi kvantily, lineární dolní chvost k `lowTail × P10`, nad P90 Paretův chvost s exponentem dopočteným tak, aby průměr rozdělení odpovídal zveřejněnému průměru. Přepočet na rok 2026 růstem průměrné mzdy +6,4 % (ČSÚ, 2. čtvrtletí 2026).
4. **Důchodci** (ČSSZ 6/2026): 2 333 762 starobních s průměrem 21 803 Kč, 420 880 invalidních s průměrem 14 500 Kč (vážený odhad). Rozdělení lognormální s variačním koeficientem 0,2 a 0,25 (předpoklad).
5. **OSVČ** (739 472 povinných platit zálohy): rozdělení zisků podle výše není veřejné. Lognormální s mediánem 300 000 Kč a σ = 0,9 je **neověřený předpoklad**; ve výchozím stavu vypnuto.
6. Interval tří scénářů:

| Scénář | počet osob | růst mezd | dolní chvost | úspěšnost výběru |
|---|---|---|---|---|
| pesimistický | −5 % | −1 p. b. | 0,25 × P10 | 97 % |
| střední | 0 | 0 | 0,40 × P10 | 99 % |
| optimistický | +5 % | +1 p. b. | 0,55 × P10 | 100 % |

7. Bilance: hrubý výnos = čistý výnos + správní náklady + rezerva (kontroluje se při každém výpočtu i v testech).
8. Verdikt „dostatečné“ se zobrazí jen tehdy, když cíl pokryje i pesimistický scénář. Pokryje-li ho jen část scénářů, verdikt zní „nejisté“.
9. Kalibrace: bisekce sazby (do 3 %) nebo stropu (do 15 000 Kč) na požadovaný čistý výnos; vypisuje se i hodnota pro pesimistický scénář.

## Projekce (graf D)

Projekce, ne prognóza. Poplatek +6 % od 1. 7. roku následujícího po překročení kumulované inflace 6 % (počítáno od zvýšení v květnu 2025). Rozpočtový model +10 % v roce následujícím po překročení 10 p. b. (od roku 2026). Odvod: příjmy rostou nominálními mzdami (inflace + 1,5 % reálně); hranice a strop buď indexované mzdou, nebo pevné. Reálné hodnoty v cenách roku 2026.

## Známá omezení a co ověřit

- ISPV přepočítává zaměstnance na placené měsíce; roční příjmy zkrácených úvazků jsou nižší (pokryto intervalem jen částečně).
- Souběhy příjmů (pracující důchodci, zaměstnanci s živností) se nesčítají.
- Výběr poplatků ČRo za rok 2025 není ve zdrojích.
- Detaily valorizace v tisku 231 (index, výchozí měsíc) a změny po 1. čtení je nutné ověřit v textu tisku na psp.cz.
- Stav ústavní novely o NKÚ (tisk 47) a tisku 217 je doložen zprávami do června 2026.
- Odkazy na zakonyprolidi.cz a EUR-Lex nešlo z vývojového prostředí automaticky otevřít; je nutné je ručně proklikat.

## Testy

```
npm install      # jen typescript a @types/node pro typovou kontrolu
npm run check    # tsc --checkJs + node --test
```

Testy pokrývají nulový příjem, hranici, překročení stropu, zákonná osvobození (příjmový limit před a po 1. 10. 2026, děti, ZTP/P, bez zařízení, ruční čistý příjem), individuální výpočet místo příjmu domácnosti, nulové náklady rozpočtového modelu, shodu rozdělení se zveřejněnými kvantily a průměrem, bilanci simulátoru, kalibraci a valorizaci v projekci.
