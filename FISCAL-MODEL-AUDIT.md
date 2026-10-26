# Audit fiskálního modelu účelového odvodu

Stav: 26. 10. 2026, verze parametrů `2026-10-26.3`, release candidate „Kdo platí?“ (větev `release`). Celostátní výsledky jsou orientační (viz § 7 a § 8). Týká se kapitoly 04, části „Vybere odvod dost peněz?“.

**Shrnutí.** Model je deterministická aproximace postavená na zveřejněných kvantilech mezd. Nezávislý přepočet v Pythonu se s aplikací shoduje na 0,00 %, takže aritmetika je správná. Hlavní nejistota je metodická: tvar rozdělení mezi zveřejněnými kvantily, souběhy příjmů a chybějící data o OSVČ. Strukturní nejistota jen z tvaru rozdělení mezd je zhruba −6 až +4 %. Výsledky proto nejsou přesný fiskální výpočet a aplikace je tak ani neprezentuje.

## 1. Datové zdroje

| Údaj | Hodnota | Zdroj | Typ |
|---|---|---|---|
| Zaměstnanci, mzdová sféra | 3 010 200 (přepočteno na placené měsíce) | ISPV 2025, MZS-M0, výsledky k 25. 3. 2026 | fakt |
| kvantily hrubé měsíční mzdy | P10 24 919, P25 32 538, P50 43 241, P75 58 801, P90 85 087; průměr 52 239 Kč | tamtéž | fakt |
| Zaměstnanci, platová sféra | 683 868; P10 32 099, P50 48 064, P90 74 104; průměr 52 037 Kč | ISPV 2025 (Kurzy.cz, 10. 5. 2026) | fakt |
| Růst průměrné mzdy 2025 → 2026 | 6,4 % | ČSÚ, Průměrné mzdy, 2. čtvrtletí 2026 | fakt (použit jako předpoklad pro celý rok) |
| Starobní důchodci | 2 333 762; průměr 21 803 Kč | ČSSZ, ukazatele 6/2026 | fakt |
| Invalidní důchodci | 420 880; průměr 14 500 Kč | počet ČSSZ; průměr je vážený odhad | počet fakt, průměr předpoklad |
| OSVČ povinné platit zálohy | 739 472 | ČSSZ 6/2026 | fakt |
| Zisky OSVČ podle výše | nejsou veřejně k dispozici | (mezera) | ve výchozím stavu vypnuto |
| Cíl: tisk 231 | 5 741 826 000 + 2 065 766 000 Kč | text návrhu a RIA (Médiář, 24. 10. 2026) | návrh |
| Cíl: plán výběru 2026 | ČT 6,73 + ČRo 2,476 mld. Kč | rozpočty ČT a ČRo 2026 | fakt (plán, ne skutečnost) |

Přepis dat do aplikace kontroluje `audit/recompute.py`: proti ručně přepsaným zdrojovým hodnotám nenašel žádný rozdíl.

## 2. Rovnice

Odvod osoby *i* s ročním základem *y_i* (hranice *T*, sazba *r*, strop *c*):

```
L(y) = 0                         pro y ≤ T
L(y) = min(c, r · (y − T))       finský typ (výchozí, bez skoku na hranici)
L(y) = min(c, r · y)             varianta „z celého příjmu nad hranicí“ (se skokem na hranici)
```

Základ *y* je roční hrubý příjem. U zaměstnance je to hrubá mzda, která je od roku 2021 dílčím základem daně podle § 6 ZDP. U OSVČ je to zisk (§ 7). U důchodce důchod, pokud jsou důchody v okruhu. Důchody jsou dnes většinou osvobozené od daně, takže jejich zahrnutí je designové rozhodnutí, ne převzatý daňový základ.

Celostátní hrubý výnos ve scénáři *s*:

```
V_s = κ_s · Σ_g  N_g · f_s · ∫₀¹ L( 12 · γ_s · Q_g,s(p) ) dp
```

- *N_g*: počet osob ve skupině *g*
- *f_s*: násobek počtu (0,95 / 1 / 1,05)
- *γ_s*: přepočet 2025 → 2026 (1,064 ± 0,01)
- *Q_g,s*: kvantilová funkce měsíční mzdy
- *κ_s*: úspěšnost výběru (0,97 / 0,99 / 1,00)

Integrál se počítá 2 000 středovými body. Důchody jsou lognormální s daným průměrem a variačním koeficientem (0,20 a 0,25) a nerostou s mzdami.

Kvantilová funkce mezd:

- **mezi zveřejněnými kvantily:** log-lineární interpolace;
- **pod P10:** lineárně od `lowTail × P10` (0,25 / 0,40 / 0,55);
- **nad P90:** Paretův chvost `Q(p) = P90 · (0,1 / (1 − p))^(1/α)`. Exponent α se dopočte tak, aby průměr celého rozdělení odpovídal zveřejněnému průměru: mzdová sféra α = 2,71, platová α = 3,96. Kontrolou je rekonstruovaný průměr 52 239,0 a 52 037,0 Kč.

Čistý výnos:

```
Čistý = V · (1 − a − R)
```

kde *a* jsou správní náklady a *R* rezerva. Aplikace vyžaduje *a, R ≥ 0* a *a + R < 1*, každé nejvýš 50 %. Bilance `hrubý = čistý + správa + rezerva` se kontroluje v každém běhu i v testech.

Kalibrace hledá bisekcí (32 kroků) nejmenší sazbu do 3 % nebo nejmenší strop do 15 000 Kč, při kterých čistý výnos dosáhne cíle. Funguje díky monotonii: vyšší sazba ani vyšší strop výnos nesnižují, což ověřují testy.

## 3. Definice zahrnuté populace

Do odvodu vstupují:

- zaměstnanci mzdové a platové sféry (3,69 mil. přepočtených osob),
- volitelně starobní a invalidní důchodci (2,75 mil.),
- volitelně OSVČ v hlavní činnosti (0,74 mil., jen s neověřeným předpokladem rozdělení zisku).

Nezahrnuto:

- dohody (DPP, DPČ) mimo ISPV,
- příjmy z kapitálu a nájmu,
- neaktivní osoby s jinými zdanitelnými příjmy,
- vedlejší OSVČ.

Riziko dvojího započtení: pracující důchodce je ve skupině zaměstnanců i důchodců a každá jeho část příjmu má vlastní hranici. Simulace proto výnos u souběhů podhodnocuje a „počet příjemců“ i podíl osvobozených nadhodnocuje. Počet pracujících důchodců v použitých zdrojích není, korekce by tedy byla vymyšlená. Aplikace u počtu výslovně uvádí, že se souběh počítá dvakrát. Kalkulačka domácnosti souběh sčítá správně (typ „Pracující důchodce“).

## 4. Výsledky nezávislého přepočtu

`audit/recompute.py` používá jiný postup:

- 400 000 bodů místo 2 000,
- uzavřený vzorec `E[min(c, r(Y−T)⁺)] = r ∫_T^{T+c/r} S(y) dy` pro lognormální rozdělení,
- data přepsaná ze zdrojů, ne čtená z aplikace.

Hrubý výnos ve středním scénáři, v mld. Kč:

| Případ | Aplikace | Nezávislý přepočet | Rozdíl | Lognormála z mediánu a průměru | Lognormála z P10 a P90 |
|---|---|---|---|---|---|
| výchozí (1,1 %, 300 000 Kč, strop 3 000 Kč, s důchody) | 8,099 | 8,099 | 0,00 % | 7,643 | 8,428 |
| bez důchodů | 7,894 | 7,894 | 0,00 % | 7,438 | 8,223 |
| strop 5 000 Kč | 10,787 | 10,787 | 0,00 % | 10,517 | 11,416 |
| hranice 150 000 Kč | 12,904 | 12,904 | 0,00 % | 12,475 | 13,118 |
| finské parametry v Kč (2,5 %, 368 000, 3 890) | 10,156 | 10,156 | 0,00 % | 9,517 | 10,589 |

Výchozí parametry podle scénářů:

| Scénář | Hrubý výnos | Čistý výnos (správa 1 %, rezerva 2 %) |
|---|---|---|
| pesimistický | 7,48 mld. | 7,25 mld. |
| střední | 8,10 mld. | 7,86 mld. |
| optimistický | 8,66 mld. | 8,40 mld. |

Další údaje ze středního scénáře:

- **Skladba výnosu:** mzdová sféra 6,26, platová 1,63, starobní důchody 0,20, invalidní 0,001 mld.
- **Kdo neplatí a kdo je na stropu:** osvobozeno 39,7 % příjemců, plný strop platí 28,0 %.
- **Kalibrace na tisk 231 (7,81 mld. čistého):** sazba 1,08 % ve středním scénáři, 1,40 % v pesimistickém. Na plán 2026 (9,21 mld.) sazba 1,1 % nestačí v žádném scénáři.
- **Rozložení zátěže:**

| Decil | D1 až D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|
| podíl odvodu na příjmu | 0 | 0,10 % | 0,29 % | 0,44 % | 0,49 % | 0,39 % | 0,22 % |

Kvůli stropu je odvod v horních decilech regresivní. Model to ukazuje a nezakrývá.

## 5. Identifikované chyby (verze 0551291)

| # | Chyba | Dopad |
|---|---|---|
| 1 | OSVČ v kalkulačce domácnosti dostali odvod 0 Kč, pokud byl v simulátoru vypnutý přepínač OSVČ (ten se týká jen chybějících celostátních dat) | nesprávný osobní výsledek |
| 2 | Zdravotní osvobození: zaškrtávátko „ZTP/P“ osvobodilo celou domácnost. Zákon vyžaduje slepotu nebo hluchotu stanoveného rozsahu a soužití jen s osobami se stejným důvodem | nesprávné tvrzení o zákonné povinnosti |
| 3 | Příjmové osvobození bylo z odhadu čistého příjmu prezentováno jako jisté | falešná přesnost |
| 4 | Neplatné parametry (NaN, záporné, text) se tiše propsaly do výsledků | riziko zobrazení nesmyslu |
| 5 | Správní náklady a rezerva přes 100 % mohly dát záporný čistý výnos | porušení invariantu |
| 6 | V projekci byly důchody zmrazené na úrovni roku 2026 | podhodnocený růst výnosu s důchody |
| 7 | Rozpětí scénářů se jmenovalo „interval“, bez upozornění, že nejde o interval spolehlivosti | zavádějící interpretace |
| 8 | Kalibrace stavěla populaci znovu v každém kroku: 976 ms na mobilu se 4× zpomaleným CPU | špatná odezva |

## 6. Provedené opravy

| # | Oprava |
|---|---|
| 1 | Okruh odvodu v kalkulačce řeší funkce `levyBase()`. OSVČ jsou vždy v okruhu, důchody podle volby. Nový typ „Pracující důchodce“ sčítá mzdu a důchod do jednoho základu |
| 2 | Podmínka slepoty nebo hluchoty je u každého dospělého zvlášť. Osvobození platí jen tehdy, když ji splňují všichni dospělí (děti se nepočítají). Text vysvětluje, že průkaz je jen doklad |
| 3 | Pět stavů výsledku: platí / pravděpodobně osvobozeni / na hranici, nelze určit / nárok na žádost / bez přijímače. Pásmo ±15 % kolem limitu se z odhadu nerozhoduje; s ručně zadaným čistým příjmem je výsledek přesný, ale stále na žádost |
| 4 | Funkce `validateLevy()`: simulace i kalibrace s neplatnými vstupy vrací `valid: false` a UI místo čísel ukáže chybu |
| 5 | Validace vyžaduje *a + R < 1*, test hlídá nezáporný čistý výnos |
| 6 | Důchody v projekci rostou o inflaci a polovinu reálného růstu mezd |
| 7 | Všude „rozpětí scénářů“, ve verdiktu poznámka o strukturní nejistotě −6 až +4 % |
| 8 | Cache populace a 32 kroků bisekce: kalibrace trvá 183 ms (mobil 4×) a 52 ms (desktop) |

## 7. Přetrvávající metodická omezení

- **Interval nejistoty není statistický.** Tři scénáře mají předem dané kombinace předpokladů (počet ±5 %, růst mezd ±1 p. b., dolní chvost, výběr 97 až 100 %). Pravděpodobnostní interpretaci nemají.
- **Tvar rozdělení** mezi kvantily a nad P90 je modelový. Jiné rozumné tvary posouvají výnos o −6 až +4 %, víc než by naznačovala přesnost na desetiny miliardy.
- **ISPV počítá přepočtené osoby** (placené měsíce), ne fyzické osoby s celoročním příjmem. Pro odvod se stropem jde o nejcitlivější vstup: výnos je přibližně počet lidí nad hranicí krát průměrný odvod.
- **Souběhy příjmů** se v celostátní simulaci nesčítají (viz bod 3).
- **OSVČ:** bez dat o rozdělení zisků je jejich příspěvek čistý předpoklad, ve výchozím stavu vypnutý.
- **Růst mezd 2026** je převzatý z 2. čtvrtletí, ne za celý rok.
- **Správní náklady** (1 %) a **úspěšnost výběru** (97 až 100 %) jsou předpoklady. Pro srovnání: náklady výběru TV poplatku činí podle plánu ČT 2026 109,7 mil. Kč, asi 1,6 % výnosu.
- **Behaviorální reakce** (optimalizace příjmů, únik) model neobsahuje.

**Závěr:** model se hodí ke srovnání řádů a citlivosti parametrů, ne k rozpočtovému plánování. Pro skutečnou kalibraci by byla potřeba mikrodata MF nebo GFŘ o rozdělení daňových základů fyzických osob včetně souběhů.

## 8. Finální kolo: nezávislá referenční kontrola (26. 10. 2026)

Skript `audit/reference_cases.py` (`npm run reference`) neporovnává aplikaci samu se sebou. Každý případ má:

1. **ručně odvozenou hodnotu** zapsanou jako literál se vzorcem v komentáři,
2. **vlastní implementaci pravidel** v Pythonu nad `Decimal`, psanou podle textu metodiky a zákona; zákonné konstanty (150 + 55 Kč, 2,15 × ŽM, částky ŽM) jsou přepsané ze zdrojů, ne načtené z `params.js`,
3. **výstup aplikace** (`lab/engine.js` volaný přes Node jako černá skříňka).

Případ projde, jen když se všechny tři hodnoty shodují (tolerance 1e‑6 Kč). Výsledek: **43 případů a 20 celostátních kontrol, 0 rozdílů** (`audit/reference-results.json`).

| Povinný případ | Vstup | Ručně | Aplikace |
|---|---|---|---|
| Nulový příjem | 0 Kč | 0 | 0 |
| Přesně na hranici | 25 000 Kč/měs. = 300 000 Kč/rok | 0 | 0 |
| Těsně pod / nad | 24 999 / 25 001 Kč/měs. | 0 / 0,132 | 0 / 0,132 |
| Pod stropem | 40 000 Kč/měs.: 180 000 × 1,1 % | 1 980 | 1 980 |
| Roční strop | 1 000 000 Kč/rok: 7 700 → strop | 3 000 | 3 000 |
| Extrémní příjem | 1 mld. Kč/měs. | 3 000 | 3 000 |
| Více dospělých | 40 000 + 60 000 + bez příjmu | 4 980 | 4 980 |
| Nulová sazba, nulový strop | 80 000 Kč/měs. | 0 | 0 |
| Výjimka: důchody mimo okruh | důchod 30 000 Kč/měs. | 0 | 0 |
| Souběh mzdy a důchodu | 30 000 + 20 000, strop 10 000 | 3 300 | 3 300 |
| Souběh, důchod mimo okruh | 30 000 + 20 000 | 660 | 660 |
| Varianta z celého příjmu | 400 000 Kč/rok, strop 5 000 | 4 400 | 4 400 |
| Limit osvobození jednotlivce | 2,15 × 5 500 | 11 825 | 11 825 |
| Přesně na limitu | čistý 11 825 Kč | platí 205 | platí 205 |
| Limit do 30. 9. 2026 | 2,15 × 4 860 | 10 449 | 10 449 |
| Pár s dítětem 6 až 15 let | 2,15 × (5 000 + 3 750 + 3 050) | 25 370 | 25 370 |
| Slepota, žije sama | | osvobozena | osvobozena |
| Slepota, s vidící partnerkou | | platí | platí |
| Slepota, s dítětem | výklad ČT | pravděpodobně | pravděpodobně |
| Správní náklady 0 % | čistý = hrubý | ano | ano |
| Správa + rezerva ≥ 100 % | | odmítnuto | odmítnuto |
| Nedosažitelná kalibrace | cíl 50 mld., sazba nejvýš 3 % | neúspěch | neúspěch (max 9,68 mld.) |
| Dosažitelná kalibrace | cíl 7,81 mld. | dosaženo | sazba 1,081 %, 7,8100 mld. |

### Celostátní simulace: co je ověřené a co ne

| Kontrola | Výsledek | Ověřeno? |
|---|---|---|
| Populační váhy | součet vah = (3 010 200 + 683 868) × koeficient scénáře + 2 333 762 + 420 880 ve všech scénářích | aritmeticky ano |
| Součty skupin | součet skupin = celek na 1 Kč ve všech scénářích | ano |
| Bilance | hrubý = čistý + 1 % správa + 2 % rezerva | ano |
| Horní mez | výnos ≤ strop × počet osob | ano |
| Pořadí scénářů | 7,48 < 8,10 < 8,66 mld. | ano |
| **Dvojí započtení osob** | pracující důchodci jsou v ISPV i v ČSSZ. Výnos tím **není** nadsazen (každý díl příjmu má vlastní hranici, výnos je spíš podhodnocen), ale **počet osob 6,45 mil. je nadsazen** o neznámý počet pracujících důchodců | **neověřitelné** z použitých zdrojů |
| **OSVČ** | ve výchozím stavu vyloučeny; po zapnutí +0,82 mld. z neověřeného předpokladu (medián zisku 300 000 Kč, σ = 0,9) | **neověřeno**, v aplikaci označeno |
| **Mzda a základ daně** | ISPV měří hrubou mzdu; u zaměstnanců je od roku 2021 základem daně hrubá mzda, takže pojem sedí. Ale ISPV je v přepočtených osobách a ×12 nadhodnocuje příjem lidí, kteří nepracovali celý rok | **částečně**; nejcitlivější vstup modelu |
| **Důchody** | průměr starobního důchodu ČSSZ 6/2026 ověřen; průměr invalidních 14 500 Kč je vážený odhad; tvar (lognormála, cv 0,2 a 0,25) je předpoklad. Při hranici 300 000 Kč ročně (25 000 Kč měsíčně) přispívají důchody jen 0,2 mld., takže chyba tvaru má malý dopad. Scénáře důchody **nemění** (počet ani výši), takže rozpětí scénářů jejich nejistotu nezachycuje | částečně |
| **Konstrukce scénářů** | pesimistický a optimistický scénář kombinují všechny krajní předpoklady najednou (počet ±5 %, růst ±1 p. b., dolní chvost, výběr). Jde o rohy prostoru předpokladů, ne o pravděpodobnostní interval; tvar rozdělení posouvá výnos o dalších −6 až +4 % mimo toto rozpětí | konstrukce ověřena, interpretace v aplikaci opravena v kole 2.0 |

**Co zelené testy nedokazují.** Testy dokazují, že aplikace počítá přesně to, co metodika popisuje. Nedokazují, že vstupy odpovídají skutečnosti. Neověřené vstupy jsou:

- rozdělení příjmů nad P90 (Paretův chvost),
- celoroční příjem přepočtených osob ISPV,
- souběhy příjmů,
- OSVČ,
- tvar rozdělení důchodů.

Nepřidal jsem žádnou skupinu s vymyšleným počtem, aby výnos vyšel.

## Reprodukce

```
npm install && npm run check   # typová kontrola + 55 jednotkových testů
npm run audit                  # nezávislý přepočet výnosu + referenční případy (Python 3, numpy, scipy)
npm run reference              # jen referenční případy kalkulačky a celostátní kontroly
```
