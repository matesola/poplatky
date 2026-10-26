# Kdo platí? 2.0: audit před implementací

Stav: 26. 10. 2026, produkce = `main` 865685d. Větev `ux-2`.

## Struktura a technologie

- Jediná statická stránka `index.html` bez buildu: data zemí (`COUNTRIES`, 45 položek), časová osa (`TIMELINE`), předpočítaná SVG mapa (`MAP`), styly a hlavní skript evropské části.
- Česká kapitola (`lab/`): `params.js` (jediný zdroj čísel a zdrojů), `engine.js` (výpočetní jádro, čisté funkce, JSDoc + `tsc`), `ui.js` (formuláře, SVG grafy), `lab.css`.
- Navigace: 9 kotev (`#mapa`, `#zebricek`, `#cesko`, `#simulace`, `#osa`, `#hlasy`, `#kontext`, `#zeme`, `#zdroje`), plus vnitřní kotvy (`#kalkulacka`, `#simulator`, `#metodika` …) a `#zeme-XX` pro detail země.
- Testy: 55 jednotkových (`node --test`), nezávislá reference v Pythonu (63 kontrol), 74 E2E (Playwright, Chromium), regrese dat proti `4718d17`.
- Omezení: žádný server, žádné serverové funkce, žádná analytika. Dynamické OG obrázky by vyžadovaly serverovou funkci.

## Stav jednotlivých požadavků

| Požadavek | Stav | Poznámka |
|---|---|---|
| Hero: název, podnadpis, popis | hotové | počet 45 je v HTML staticky, nikde se neověřuje proti datům |
| Blok „Aktuální Česko“ pod hero | částečně | existuje banner o 1. čtení; chybí roční poplatek, datum ověření a odkaz na přehled |
| Dvě hlavní vstupní cesty | částečně | čtyři rovnocenné odkazy a samostatná karta kalkulačky; chybí jasné rozdělení „já“ × „Evropa“ |
| Pořadí kapitol | chybí | dnes: mapa, částky, Česko, kalkulačka + simulátor + nezávislost + metodika (jedna kapitola), osa, referenda, na obyvatele, země, zdroje |
| Kalkulačka: základní režim | částečně | vstupy jsou úsporné (dospělí, příjem, osvobození), ale na mobilu je výsledek až pod celým formulářem |
| Kalkulačka: pokročilý režim | hotové | děti, čistý příjem, bez přijímače, právní stav; parametry odvodu v simulátoru se do kalkulačky propisují |
| Jeden engine, testy konzistence | částečně | jeden engine ano; test základ × podrobné zadání chybí |
| Evropa: pohled „jak se financuje“ | hotové | mapa, legenda, 6 modelů |
| Evropa: pohled „kolik to stojí“ | hotové | mapa v €/rok, žebříček |
| Evropa: pohled „zátěž“ | chybí | dataset nemá referenční příjem |
| Rozpočtové země bez „ceny 0“ | částečně | žebříček je odlišuje; detail země ukazuje „Domácnost platí 0 €“ a pruh „neplatí nic“ |
| Porovnání 2 až 4 zemí | chybí | jen srovnání jedné země s Českem v detailu |
| Důvěryhodnost u země | částečně | model, zdroj a datum stavu jsou v detailu; chybí referenční rok, měnový přepočet a omezení (jsou jen v centrálním seznamu) |
| 45 × 46 zemí | částečně | „45 zemí, jeden řez“ bez pravidel zahrnutí |
| Sdílení výsledků | chybí | jen kotvy a statická OG metadata |
| Legislativní přehled ve 4 stavech | částečně | podrobná chronologie tisku 231 existuje, souhrnná vrstva chybí |
| Fakta vs. simulace | hotové | štítky v kapitole 04; evropská část je převážně fakt |
| Zdroj přímo u údaje | částečně | u zemí a v kapitole 04 ano; úvodní čísla zdroj nemají |
| Datum ověření | hotové | `params.meta`, staticky v HTML |
| Mobil, přístupnost | částečně | opraveno v předchozím kole (320 až 430 px); chybí kontrola 768 a 1440, focus stavy a délka URL |
