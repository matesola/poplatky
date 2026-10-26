# Poplatky za vysílání v Evropě

Statický web bez buildu: financování veřejnoprávních médií ve 45 evropských zemích a interaktivní kapitola „Co kdybychom platili jinak?“ (kalkulačka domácnosti, celostátní fiskální simulátor, projekce, nezávislost). Stav k 26. 10. 2026.

- `index.html`: stránka, data zemí, mapa, styly.
- `lab/`: kapitola 04, oddělené výpočetní jádro (`engine.js`), verzované parametry se zdroji (`params.js`), prezentace (`ui.js`, `lab.css`).
- `tests/`: jednotkové testy jádra.
- `METODIKA.md`: vzorce, předpoklady, omezení.

Lokálně stačí otevřít `index.html` v prohlížeči. Kontrola: `npm install && npm run check`.
Nasazení: Vercel jako statický web (`vercel.json`), bez build kroku.
