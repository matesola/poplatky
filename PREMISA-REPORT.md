# Premisa a autorská identita: report

Větev `premisa` (z `main` f09f29e). Produkce nezměněna.

## Výchozí stav

| Požadavek | Před úpravou |
|---|---|
| Hero začíná českou otázkou | ne: perex začínal „Prozkoumejte 45 evropských zemí“ a pod úvodem byla čtyři čísla, z toho tři evropská |
| Dvě vstupní cesty | ano, popisy zdůrazňovaly mapu a částky |
| Vstup do celostátních důsledků | jen jako vedlejší odkaz |
| Evropská kapitola jako kontext | bez redakčního vymezení |
| Propojení Evropa → české scénáře | jen odkaz na srovnání veřejných výdajů (kapitola 06) |
| Přiznání inspirace | **chybělo úplně** |

## Provedené změny

1. **Hero:** nový popis v přesném znění zadání, bez počtu zemí. Štítky nad nadpisem: Česko, stav legislativy k 26. 10. 2026, Evropa jako kontext, zdroj u každého údaje. Čtyři úvodní čísla (103 let, €363, 17 zemí, 2 633 hlasů) jsou nově na začátku evropské kapitoly 03, ne v úvodu.
2. **Metadata:** description, Open Graph, Twitter a JSON-LD nesou nový popis; náhled `og.png` má štítky Česko, Kalkulačka domácnosti, Evropa jako kontext.
3. **Vstupy:** „Kolik bych platil já?“ a „Jak platí Evropa?“ s novými popisy; třetí, méně výrazný vstup „Co by změna znamenala pro Česko?“ vede na existující kapitolu 10 (`#cele-cesko`), žádná nová sekce nevznikla.
4. **Evropská kapitola:** redakční úvod v přesném znění zadání nad mapou. Mapa, data, žebříčky a detaily zemí beze změny.
5. **Propojení kapitol** (odkazy jen na existující obsah, bez tvrzení o příčinách):
   - kapitola 03, odstavec Daň: Finsko a Švédsko → model C v kalkulačce a celostátní model; rozpočtové financování → kapitola 07 Nezávislost a pojistky,
   - kapitola 04 Částky: paušální poplatek a podíl na příjmu → grafy A a B, decily, mapa v pohledu Zátěž,
   - kapitola 08 Časová osa: přechody mezi modely → Co si vzít z Evropy, stav legislativy,
   - detail země podle modelu: daň na osobu → kalkulačka a celostátní model; rozpočet → pojistky; poplatek → zatížení podle příjmu.
6. **O projektu** v kapitole Zdroje: premisa projektu a přiznání inspirace v navrženém znění s odkazem na poplatkyvevrope.cz. Bez tvrzení o spolupráci a bez tvrzení o původu dat.

## Audit shod s poplatkyvevrope.cz (26. 10. 2026)

Metoda: stažena úvodní stránka, O projektu, Ke stažení, Příběh, Pojistky, Ochrana údajů a všech 46 stránek zemí (52 stránek). Každá věta webu Kdo platí? (včetně dat zemí, textů kapitoly 04 a parametrů) porovnána s celým korpusem podle shodných úseků 7 slov.

**Výsledek: 12 vět se shodou, žádná delší než jedna věta.** Všechny jsou faktické údaje, názvy předpisů nebo standardní formulace:

| Kdo platí? | poplatkyvevrope.cz | Posouzení |
|---|---|---|
| „Senát může návrh schválit, zamítnout nebo vrátit s pozměňovacími návrhy.“ (chronologie tisku 231) | „Senát může návrh schválit, zamítnout, nebo vrátit s pozměňovacími návrhy.“ (úvodní stránka) | standardní popis ústavního postupu |
| „a financování ČT a ČRo ze státního rozpočtu (sněmovní tisk 231)“ | obdobně na stránce Česko | věcný popis návrhu |
| zákonná definice osvobození (slepota, hluchota, 2,15násobek životního minima) | Česko | citace zákona |
| „Čeká druhé a třetí čtení, Senát a podpis prezidenta.“ | obdobně na úvodní stránce | výčet zbývajících kroků |
| Litva: „1 % výnosu daně z příjmu fyzických osob a 1,3 % spotřebních daní“ | Litva: „podíl na výnosu daně z příjmu fyzických osob a spotřebních daní“ | fakt ze zákona |
| Lichtenštejnsko: zrušení zákona o LRF referendem | Lichtenštejnsko: zákon o LRF (LRFG) zrušen | fakt |
| Lucembursko: veřejnou službu plní RTL na základě smlouvy se státem | „lucemburské programy zajišťuje RTL na základě smlouvy se státem“ | fakt, podobná formulace jedné vedlejší věty |
| Finsko: strop daně a práh | Finsko | čísla ze zákona |
| Ukrajina: zákonné minimum 0,2 % výdajů | Ukrajina | fakt ze zákona |
| Švédsko, Finsko, Island: platí se za osobu | O projektu | metodická poznámka, obecná |
| názvy předpisů (zák. č. 348/2005 Sb., nařízení (EU) 2024/1083) | různé | názvy předpisů |

**Strukturní a koncepční podobnosti** (nejde o text, ale jsou nápadné a je fér je znát):

- shodný datový řez „stav k 24. 10. 2026“ a kurz ECB k 23. 10. 2026,
- mapa z Natural Earth 1:50m, Kosovo samostatně, Krym jako součást Ukrajiny (oba weby; u nich Lambertova, u nás kuželová projekce),
- písmo Archivo,
- název „Kdo platí?“ a jejich titulek „Kdo v Evropě platí za televizi a rozhlas“,
- blok „Česko teď“ s 2 460 Kč ročně a kroky legislativního procesu (u nás „Aktuální Česko“ a stav legislativy),
- pojem „pojistky nezávislosti“ (u nich samostatná stránka po zemích, u nás srovnání tří českých modelů),
- přepočet poplatku na příjem (u nich průměrná čistá mzda OECD, u nás medián ekvivalizovaného příjmu EU-SILC).

**Odlišnosti:** jiný počet zemí (jejich 46 = našich 45 a navíc Rusko; seznamy se jinak shodují), jiná klasifikace modelů (u nich domácnost 8, elektřina 5, účelová daň 4, rozpočet 26, kombinovaný 2, bez platby 1; u nás domácnost 6, přístroj 3, elektřina 6, daň 3, rozpočet 26, nákup 1), vlastní česká kalkulačka, fiskální model, projekce, pojistky tří modelů a legislativní analýza, které inspirační web nemá.

**Data a licence:** poplatkyvevrope.cz zveřejňuje data (CSV, JSON) pod licencí CC BY 4.0 s podmínkou uvést zdroj „poplatkyvevrope.cz“ s odkazem. Zda evropská data tohoto webu vycházejí z jejich datové sady, z repozitáře ověřit nejde: první verze stránky vznikla z HTML souboru, jehož původ v repozitáři zaznamenaný není. Pokud z ní vycházejí, je odkaz v O projektu dobrý základ, ale licence vyžaduje i výslovné uvedení zdroje dat (například v kapitole Zdroje: „Část evropských údajů vychází z poplatkyvevrope.cz, CC BY 4.0“). To jsem bez ověření nedoplnil, protože zadání zakazuje tvrzení o původu dat, která nejsou ověřená. **Rozhodnutí je na autorovi.**

Právní posouzení: neprovádím. Textové shody jsou na úrovni faktů a jednotlivých formulací; koncepční podobnosti jsou otázkou inspirace, ne převzetí textu.

## Testy

| Sada | Výsledek |
|---|---|
| `tsc --checkJs` | 0 chyb |
| `npm test` | 68/68 |
| `npm run e2e` (Chromium, desktop a mobil 320 až 1440 px) | 95/95 (3 nové: premisa v úvodu, přiznání inspirace, cíle odkazů Souvislost s Českem) |
| `tests/regression-data.js` | 0 změn dat |

## Neměněno

Název, design system, výpočetní jádro, datové sady, česká chronologie, celostátní simulace, typy grafů, URL a kotvy, rozlišení fakt / návrh / model / autorský návrh.
