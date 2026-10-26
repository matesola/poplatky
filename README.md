# Kdo platí? Jak financujeme média veřejné služby

Statický web bez buildu: jak se v Evropě financují média veřejné služby (45 zemí) a co by jednotlivé modely znamenaly pro českou domácnost. Stav legislativy ověřen k 26. 10. 2026.

Pořadí kapitol: úvod s blokem „Aktuální Česko“ a dvěma hlavními cestami, 01 kalkulačka, 02 Česko (stav legislativy a chronologie), 03 mapa a modely, 04 částky, 05 země a porovnání, 06 na obyvatele, 07 nezávislost a pojistky, 08 časová osa, 09 referenda a soudy, 10 pokročilé modelování, zdroje a metodika. Všechny dřívější kotvy (`#kalkulacka`, `#simulator`, `#metodika`, `#zeme-CZ` …) zůstaly.

- `index.html`: stránka, data zemí (`COUNTRIES`), příjmy pro ukazatel zátěže (`INCOME`, Eurostat), mapa, styly.
- `lab/params.js`: jediný zdroj čísel české části se zdroji a daty ověření.
- `lab/engine.js`: výpočetní jádro (kalkulačka i simulátor).
- `lab/share.js`: sdílení scénářů a porovnání přes URL (čisté funkce, validace).
- `lab/ui.js`, `lab/lab.css`: prezentace české části.
- `tests/`: jednotkové testy (`npm test`), E2E (`npm run e2e`), regrese dat (`node tests/regression-data.js`); `audit/`: nezávislý přepočet v Pythonu.
- `METODIKA.md`, `FISCAL-MODEL-AUDIT.md`: vzorce, předpoklady, omezení.

Sdílení: odkaz nese složení domácnosti a parametry modelu; hrubé příjmy jen po zaškrtnutí, zaokrouhlené na 1 000 Kč; přesný čistý příjem nikdy. Karta výsledku (PNG) vzniká v prohlížeči. Náhled odkazu na sociálních sítích je pro všechny odkazy stejný (`og.png`); personalizovaný náhled by vyžadoval serverovou funkci, viz `UX2-REPORT.md`.

Lokálně stačí otevřít `index.html` v prohlížeči. Kontrola: `npm install && npm run check`.
Nasazení: Vercel jako statický web (`vercel.json`), bez build kroku.
