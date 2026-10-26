// @ts-check
/* Poplatky · Jak by mohlo Česko platit
 * Centrální, verzované parametry a předpoklady.
 * Každý údaj má kategorii:
 *   fakt   = OVĚŘENÝ FAKT (zákon, oficiální statistika, dohledatelný zdroj)
 *   navrh  = LEGISLATIVNÍ NÁVRH (projednávaný text, nemusí být schválen)
 *   model  = MODELOVÝ VÝPOČET / PŘEDPOKLAD (odvozeno nebo zvoleno pro výpočet)
 *   autor  = AUTORSKÝ NÁVRH (k veřejné diskusi, není zákon ani vládní návrh)
 * Při změně legislativy se mění jen tento soubor (a případně pravidla v engine.js).
 */
(function (root) {
  "use strict";

  /** @typedef {"fakt"|"navrh"|"model"|"autor"} Cat */
  /** @typedef {{t:string, u:string}} Src */

  var SRC = {
    zakon348: { t: "Zákon č. 348/2005 Sb., o rozhlasových a televizních poplatcích (ve znění zák. č. 119/2025 Sb.)", u: "https://www.zakonyprolidi.cz/cs/2005-348" },
    novela119: { t: "Zákon č. 119/2025 Sb. (velká mediální novela)", u: "https://data.atlascloud.cz/LCR/Rejstrik/Sb/2025/sb119-2025/119_2025/119_2025.pdf" },
    mk: { t: "Ministerstvo kultury: Rozhlasové a televizní poplatky", u: "https://www.mk.gov.cz/488.html" },
    zakon348mk: { t: "Ministerstvo kultury: úplné znění zák. č. 348/2005 Sb. (změny do č. 152/2025 Sb.)", u: "https://www.mk.gov.cz/doc/cms_library/zakon-c-348_2005-sb-o-rozhlasovych-a-televiznich-poplatcich-1412.docx" },
    zakon348pdf: { t: "Zákon č. 348/2005 Sb., znění účinné od 1. 5. 2025 (PDF, Česká televize)", u: "https://www.ceskatelevize.cz/vse-o-ct/api/media/documents/Zakon_o_rozhlasovych_a_televiznich_poplatcich.pdf" },
    ctOsvobozeni: { t: "Česká televize: osvobození od platby", u: "https://poplatky.ceskatelevize.cz/osvobozeni-od-platby" },
    croOsvobozeni: { t: "Český rozhlas: osvobození (částky životního minima od 1. 10. 2026)", u: "https://poplatek.rozhlas.cz/osvobozeni-8752432" },
    zm: { t: "Kurzy.cz: životní minimum od 1. 10. 2026 (zák. č. 110/2006 Sb.)", u: "https://zpravy.kurzy.cz/872430-zivotni-minimum-se-od-rijna-2026-zmeni-ovlivni-superdavku-porodne-i-dalsi-davky-o-valorizaci-ale/" },
    osvobozeni: { t: "aRecenze: osvobození od poplatků 2026 (příjmový limit)", u: "https://www.arecenze.cz/clanky/poplatky-za-ct-a-rozhlas-2026-nizkoprijmove-domacnosti-je-platit-nemusi-od-rijna-dosahne-na-vyjimku-vic-lidi/" },
    tisk231: { t: "Médiář, 24. 10. 2026: text návrhu a RIA (sněmovní tisk 231)", u: "https://www.mediar.cz/hrozi-vyssi-zavislost-ct-a-rozhlasu-na-statu-pripousti-samotny-klempiruv-navrh/" },
    ctk231: { t: "ČTK / České noviny, 24. 10. 2026: první čtení tisku 231", u: "https://www.ceskenoviny.cz/zpravy/koalice-poslala-do-druheho-cteni-navrh-zrusit-poplatky-pro-ct-a-cro/2891827" },
    ctRozpocet: { t: "Rozpočet České televize na rok 2026", u: "https://www.ceskatelevize.cz/vse-o-ct/api/media/documents/Rozpocet_Ceske_televize_na_rok_2026.pdf" },
    croRozpocet: { t: "MediaGuru, 18. 12. 2025: rozpočet ČRo 2026", u: "https://www.mediaguru.cz/clanky/2025/12/cro-zvysi-v-roce-2026-vynosy-z-poplatku-ale-z-reklamy-poklesnou/" },
    ispvMzs: { t: "ISPV 2025, mzdová sféra (MPSV), výsledky k 25. 3. 2026", u: "https://www.ispv.cz/archiv/CR_254_MZS.pdf" },
    ispvPls: { t: "ISPV 2025, platová sféra (MPSV) přes Kurzy.cz", u: "https://zpravy.kurzy.cz/858618-prumerny-hruby-mesicni-plat-dosahl-urovne-52-037-kc-a-zvysil-se-tak-o-6-1--platy-v-roce-2025/" },
    csuMzdy: { t: "ČSÚ: Průměrné mzdy, 2. čtvrtletí 2026", u: "https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2026" },
    cssz: { t: "ČSSZ: Základní ukazatele důchodového pojištění, 6/2026", u: "https://www.ipzs.gov.cz/documents/20143/3286322/2%20Ukazatele%20%C4%8Derven%202026.pdf/db17b358-76cf-5c69-b947-a6340d87e0ae" },
    csuObyv: { t: "ČSÚ: Pohyb obyvatelstva, 1. pololetí 2026", u: "https://csu.gov.cz/rychle-informace/pohyb-obyvatelstva-1-pololeti-2026" },
    sldb: { t: "ČSÚ: hospodařící domácnosti, SLDB 2021", u: "https://csu.gov.cz/produkty/dve-petiny-hospodaricich-domacnosti-v-cesku-predstavuji-jednotlivci" },
    cnb: { t: "ČNB: Prognóza léto 2026 (6. 8. 2026)", u: "https://www.cnb.cz/cs/menova-politika/prognoza/index.html" },
    minMzda: { t: "E15: minimální mzda 2026", u: "https://www.e15.cz/minimalni-mzda-2026" },
    emfa: { t: "Nařízení (EU) 2024/1083, Evropský akt o svobodě médií, čl. 5", u: "https://eur-lex.europa.eu/legal-content/CS/TXT/?uri=CELEX:32024R1083" },
    nku: { t: "NKÚ: příprava kontrol ČT a ČRo (informace dle zák. 106/1999 Sb.)", u: "https://www.nku.cz/cz/otevreny-urad/poskytovani-informaci/poskytnute-informace-dle-zak-106/priprava-kontrol-ct-a-cro-id15527/" },
    lupaNku: { t: "Lupa.cz, 8. 6. 2026: ústavní novela (tisk 47) a prováděcí zákon (tisk 217)", u: "https://www.lupa.cz/aktuality/kvuli-kontrole-ct-a-cro-vznikl-dalsi-zakon-poslanci-ho-chteji-schvalit-zrychlene/" },
    zakonCT: { t: "Zákon č. 483/1991 Sb., o České televizi", u: "https://www.zakonyprolidi.cz/cs/1991-483" },
    yle: { t: "Přehled daňových změn ve Finsku 2025 (Yle daň)", u: "https://finrepo.fi/en/news-important-tax-changes-finland-2025" },
    skv: { t: "Skatteverket: public service-avgift 2026", u: "https://www.skatteverket.se/4.676f4884175c97df4193041.html" }
  };

  var P = {
    meta: {
      version: "2026-10-26.3",
      /* Tři různá data, jediný zdroj. Statické texty v index.html (atribut data-cfg)
         se s nimi kontrolují testem a lze je přepsat příkazem `npm run sync`. */
      legalDate: "2026-10-26",            // ke kterému dni je legislativa ověřena
      legalDateLabel: "26. 10. 2026",
      effectiveLabel: "1. 5. 2025",       // účinnost znění § 4 a § 6 zák. č. 348/2005 Sb. (novela č. 119/2025 Sb.)
      zmEffectiveLabel: "1. 10. 2026",    // účinnost nových částek životního minima
      dataCheckedLabel: "26. 10. 2026",   // poslední kontrola čísel a zdrojů
      dataNote: "Mzdy ISPV 2025 přepočtené růstem mezd 2026; důchody ČSSZ 6/2026; rozpočty ČT a ČRo 2026; tisk 231 ve znění po 1. čtení."
    },
    SRC: SRC,

    /* ---------- A. Současný systém (fakt) ---------- */
    fee: {
      tvMonthly: { value: 150, unit: "Kč/měs.", cat: "fakt", src: SRC.zakon348, date: "od 1. 5. 2025" },
      radioMonthly: { value: 55, unit: "Kč/měs.", cat: "fakt", src: SRC.zakon348, date: "od 1. 5. 2025" },
      exemptMultiple: { value: 2.15, unit: "× životní minimum", cat: "fakt", src: SRC.zakon348pdf, note: "§ 4 odst. 2: čistý příjem osoby, resp. součet čistých příjmů osob v domácnosti, za uplynulé kalendářní čtvrtletí; příjmy se zjišťují podle zák. č. 110/2006 Sb. Osvobození nejdéle na 6 měsíců, na žádost." },
      exemptSensory: { value: "úplná nebo praktická slepota obou očí, oboustranná úplná nebo praktická hluchota", cat: "fakt", src: SRC.zakon348mk, note: "§ 4 odst. 1 písm. g): osvobozena je osoba osaměle žijící, nebo když spolu v domácnosti žijí jen takové osoby. Nárok ze zákona od 1. dne měsíce po vzniku důvodu (§ 4 odst. 3), bez oznamovací povinnosti (§ 8 odst. 2). Děti zákon výslovně neřeší; nezapočítávání nezletilých a nezaopatřených dětí je výklad ČT. Průkaz (ZTP/P u nevidomých, ZTP u neslyšících) je podle ČT doklad, nárok nezakládá." },
      uncertaintyBand: { value: 0.15, cat: "model", note: "Pásmo ±15 % kolem limitu, ve kterém kalkulačka z odhadu čistého příjmu nárok nerozhoduje." },
      valorization: { value: { threshold: 0.06, step: 0.06, from: "1. 7. následujícího roku" }, cat: "fakt", src: SRC.novela119, note: "Zvýšení o 6 %, jakmile kumulovaná inflace od posledního zvýšení přesáhne 6 %." },
      collectionCostCT: { value: 109663000, unit: "Kč/rok", cat: "fakt", src: SRC.ctRozpocet, date: "plán 2026", note: "Správa a výběr TV poplatků vč. odměny České poště za SIPO." },
      payingHouseholdsTV: { value: 3500000, unit: "domácností", cat: "fakt", src: SRC.ctRozpocet, date: "2025", note: "Součet 2,4 mil. přes SIPO a 1,1 mil. přímo, odečteno z grafu v rozpočtu ČT." }
    },

    /* Životní minimum (zák. č. 110/2006 Sb.) podle data právního stavu */
    zm: [
      { from: "2026-01-01", to: "2026-09-30", single: 4860, firstAdult: 4470, nextAdult: 4040, child0_6: 2480, child6_15: 3050, child15_26: 3490 },
      { from: "2026-10-01", to: null, single: 5500, firstAdult: 5000, nextAdult: 3750, child0_6: 2480, child6_15: 3050, child15_26: 3490 }
    ],
    zmSrc: SRC.croOsvobozeni,

    /* Orientační výpočet čistého příjmu pro test osvobození (model) */
    netCalc: {
      empSocial: 0.071, empHealth: 0.045, taxRate: 0.15, taxRateHigh: 0.23,
      taxHighThresholdMonthly: 146901, taxCreditMonthly: 2570,
      selfNetRatio: 0.82,
      cat: "model",
      note: "Zjednodušeno: bez daňového zvýhodnění na děti a dalších slev. Rozhodný je skutečný čistý příjem za předchozí čtvrtletí."
    },

    /* ---------- B. Rozpočtový model (návrh) ---------- */
    budget: {
      ct: { value: 5741826000, unit: "Kč/rok", cat: "navrh", src: SRC.tisk231, date: "návrh pro rok 2027" },
      cro: { value: 2065766000, unit: "Kč/rok", cat: "navrh", src: SRC.tisk231, date: "návrh pro rok 2027" },
      valorization: { value: { threshold: 0.10, step: 0.10 }, cat: "navrh", src: SRC.tisk231, note: "+10 %, jakmile kumulovaná inflace od roku 2026 (resp. od roku před posledním zvýšením) přesáhne 10 p. b." },
      payment: { value: "měsíčně do 15. dne", cat: "navrh", src: SRC.tisk231 },
      multiYear: { value: false, cat: "navrh", src: SRC.tisk231, note: "Text víceletou garanci neobsahuje; RIA ji s odkazem na EMFA doporučuje." },
      status: { value: "Po 1. čtení (24. 10. 2026), přikázán Výboru pro média a kulturu. Není zákonem.", cat: "fakt", src: SRC.ctk231 }
    },

    /* ---------- Referenční financování ČT a ČRo (Graf C) ---------- */
    reference: [
      { id: "ct2024", who: "ČT", year: 2024, kind: "skutečný výběr poplatků", cat: "fakt", value: 5741826000, src: SRC.ctRozpocet },
      { id: "ct2025", who: "ČT", year: 2025, kind: "odhad skutečnosti výběru", cat: "fakt", value: 6280000000, src: SRC.ctRozpocet },
      { id: "ct2026", who: "ČT", year: 2026, kind: "plán výběru (rozpočet ČT)", cat: "fakt", value: 6730000000, src: SRC.ctRozpocet },
      { id: "ct2027", who: "ČT", year: 2027, kind: "příspěvek ze SR (tisk 231)", cat: "navrh", value: 5741826000, src: SRC.tisk231 },
      { id: "cro2024", who: "ČRo", year: 2024, kind: "skutečný výběr poplatků", cat: "fakt", value: 2065766000, src: SRC.tisk231, note: "Podle RIA tisku 231 odpovídá návrh výnosům z poplatků za rok 2024." },
      { id: "cro2026", who: "ČRo", year: 2026, kind: "plán výběru (rozpočet ČRo)", cat: "fakt", value: 2476000000, src: SRC.croRozpocet },
      { id: "cro2027", who: "ČRo", year: 2027, kind: "příspěvek ze SR (tisk 231)", cat: "navrh", value: 2065766000, src: SRC.tisk231 }
    ],

    /* ---------- Demografie ---------- */
    population: { value: 10904000, cat: "fakt", src: SRC.csuObyv, date: "30. 6. 2026", note: "necelých 10,904 mil." },
    households: { value: 4813103, cat: "fakt", src: SRC.sldb, date: "SLDB 2021", note: "Hospodařící domácnosti, poslední census." },

    /* ---------- Příjmové skupiny pro celostátní simulaci ---------- */
    groups: {
      emp: {
        label: "Zaměstnanci, mzdová sféra", cat: "fakt", src: SRC.ispvMzs, year: 2025,
        count: 3010200, mean: 52239,
        q: [[0.10, 24919], [0.25, 32538], [0.50, 43241], [0.75, 58801], [0.90, 85087]]
      },
      pub: {
        label: "Zaměstnanci, platová sféra", cat: "fakt", src: SRC.ispvPls, year: 2025,
        count: 683868, mean: 52037,
        q: [[0.10, 32099], [0.50, 48064], [0.90, 74104]]
      },
      pens: {
        label: "Starobní důchodci", cat: "fakt", src: SRC.cssz, year: 2026,
        count: 2333762, mean: 21803, cv: 0.2,
        note: "Rozdělení výše důchodu je modelové (lognormální, variační koeficient 0,2), průměr a počet jsou fakt."
      },
      inv: {
        label: "Invalidní důchodci", cat: "model", src: SRC.cssz, year: 2026,
        count: 420880, mean: 14500, cv: 0.25,
        note: "Počet je fakt; průměr 14 500 Kč je vážený odhad z průměrů podle stupňů (18 293 / 12 394 / 10 462 Kč), struktura podle stupňů nezveřejněna v použitém přehledu."
      },
      self: {
        label: "OSVČ v hlavní činnosti (hrubý předpoklad)", cat: "model", src: SRC.cssz, year: 2026,
        count: 739472, medianAnnual: 300000, sigma: 0.9,
        note: "Počet OSVČ povinných platit zálohy je fakt (ČSSZ). Rozdělení zisku je NEOVĚŘENÝ PŘEDPOKLAD: veřejné rozdělení základů daně OSVČ podle výše neexistuje. Ve výchozím stavu vypnuto."
      }
    },

    /* Předpoklady simulace: centrální odhad a meze rozpětí scénářů (nejde o statistický interval spolehlivosti) */
    sim: {
      wageGrowth2026: { value: 0.064, cat: "fakt", src: SRC.csuMzdy, note: "Meziroční růst průměrné mzdy ve 2. čtvrtletí 2026; použit pro přepočet ISPV 2025 na rok 2026." },
      scenarios: {
        low: { countF: 0.95, growthAdj: -0.01, lowTail: 0.25, compliance: 0.97 },
        mid: { countF: 1.00, growthAdj: 0, lowTail: 0.40, compliance: 0.99 },
        high: { countF: 1.05, growthAdj: 0.01, lowTail: 0.55, compliance: 1.00 }
      },
      scenarioNote: "Rozpětí kombinuje: počet osob ±5 % (rozdíl mezi ISPV a evidencí ČSÚ), růst mezd ±1 p. b., tvar dolního chvostu rozdělení (zkrácené úvazky) a úspěšnost výběru 97 až 100 %.",
      points: 2000,
      cat: "model"
    },

    /* ---------- C. Účelový mediální odvod (autorský návrh) ---------- */
    levyDefault: {
      rate: 0.011, threshold: 300000, cap: 3000, marginal: true,
      includePensions: true, includeSelf: false,
      adminCostRate: 0.01, reserveRate: 0.02,
      cat: "autor",
      note: "Výchozí sazba 1,1 % je zaokrouhlený výsledek kalibrace na částku tisku 231 v centrálním scénáři (verze dat 2026-10-26). Není doporučením; dostatečnost ukazuje simulátor jako interval."
    },

    /* Evropské vzory, parametry pro srovnání */
    nordic: {
      FI: { rate: 0.025, thresholdEur: 15150, capEur: 160, src: SRC.yle, cat: "fakt", note: "2,5 % z příjmu nad prahem, strop na osobu." },
      SE: { rate: 0.01, capSek: 1184, src: SRC.skv, cat: "fakt", note: "1 % zdanitelného příjmu z práce, strop na osobu." }
    },

    /* Projekce (Graf D) */
    projection: {
      years: 10, startYear: 2027,
      inflationScenarios: [0.02, 0.025, 0.04, 0.06],
      inflationDefault: 0.025, realWageGrowth: 0.015,
      cnb: { 2026: 0.020, 2027: 0.025, 2028: 0.024, src: SRC.cnb, cat: "fakt" },
      cat: "model",
      note: "Projekce, ne prognóza: mechanické dopočty pravidel při zvolené inflaci."
    },

    /* ---------- Nezávislost: věcné srovnání pojistek (bez skóre) ---------- */
    independence: [
      { q: "Kdo určuje výši financování",
        a: { cat: "fakt", t: "Výši poplatku stanoví zákon č. 348/2005 Sb. Výnos plyne přímo ČT a ČRo a není příjmem státního rozpočtu.", src: SRC.mk },
        b: { cat: "navrh", t: "Částku stanoví zákony o ČT a ČRo. Vyplácí ji ministerstvo kultury jako mandatorní výdaj své rozpočtové kapitoly.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Sazbu, hranici a strop stanoví zákon. Výnos jde od správce daně na zvláštní účet mimo kapitolu ministerstva a dělí se zákonným poměrem." } },
      { q: "Jak často lze částku změnit",
        a: { cat: "fakt", t: "Jen změnou zákona. Televizní poplatek byl mezi lety 2008 a 2025 beze změny.", src: SRC.novela119 },
        b: { cat: "navrh", t: "Změnou zákona prostou většinou Sněmovny. Text nevyžaduje kvalifikovanou většinu ani souhlas Senátu.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Změnou zákona; parametry platí na pětileté období a změna může nabýt účinnosti nejdříve pro období následující." } },
      { q: "Automatická valorizace",
        a: { cat: "fakt", t: "Ano: +6 %, jakmile kumulovaná inflace od posledního zvýšení přesáhne 6 %, od 1. 7. následujícího roku.", src: SRC.novela119 },
        b: { cat: "navrh", t: "Ano: +10 %, jakmile kumulovaná inflace přesáhne 10 p. b. Mezi zvýšeními reálná hodnota klesá až zhruba o desetinu.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Výnos roste se mzdami sám. Hranici a strop lze zákonem indexovat průměrnou mzdou (volba v grafu D)." } },
      { q: "Může vláda prostředky zadržet nebo krátit",
        a: { cat: "fakt", t: "Ne. Domácnosti platí přímo vysílatelům (SIPO, účty ČT a ČRo).", src: SRC.mk },
        b: { cat: "navrh", t: "Bez změny zákona ne: mandatorní výdaj, splátky do 15. dne v měsíci. Peníze však procházejí rozpočtem ministerstva; RIA tuto variantu sama označuje za „nejrizikovější volbu“.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Výnos převádí správce daně přímo na zákonem určený účet; zákon výslovně vylučuje započtení a krácení." } },
      { q: "Víceletý rámec",
        a: { cat: "fakt", t: "Formální víceletý rámec neexistuje; výnos ale nezávisí na každoročním státním rozpočtu.", src: SRC.mk },
        b: { cat: "navrh", t: "Ne. RIA s odkazem na odůvodnění EMFA víceletý základ doporučuje, text návrhu jej neobsahuje.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Ano: pětiletý finanční rámec schválený předem a stabilizační rezerva, která vyrovnává výkyvy výnosu." } },
      { q: "Kontrola hospodaření",
        a: { cat: "fakt", t: "Rozpočet a závěrečný účet schvalují Rada ČT a Rada ČRo, výroční zprávy o hospodaření projednává Sněmovna. NKÚ dnes ČT a ČRo kontrolovat nemůže; ústavní novela (tisk 47) a prováděcí zákon (tisk 217) nebyly podle dostupných zpráv přijaty.", src: SRC.nku },
        b: { cat: "navrh", t: "Tisk 231 kontrolu sám nemění. Pravomoc NKÚ řeší samostatné předlohy (tisk 47, tisk 217).", src: SRC.lupaNku },
        c: { cat: "autor", t: "Kontrola NKÚ nad hospodařením (ne nad obsahem), každoročně zveřejněný audit a ověření výnosu odvodu Finanční správou." } },
      { q: "Nezávislost kontrolních orgánů",
        a: { cat: "fakt", t: "Členy Rady ČT a Rady ČRo volí a odvolává Poslanecká sněmovna (zákony č. 483/1991 Sb. a 484/1991 Sb.).", src: SRC.zakonCT },
        b: { cat: "navrh", t: "Změnu volby rad se v dostupných zprávách o tisku 231 dohledat nepodařilo; předpokládáme beze změny. O radách i o penězích by pak rozhodovala tatáž sněmovní většina.", src: SRC.tisk231 },
        c: { cat: "autor", t: "Rady volené z kandidátů nominovaných nezávislými institucemi; odvolání jen ze zákonných důvodů se soudním přezkumem (srov. čl. 5 odst. 2 EMFA)." } }
    ],

    /* ---------- Evropské inspirace ---------- */
    inspiration: [
      { iso: "FI", title: "Finsko", sub: "účelová daň z příjmu, od 2013",
        how: "Yle daň: 2,5 % z příjmu nad 15 150 €, strop 160 € na osobu. Vybírá daňová správa spolu s daní z příjmu.",
        control: "Výnos je účelově určen pro Yle; daň platí jen dospělí nad příjmovým prahem.",
        after: "Vzor pro Švédsko. Nahradil domácí poplatek ve výši kolem 250 € ročně." },
      { iso: "SE", title: "Švédsko", sub: "individuální veřejnoprávní odvod, od 2019",
        how: "1 % zdanitelného příjmu z práce, strop 1 184 SEK na osobu. Žádná faktura, částka je v daňovém přiznání.",
        control: "Výnos jde na zvláštní účet veřejnoprávních médií, ne do obecného rozpočtu.",
        after: "Výběrčí Radiotjänst byl zrušen. Předchozí poplatek měl odhadovaný únik 11 až 15 %." },
      { iso: "DK", title: "Dánsko", sub: "obecné daně, licence zrušena 2019 až 2022",
        how: "Financování ze státního rozpočtu, náhrada přes snížení osobní daňové slevy.",
        control: "Výši určuje politická mediální dohoda a rozpočet.",
        after: "Spolu se zrušením licence snížila tatáž mediální dohoda rozpočet DR o 20 %. Škrt byl politickým rozhodnutím téže dohody, ne automatickým důsledkem modelu." },
      { iso: "DE", title: "Německo", sub: "příspěvek za byt, od 2013",
        how: "18,36 € měsíčně za každý byt bez ohledu na přístroje.",
        control: "Výši doporučuje nezávislá komise KEF, schvalují ji spolkové země; Spolkový ústavní soud v roce 2021 zvýšení prosadil proti jedné zemi.",
        after: "Model obstál u ústavního soudu (2018). Spory o výši se vedou soudně, ne v ročním rozpočtu." },
      { iso: "SK", title: "Slovensko", sub: "rozpočet, poplatek zrušen 2023",
        how: "Státní rozpočet se zákonným minimem vyjádřeným podílem HDP.",
        control: "Výši určuje zákon a rozpočet; v radě STVR má od 2024 vláda a parlament přímou většinu.",
        after: "Zrušení poplatku (2023) a přeměnu RTVS na STVR (2024) prosadily různé vládní většiny. Přeměnu proto nelze přičítat samotnému modelu financování." }
    ]
  };

  root.POPLATKY_PARAMS = P;
  if (typeof module !== "undefined" && module.exports) module.exports = P;
})(/** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : this));
