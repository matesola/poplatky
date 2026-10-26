# Release candidate „Kdo platí?“

Datum: 26. 10. 2026. Větev `release` (vychází z `final`). Produkce (`main` 0551291) nezměněna, nasazení až po schválení.

## Nová identita

| Místo | Změna | Stav |
|---|---|---|
| H1, podtitulek, perex | Přesné znění zadání: „Kdo platí?“, „Jak financujeme média veřejné služby.“ a perex beze změny slova. Původní perex nahrazen, nic navíc | Opraveno a ověřeno (E2E porovnává text s JS i bez něj) |
| Vstupy z úvodu | Čtyři odkazy pod perexem: Evropské srovnání, Český kontext, Kalkulačka, Metodika a zdroje. Na mobilu mřížka 2×2, dotykové cíle 44 px | Opraveno a ověřeno |
| `<title>`, description, OG, Twitter, JSON-LD (WebSite), manifest | Nový název, canonical a `og:url` `https://poplatky.app/`, `og:image` 1200×630 ve stávající typografii | Opraveno a ověřeno |
| Patička, README, METODIKA | Nový název; původní „Poplatky za vysílání v Evropě“ zůstává jen jako historický název evropské části | Opraveno a ověřeno |
| Výchozí motiv | Světlý vždy, i při tmavém nastavení systému; tmavý jen po přepnutí tlačítkem, volba se pamatuje a načítá už v hlavičce (bez probliknutí) | Opraveno a ověřeno (E2E, axe v obou režimech 0) |
| Navigace kapitol | Beze změny, všechny kotvy zachovány | Problém se nepotvrdil |

## Tři chyby

| Chyba | Skutečná příčina | Oprava | Ověření | Stav |
|---|---|---|---|---|
| Úvodní statistiky 0 | Produkce (0551291) má v HTML nuly, čísla psal až skript | Hodnoty jen v HTML. Skript počítadel odstraněn (animaci stejně přeskakoval), takže rozdíl mezi HTML a hydratací nemůže vzniknout | E2E: s JS, bez JS, reduced motion, extraktor surového HTML; nový test „čísla bez JS = čísla s JS“ pro celou stránku | Opraveno a ověřeno |
| ZTP/P | Produkce: zaškrtávátko „těžké zrakové nebo sluchové postižení (ZTP/P)“ osvobozovalo celou domácnost | § 4 odst. 1 písm. g) zák. 348/2005 Sb. (úplné znění MK): podmínka u každého dospělého, osvobozeno jen když ji mají všichni; nárok ze zákona; s dětmi jen „pravděpodobně“ (výklad ČT); průkaz nárok nezakládá | 8 právních příkladů v testech, E2E | Opraveno a ověřeno |
| „stav k“ bez data | Produkce: datum doplňoval až skript | Statický text z jednoho configu, rozlišeno ověření (26. 10. 2026) a účinnost (1. 5. 2025) | Unit test HTML = config, extraktor i stránka bez JS | Opraveno a ověřeno |

## Nové nálezy v tomto kole

| Nález | Oprava | Stav |
|---|---|---|
| Slovinské referendum: úvodní číslo 546 hlasů bylo zastaralé a odporovalo vlastnímu textu (50,14 %) | Podle RTV SLO 19. 10. 2026 po hlasech ze zahraničí: 464 680 proti, 462 047 pro, rozdíl 2 633, neoficiálně do úředního potvrzení (do 30. 10.). Upraveno v úvodu, kapitole 06, datech země a zdrojích | Opraveno a ověřeno |
| Časová osa: v HTML „10 zemí bez samostatné platby“, skript ukáže 26 | Statická hodnota 26 (26 + 3 + 16 = 45) | Opraveno a ověřeno |
| Přímé odkazy na evropské kapitoly (`#osa` ap.) končily 440 až 760 px vedle | Dorovnání pozice po vykreslení rozšířeno na všechny kotvy | Opraveno a ověřeno (všech 9 kotev navigace + `#zeme-CZ`, desktop i mobil) |

## Obsahová kontrola

- Šest modelů: domácnost 6, přístroj 3, daň 3, elektřina 6, rozpočet 26, nákup 1 = 45. Text „Ve 26 zemích ze 45“ sedí. 17 zrušení od 1999 odpovídá časové ose. **Ověřeno.**
- Životní minimum od 1. 10. 2026 (5 500 / 5 000 / 3 750, děti 2 480 / 3 050 / 3 490) a předchozí částky: shoda s finance.cz a kurzy.cz. **Ověřeno.**
- Tisk 231: po 1. čtení 24. 10. 2026, ve výborech; novější vývoj jsem nenašel. **Ověřeno k 26. 10.**
- Sazby 150 + 55 Kč, § 4 a § 6: úplné znění MK. **Ověřeno.**
- Rozpočty ČT a ČRo, EMFA, ostatní evropské země: v tomto kole znovu neověřovány, data beze změny (regresní test). **Zůstává otevřené** pro ruční kontrolu.

## Matematika

Nezávislá reference 43 případů a 20 celostátních kontrol, 0 rozdílů. Přepočet výnosu v Pythonu 0,00 %. Kalkulačka = graf A = jádro, simulátor = jádro (E2E). Celostátní výsledky jsou orientační: neověřené vstupy jsou horní chvost mezd, roční příjem z přepočtených osob ISPV, souběhy, OSVČ a tvar rozdělení důchodů (FISCAL-MODEL-AUDIT.md § 7 a § 8).

## Testování

| Sada | Výsledek |
|---|---|
| `tsc --checkJs` | bez chyb |
| `npm test` | 55/55 |
| `npm run audit` | recompute 5/5 (0,00 %), reference 63/63 |
| `npm run e2e` (Chromium 1.63, desktop 1366, mobil 320 až 430 px s dotykem, bez JS, reduced motion) | 74/74 |
| `tests/regression-data.js` | 0 neočekávaných rozdílů (2 povolené: Slovinsko) |
| axe WCAG 2.2 AA | desktop 0 ve světlém i tmavém; mobil 1 typ `target-size` (body roků na časové ose, ekvivalent posuvníkem, výjimka 2.5.8) |
| Výkon (lab, Chromium) | desktop LCP 184 ms, CLS 0; mobil 4× CPU LCP 516 ms, CLS 0 |
| Build | statický web bez buildu; Vercel sestavuje preview větve |
| Safari na iPhonu | **neproběhlo**; Safari Technology Preview na Macu se přes WebDriver nespustilo |

## Release

- Preview: `https://poplatky-git-release-matesolas-projects.vercel.app` (chráněno přihlášením Vercel). Z tohoto prostředí jsem ho otevřít nemohl.
- Commit: viz `git log release -1`.

### Blokující před produkcí

1. **Doména:** `poplatky.app` dnes dělá 308 na `www.poplatky.app`. Canonical, OG a sitemap míří na `https://poplatky.app/`, takže ve Vercelu (Project › Settings › Domains) je potřeba nastavit `poplatky.app` jako hlavní a `www` přesměrovat na ni. DNS jsem neměnil.
2. **Safari na iPhonu:** ruční průchod v preview.
3. **Vercel subdoména:** `poplatky.vercel.app` servíruje stejný obsah bez přesměrování; canonical duplicitu řeší, přesměrování je volitelné.
