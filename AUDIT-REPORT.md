# Audit POPLATKY 2.0: souhrn

Větev `audit` (vychází z `main` 0551291). Produkce nezměněna. Podrobnosti v [FISCAL-MODEL-AUDIT.md](FISCAL-MODEL-AUDIT.md) a [QA-RESULTS.md](QA-RESULTS.md).

## P0

**1. Úvodní statistiky.** V HTML byly nuly a čísla doplňoval až skript; textový crawler je proto četl jako 0. Teď jsou skutečné hodnoty přímo v HTML (103, €363, 17, 546). Bez animace, takže `prefers-reduced-motion` není co vypínat; serverový rendering ani hydratace tu nejsou (statický web). Ověřeno testem i se stránkou bez JavaScriptu.

**2. Fiskální simulátor.** Nezávislý přepočet (Python, jiný postup) se shoduje na 0,00 %. Našel jsem osm chyb a všechny jsou opravené:

- OSVČ v kalkulačce,
- neplatné parametry,
- správa a rezerva nad 100 %,
- zmrazené důchody v projekci,
- zavádějící slovo „interval“,
- výkon kalibrace,
- dvě právní chyby (bod 3).

Přidaných 17 testů pokrývá povinné hraniční případy a invarianty, celkem 47 testů.

Hlavní metodické zjištění: strukturní nejistota z tvaru rozdělení mezd je −6 až +4 %. Rozpětí scénářů není interval spolehlivosti a aplikace to teď říká. Souběhy příjmů celostátní model nesčítá (podhodnocený výnos) a OSVČ nemají data. Obojí je uvedeno jako omezení, nedopočítával jsem vymyšlená čísla.

**3. Právní správnost kalkulačky.** Ověřeno proti textu § 4 zák. č. 348/2005 Sb. (znění od 1. 5. 2025, PDF ČT) a stránkám ČT a ČRo o osvobození:

- **Zdravotní důvod:** úplná nebo praktická slepota obou očí, nebo oboustranná úplná či praktická hluchota, a to jen pokud dotyčný žije sám nebo jen s osobami se stejným důvodem (nezaopatřené děti se nepočítají). Průkaz ZTP/P je jen doklad. Dřív kalkulačka osvobodila celou domácnost po zaškrtnutí „ZTP/P“; teď se podmínka zadává u každého dospělého a smíšená domácnost platí.
- **Příjmový důvod:** čistý příjem za uplynulé kalendářní čtvrtletí pod 2,15násobkem životního minima (od 1. 10. 2026: 5 500 / 5 000 / 3 750 Kč), na žádost, nejdéle 6 měsíců. Z hrubého příjmu kalkulačka nárok nerozhoduje a ukazuje stav „pravděpodobně“ nebo „na hranici, nelze určit“.

Kalkulačka výslovně uvádí, že nárok nepřiznává.

**4. Aktualita.** Tisk 231: 1. čtení 24. 10. 2026, přikázán Výboru pro média a kulturu, novější zprávy nejsou; částky 5 741 826 000 a 2 065 766 000 Kč beze změny. Aplikace rozlišuje:

- zákon a návrh (štítky),
- skutečný výběr (2024) a plán výběru (2026),
- plán výběru poplatků a celkový rozpočet ČT (8,536 mld.),
- náklady státu a individuální daň (přepočet na obyvatele je označen jako ilustrace).

Opravil jsem dřívější tvrzení, že tisk 231 obsahuje kontrolu NKÚ: řeší ji samostatné předlohy (tisk 47, tisk 217), dosud nepřijaté.

## P1

- **Dvě úrovně:**
  - Úroveň 1 „Co by změna znamenala pro mě?“: tři scénáře, kalkulačka, grafy A a B.
  - Úroveň 2 „…pro celé Česko?“: rozcestník na simulátor, zdroje financování, projekci, pojistky, inspirace a metodiku. Decily a citlivost jsou ve sbalitelném bloku. Žádný nástroj neubyl.
- **Vstup z úvodu:** blok „Kolik byste platili při jiném systému?“ s tlačítkem „Spočítat rozdíl“ vede na `#kalkulacka`. Funguje i po obnovení stránky; regresní test při tom našel a ověřil opravu chyby s posouváním.
- **Srozumitelnost:**
  - Model B se už neukazuje jako velká nula. Karta scénáře uvádí 7,81 mld. Kč z veřejných rozpočtů, výsledek „přímá platba 0 Kč / nepřímo nelze určit“ s vysvětlením, proč nejde o nejlevnější variantu.
  - Rozdíl je všude „rozdíl přímých plateb“.
  - Metodika uvádí, že osobní dopad obecného zdanění nelze spolehlivě určit.
- **Grafy:**
  - Osy mají názvy a jednotky.
  - Z grafu A zmizela čára „0 Kč“ pro rozpočet.
  - Graf B srovnává domácnost s domácností a říká to.
  - Rozpětí scénářů je odlišené od faktů a projekce je označená.
  - Hodnoty jsou dostupné bez hoveru i v tabulkách dat.
- **Přístupnost:** axe 0 porušení. Opraveny i dvě starší chyby v evropské části (kontrast, role seznamu), obsah evropské části se nezměnil.
- **Mobil:** bezpečné okraje (`safe-area`), `scroll-margin` pod přilepenou navigací, číselná klávesnice u částek.

## Zbývající rizika

1. **Produkce se neaktualizuje z gitu.** `main` 0551291 není na poplatky.vercel.app. Je potřeba zkontrolovat Vercel (propojení s GitHubem, build log). Bez toho se ani tato větev po sloučení nenasadí.
2. **Safari na iPhonu netestováno.** WebKit v prostředí není, mobil je emulace v Chromiu. Ověřit na zařízení.
3. **Model není fiskální odhad.** Hodí se pro řády a citlivost. Pro rozpočtové plánování chybí mikrodata o daňových základech, soubězích a OSVČ.
4. **Text tisku 231** (valorizační index, případné změny volby rad) je převzatý z Médiáře a RIA, ne přímo z psp.cz.
5. **Evropská data** se v tomto kole znovu neověřovala.
6. **Commity jsou neověřené** (bez podpisu). GitHub je označí „Unverified“.
