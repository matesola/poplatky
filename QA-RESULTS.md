# Výsledky QA

Datum: 26. 10. 2026. Větev `audit`. Prostředí: cloudový Linux kontejner, Node 22.23.4, Python 3.13.17, TypeScript 5.9.3, Playwright 1.63.0 s Chromiem (headless).

U každého testu je uvedeno, co skutečně proběhlo. Kde test neproběhl, je to napsáno výslovně.

## 1. Automatizované testy (proběhly)

| Sada | Příkaz | Výsledek |
|---|---|---|
| Typová kontrola jádra a parametrů | `npm run typecheck` (`tsc --checkJs`) | bez chyb |
| Jednotkové testy jádra | `npm test` (`node --test`) | **47/47** |
| Nezávislý přepočet výnosu | `npm run audit` (Python) | 5/5 případů, rozdíl 0,00 %, přepis dat bez chyb |
| Regresní testy stránky | `npm run e2e` (Playwright, statický server se soubory pro Vercel, respektuje `.vercelignore`) | **35/35** (desktop 1366×900, mobil 390×844 s dotykem, stránka bez JavaScriptu) |

Jednotkové testy pokrývají všechny povinné případy ze zadání:

- nulový příjem; příjem těsně pod hranicí, přesně na ní a těsně nad ní;
- strop a extrémní příjem; dva dospělí s různými příjmy; souběh mzdy a důchodu;
- nulová sazba; správní náklady 0 % i extrémní; nedosažitelný cíl;
- konzistence součtů; chybějící a neplatné parametry.

Pokrývají i všechny invarianty:

- výnos není záporný; odvod osoby nepřekročí strop; osvobozený neplatí;
- výnos je monotónní v sazbě i stropu; součet skupin se rovná celku; výsledky jsou deterministické.

Navíc testují právní pravidla: limit 11 825 Kč (od 1. 10. 2026) a 10 449 Kč (do 30. 9.), ostrou nerovnost limitu, slepotu nebo hluchotu u všech dospělých oproti smíšené domácnosti, a podmíněné stavy.

Regresní testy stránky (výstup v `tests/e2e-results.json`):

1. Evropská část: mapa (45 zemí a 5 mikrostátů), žebříček, 45 karet, vyhledávání, detail země a odkaz `#zeme-CZ`.
2. Úvodní čísla 103 / €363 / 17 / 546 jsou přímo v HTML a čitelná i bez JavaScriptu.
3. Přímý odkaz `#kalkulacka` po načtení končí na kalkulačce. **Tento test našel chybu, opravenou:** plynulé posouvání nedoběhlo a stránka skončila o 750 až 1 400 px vedle.
4. Determinismus: dvě načtení dají shodné výstupy.
5. Výstupy kalkulačky a graf A odpovídají hodnotám jádra.
6. Změna příjmu přepočítá výsledek.
7. Výjimky: slepota u všech dospělých oproti smíšené domácnosti; „pravděpodobně“, „na hranici“ a „platíte“.
8. Neplatné vstupy (−5000, 1e12, prázdné, 999999999) nevedou k NaN ani pádu.
9. Nulová sazba a nulový strop dávají nulový výnos.
10. Neplatné parametry vrací `valid: false`.
11. Kalibrace funguje.
12. Grafy C a D mají data.
13. Odkazy jsou platné absolutní https adresy.
14. V konzoli nejsou chyby.

## 2. Přístupnost (proběhla, automaticky)

axe-core 4 (WCAG 2 A a AA) nad celou stránkou ve světlém i tmavém režimu: **0 porušení**. Nejdřív se našly 4 typy porušení:

- kontrast bílého textu na oranžové v nové kapitole,
- vnořené interaktivní prvky v grafech (nová kapitola),
- nedostatečný kontrast vypnutého panelu „moje domácnost“ (evropská část, kapitola 02),
- chybná role v seznamu žebříčku (evropská část, kapitola 02).

Všechny jsou opravené.

Ručně v kódu (nejde o test s čtečkou):

- formulářové prvky mají `label` nebo `aria-label`;
- grafy jsou SVG s `role="img"` a popisem a mají rozbalovací tabulku dat;
- výsledky nejsou závislé na hoveru: hodnoty pod grafy ukazuje posuvník příjmu;
- `prefers-reduced-motion` vypíná animace pruhů, přeskupování a automatické přehrání osy;
- úvodní čísla se neanimují.

**Neproběhlo:** test se skutečnou čtečkou obrazovky (VoiceOver, NVDA).

## 3. Výkon (proběhl, Chromium, lokální server, Google Fonts zablokované, protože v kontejneru nejsou dostupné)

| Měření | Desktop | Mobil, 4× zpomalené CPU |
|---|---|---|
| Načtení (load) | 357 ms | 1 225 ms |
| LCP | 180 ms | 360 ms |
| CLS | 0 | 0 |
| Změna příjmu (zpracování a vykreslení) | 13 ms | 61 ms |
| Posuvník sazby (okamžitá část) | 11 ms | 50 ms |
| Simulace, 3 scénáře | 4 ms | 16 ms |
| Citlivost (18 simulací) | 12 ms | 46 ms |
| Kalibrace (klik) | 52 ms (dříve 204) | 183 ms (dříve 976) |

INP v terénu měřený nebyl. Uvedené časy jsou doba zpracování interakce v laboratoři. Velikosti (gzip):

| Soubor | Velikost |
|---|---|
| `index.html` | 94 kB |
| `lab/engine.js` | 9 kB |
| `lab/params.js` | 8 kB |
| `lab/ui.js` | 15 kB |
| `lab/lab.css` | 4 kB |

## 4. Vizuální kontrola (proběhla, snímky z Chromia)

Desktop 1366 px a mobil 390 px, světlý i tmavý režim:

- vstup z úvodu, úroveň 1 a 2, kalkulačka, grafy A a B, simulátor;
- graf C, graf D, nezávislost, inspirace.

Přetékání tabulek: tabulky pojistek, inspirací a grafu C se na mobilu skládají do sloupce, vodorovné posouvání stránky nevzniká. Posuvník příjmu je na mobilu přilepený pod navigací a respektuje `safe-area-inset-top`.

## 5. Co neproběhlo

- **Safari na iPhonu ani WebKit:** v prostředí není nainstalovaný (je jen Chromium a další prohlížeče instalovat nesmím). Mobilní testy jsou emulace v Chromiu (viewport 390 px, dotyk, DPR 2). Zbývá ověřit na skutečném iPhonu: numerickou klávesnici u částek, přilepený posuvník při skrývání lišty Safari, bezpečné okraje s výřezem a plynulost.
- **Produkční nasazení:** nespouštěl jsem ho. Navíc `main` na GitHubu (0551291) se dodnes na poplatky.vercel.app neprojevil: Vercel z gitu nenasazuje nebo build padá. Stav nasazení přes API nevidím (403).
- **Dostupnost externích zdrojů:** odkazy jsem ověřil formálně (https, doména). Obsah stránek jsem stáhl jen u českých zdrojů použitých ve výpočtech. Zakonyprolidi.cz a EUR-Lex z prostředí otevřít nešly.
- **Evropská data:** v tomto kole jsem je znovu neověřoval. Ověřoval jsem jen český právní stav a čísla pro výpočty.
