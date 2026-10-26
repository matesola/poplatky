# Finální opravné kolo P0/P1: důkazní QA report

Datum: 26. 10. 2026. Větev `final` (vychází z `audit` 6fd5c26). Produkce nezměněna.

## Výchozí zjištění

Produkce (poplatky.vercel.app) dnes servíruje původní evropskou verzi `4718d17`. Vercel se z gitu neaktualizuje, takže na produkci nejsou ani `main` (0551291), ani `audit`. Nálezy ze zadání proto pocházejí ze dvou zdrojů:

- **Nuly v úvodních číslech** jsou vada staré produkce. Opravená už byla ve větvi `audit` a nasazená nikdy nebyla.
- **„ZTP/P“** se vyskytovalo i ve větvi `audit`: v metodice kalkulačky („při ZTP/P se zrakovým nebo sluchovým postižením“) a v názvu jednoho zdroje.
- **„stav k“** bez data byla skutečná vada i ve větvi `audit`. Datum doplňoval až JavaScript.

## Souhrnná tabulka

| Položka | Stav | Příčina, oprava, důkaz |
|---|---|---|
| Úvodní statistiky | **OPRAVENO A OVĚŘENO** (ve větvi; produkce stále stará) | **Příčina:** v HTML byly nuly a čísla doplňovala animace. **Oprava:** hodnoty 103 / €363 / 17 / 546 jsou přímo v HTML. Animace není, takže čtečky i extraktor čtou finální číslo. **Ověřeno ve čtyřech variantách:** s JS, bez JS, s `prefers-reduced-motion` (i po 1,5 s) a textovým extraktorem surového HTML bez DOM. Serverový rendering ani hydratace tu nejsou, web je statický. |
| Osvobození | **OPRAVENO A OVĚŘENO** | **Zdroj:** úplné znění zák. č. 348/2005 Sb. od MK (změny do č. 152/2025 Sb.), § 4 odst. 1 písm. g), § 4 odst. 3, § 8 odst. 2, pozn. 9 (vyhl. 207/1995 Sb.), a stránka ČT „Osvobození od platby“. **Změněná pravidla:** (1) nárok vzniká ze zákona od měsíce po vzniku důvodu, ne „na žádost“ ani na 6 měsíců; (2) děti zákon neřeší, jejich nezapočítání je výklad ČT, a proto domácnost s dětmi dostane stav „pravděpodobně“ s upozorněním; (3) průkaz je doklad (podle ČT ZTP/P u nevidomých, ZTP u neslyšících) a nárok nezakládá; (4) metodika kalkulačky už ZTP/P jako podmínku neuvádí; (5) text kapitoly 03 je zpřesněn. **Příklady v testech:** nevidomá žijící sama: osvobozena; neslyšící manželé: osvobozeni; nevidomý s vidící partnerkou: platí; držitel ZTP/P bez slepoty či hluchoty: zdravotní důvod nemá; nevidomý rodič s dítětem: „pravděpodobně“. |
| Datum právního stavu | **OPRAVENO A OVĚŘENO** | **Zdroj:** `lab/params.js` → `meta` se třemi odlišenými daty: legislativa ověřena 26. 10. 2026, znění § 4 a § 6 účinné od 1. 5. 2025, ŽM od 1. 10. 2026, data zkontrolována 26. 10. 2026. **HTML:** text je statický (`data-cfg`), `npm run sync` ho přepíše z konfigurace a unit test selže, pokud se HTML a params rozejdou. **Kontrola HTML:** extraktor i stránka bez JS najdou „znění účinné od 1. 5. 2025; legislativa ověřena k 26. 10. 2026“ a žádný popisek typu „stav k“, „účinné od“ nebo „zkontrolována“ bez data. |
| Matematika | **OPRAVENO A OVĚŘENO** (bez nalezené chyby výpočtu) | Nezávislá reference `audit/reference_cases.py`: **43 případů a 20 celostátních kontrol, 0 rozdílů**. Každý případ má ručně odvozený literál, vlastní implementaci v Pythonu nad Decimal a výstup aplikace. Výnos počítá znovu i `audit/recompute.py` (5 případů, rozdíl 0,00 %). Jednotkových testů je 55 (přibylo 8). |
| Fiskální model | **ZŮSTÁVÁ OTEVŘENÉ** (vstupní předpoklady) | **Ověřeno:** váhy, součty skupin, bilance, horní mez, pořadí scénářů, vyřazení OSVČ i důchodů, kalibrace. **Neověřeno:** Paretův chvost nad P90; ISPV v přepočtených osobách (×12 nadhodnocuje); dvojí počet pracujících důchodců v počtu osob (výnos tím nadsazen není); OSVČ; tvar rozdělení důchodů; scénáře nemění důchody. Všechna omezení jsou v aplikaci a ve FISCAL-MODEL-AUDIT.md § 8. Zelené testy dokazují jen shodu s metodikou, ne s realitou. |
| Mobil | **OPRAVENO A OVĚŘENO** v Chromiu; **ZŮSTÁVÁ OTEVŘENÉ** pro Safari na iPhonu | **Testované prostředí:** Chromium (Playwright 1.63.0), emulace mobilu s dotykem při šířkách 320, 360, 375, 390, 414 a 430 px a desktop 1366 px. **Nalezené a opravené vady:** (1) vodorovné posouvání stránky o 84 / 45 / 15 px při 320 / 360 / 390 px, existovalo už v `4718d17`; (2) pole příjmu na 320 px přesahovalo kartu; (3) písmo formulářových polí pod 16 px, na kterém iOS Safari při ťuknutí stránku přiblíží; (4) posuvníky a souhrny „Data grafu“ pod 24 px; (5) chybějící `inputmode` u vlastního cíle. **Safari:** Safari Technology Preview na propojeném Macu se přes WebDriver nespustilo (časový limit; pravděpodobně vypnuté „Allow Remote Automation“). Na iPhonu test **neproběhl**. |
| Regrese | **OPRAVENO A OVĚŘENO** | `tests/regression-data.js`: COUNTRIES (45), TIMELINE (25) a MAP jsou proti `4718d17` i `main` beze změny, takže sazby, měny a data se nezměnily. E2E: mapa, žebříček, 45 karet, vyhledávání, detail země, odkaz `#zeme-CZ`, navigace, přímé odkazy `#kalkulacka`, `#simulace` a `#metodika`, simulátor, kalibrace, grafy C a D. axe (WCAG 2.2 AA): desktop světlý i tmavý 0 porušení. Na mobilu zůstává 1 typ (`target-size`): body roků na časové ose (evropská část, beze změny). Stejnou funkci nabízí posuvník, takže platí výjimka „ekvivalent“ WCAG 2.5.8. |
| Build | **PROBLÉM SE NEPOTVRDIL** (build neexistuje) | Web je statický bez buildu (`vercel.json`: prázdný build). Proběhlo: `tsc --checkJs` bez chyb, `npm test` 55/55, `npm run audit` (recompute 5/5 a reference 63/63), `npm run e2e` 67/67, data 0 rozdílů. **ZŮSTÁVÁ OTEVŘENÉ:** proč Vercel z gitu nenasazuje. API vrací 403, preview deployment odsud vytvořit nejde. |
| Změny | | `index.html`, `lab/engine.js`, `lab/params.js`, `lab/ui.js`, `METODIKA.md`, `FISCAL-MODEL-AUDIT.md`, `package.json`, `tests/engine.test.js`, `tests/e2e.js`, nově `audit/reference_cases.py`, `audit/reference-results.json`, `scripts/sync-static.js`, `tests/regression-data.js`, `tests/regression-data-results.json` a tento report. |

## Uživatelský průchod (reálný prohlížeč Chromium, desktop i mobil)

Všech deset kroků prošlo na desktopu i na mobilu:

1. Otevření webu.
2. Tlačítko z úvodu doveze na kalkulačku. Plynulé posouvání trvá asi 2 s a skončí 58 px pod horním okrajem.
3. Individuální příjem: výsledek kalkulačky se rovná jádru i hodnotě v grafu A (A i C).
4. Přidání a odebrání dospělých přepočítá A i C.
5. Přepnutí právního stavu ŽM změní limit; přepnutí projekce (nominálně a reálně) změní graf D.
6. Osvobození: smíšená domácnost, oba dospělí s postižením, domácnost s dítětem.
7. Sazba 2 %: kalkulačka, graf A a simulátor (hrubý i čistý výnos) se shodují s jádrem.
8. Grafy A až D a decily jsou vykreslené.
9. Metodika obsahuje písm. g), výklad ČT, upozornění k průkazu a tři data.
10. Obnovení stránky; přímý odkaz `#simulace` v nové kartě a po obnovení.

Rozpor mezi číslem v kalkulačce a hodnotou v grafu nenastal.

## Co nelze garantovat

- Správnost fiskálního odhadu (viz Fiskální model). Model slouží pro řády a citlivost, ne pro rozpočet.
- Chování v Safari na iPhonu: numerická klávesnice, přilepený posuvník při skrývání lišty a výřez displeje.
- Že ČT a ČRo budou výklad o dětech uplatňovat stejně. Kalkulačka proto ukazuje jen „pravděpodobně“.
- Nasazení: dokud se nevyřeší propojení Vercelu s gitem, nedostane se na produkci žádná větev.
