# Kdo platí? 2.0: report

Větev `ux-2` (z `main` 865685d). Produkce nezměněna. Audit výchozího stavu: [AUDIT-UX2.md](AUDIT-UX2.md).

## Provedené změny

| Oblast | Změna | Stav |
|---|---|---|
| Homepage | Pod perexem blok **Aktuální Česko**: 2 460 Kč ročně (platná legislativa), tisk 231 po 1. čtení „Schválený není“, datum ověření z `params.meta`, odkaz na stav legislativy. Pod ním **dvě hlavní cesty**: „Kolik bych platil já?“ a „Jak platí Evropa?“, vedlejší odkazy Česko podrobně, Nezávislost, Metodika | hotovo, ověřeno |
| Počet zemí | Všechny výskyty „45“ v textu (`data-n-countries`) se berou z datové sady; staticky v HTML hlídá unit test | hotovo, ověřeno |
| Pořadí kapitol | 01 Kalkulačka, 02 Česko, 03 Mapa a modely, 04 Částky, 05 Země a porovnání, 06 Na obyvatele, 07 Nezávislost a pojistky, 08 Časová osa, 09 Referenda a soudy, 10 Pokročilé modelování, Zdroje a metodika. Kapitola „Co kdybychom platili jinak?“ rozdělena na kalkulačku (01), pojistky (07) a modelování (10, nese původní kotvu `#cele-cesko`). Metodika výpočtů je v kapitole Zdroje | hotovo; všech 16 dřívějších kotev z odkazů na stránce funguje (test), plus `#zeme-XX` |
| Kalkulačka | **Rychlá odpověď** (A, B, C ročně) hned pod zadáním dospělých na displejích do 900 px; podrobné zadání (děti, čistý příjem, právní stav) ve sbalitelné části; parametry odvodu dál v simulátoru s odkazem z výsledku C. Jedno volání jádra pro obě úrovně | hotovo, ověřeno (test rychlá = plná odpověď, test základ = podrobné zadání s výchozími hodnotami) |
| Evropa: tři pohledy | Mapa: model, €/rok, **zátěž (% mediánového příjmu)**. Zátěž jen pro 13 zemí s paušálním poplatkem a údajem v EU-SILC 2024 (Eurostat ilc_di03); ostatní „nesrovnatelné“ s důvodem | hotovo, ověřeno |
| Rozpočtové země | Mapa, detail i porovnání píší „0 € přímo; financuje státní rozpočet“ a upozorňují, že bez platby neznamená bez nákladů | hotovo, ověřeno |
| Porovnání zemí | 2 až 4 země vedle sebe (model, přímá platba, místní měna, zátěž, základ, výběrčí, stav a zdroj). Na mobilu se mění na seznam po údajích se jménem země u každé hodnoty, bez vodorovného posouvání. Odkaz `?srovnat=CZ.AT.PL#porovnani` | hotovo, ověřeno |
| Důvěryhodnost u země | Detail země má blok **Údaje o zemi**: model, stav údajů (24. 10. 2026), měnový přepočet, zátěž, primární zdroj, omezení (z centrálního seznamu otevřených otázek) | hotovo, ověřeno |
| 45 × 46 | Pravidla zahrnutí v kapitole 05 a v METODIKA.md | hotovo |
| Sdílení | Odkaz s validovanými parametry (`lab/share.js`), Kopírovat odkaz, Web Share API (kde je), **karta výsledku PNG** 1200×630 generovaná v prohlížeči, odkaz na scénář simulátoru, odkaz na porovnání. Příjmy jen po zaškrtnutí a zaokrouhlené na 1 000 Kč; čistý příjem nikdy; odkaz je vidět v poli před sdílením | hotovo, ověřeno |
| Legislativa | Čtyřstavový přehled na začátku kapitoly 02: platná legislativa ✓, předložený návrh ✓, projednávání (aktuální), schválená změna a účinnost (zatím žádná), datum ověření, zdroje | hotovo, ověřeno |
| Zdroje u údajů | Úvodní čísla mají odkaz na zdroj nebo kapitolu; zdroje u legislativy, zátěže a každé země v porovnání | hotovo |
| Mobil a přístupnost | Kontrola šířek 320, 360, 375, 390, 414, 430, 768, 1440; dotykové cíle, písmo polí 16 px, viditelný fokus, ARIA tabulka porovnání | hotovo v Chromiu |

## Personalizovaný náhled pro sociální sítě (navrženo, neimplementováno)

Dnes má každý odkaz stejný náhled `og.png`. Sociální sítě čtou OG metadata ze serveru, ne z JavaScriptu, takže personalizovaný náhled se v čistě statickém webu udělat nedá. Návrh:

1. Serverová funkce na Vercelu (`/api/og`, Edge runtime) s knihovnou `@vercel/og`, která z parametrů odkazu (bez příjmů) vykreslí PNG 1200×630.
2. Serverové vykreslení `<meta property="og:image">` pro URL s parametry (middleware nebo serverová stránka), protože statický `index.html` metadata podle query měnit neumí.
3. Validace parametrů sdíleným kódem `lab/share.js`; cache podle parametrů.

Vyžaduje to novou závislost a serverovou část, proto jsem to bez rozhodnutí neimplementoval. Karta výsledku pro ruční sdílení (stažení nebo Web Share se souborem) funguje už teď.

## Testy a build

| Sada | Výsledek |
|---|---|
| `tsc --checkJs` (params, engine, share) | 0 chyb |
| `npm test` | 68/68 (13 nových: sdílení, validace URL, konzistence režimů, čísla v HTML, zátěž) |
| `npm run audit` | přepočet výnosu 0,00 %, reference 63/63 |
| `npm run e2e` (Chromium 1.63) | 92/92 (18 nových) |
| `tests/regression-data.js` | 0 neočekávaných změn dat; vědomé: Slovinsko (2 položky), Česko (text odkazu na kapitolu) |
| axe WCAG 2.2 AA | desktop 0 (světlý i tmavý); mobil jen body roků na časové ose (výjimka 2.5.8, ekvivalent posuvníkem) |
| Výkon (Chromium, lab) | desktop LCP 304 ms, CLS 0; mobil 4× CPU LCP 412 ms, CLS 0; změna příjmu 53 / 161 ms |
| Build | statický web bez buildu; preview sestavuje Vercel z větve |
| Velikost | `index.html` 102 kB gzip (dříve asi 94 kB), nový `lab/share.js` 8 kB nekomprimovaně |

## Datové výsledky

- Výpočty kalkulačky a simulátoru se nezměnily (reference 63/63, unit testy jádra beze změny).
- Data 45 zemí beze změny kromě zdokumentovaných textů.
- Nová data: medián příjmu pro 13 zemí (Eurostat ilc_di03, EU-SILC 2024, aktualizace 20. 10. 2026).

## Známá omezení

- Safari na iPhonu netestováno; vše v Chromiu (emulace mobilu).
- Ukazatel zátěže je orientační: medián na osobu vs. poplatek za domácnost, rok 2024 vs. 2026.
- Výsledek odvodu C ve sdílené kartě může i bez uvedených příjmů nepřímo napovědět jejich výši; panel sdílení na to upozorňuje volbou příjmů, karta se vytváří jen na výslovné kliknutí.
- Personalizované OG náhledy nejsou (viz návrh výše).
- Zdroje u jednotlivých údajů v evropských kapitolách 04, 06, 08 a 09 zůstaly v dosavadní podobě (zdroj u země, karty a centrální seznam).
