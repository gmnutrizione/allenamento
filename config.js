// ============================================================
// CONFIGURAZIONE - modifica solo questi due link se cambiano
// ============================================================
// Questi due fogli sono condivisi da TUTTI i clienti.
// Il link della scheda del singolo cliente invece NON va qui:
// viene passato nell'indirizzo dell'app (parametro ?data=...)

const ARCHIVIO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfqWzHFYL-N3c5WSgFvkfQ0mR74tBO8SCwgf17Aarz8NYD7Tzm3ToMwJz-7neFa1wggmNtWB989QoR/pub?gid=251396579&single=true&output=csv";

const FOTO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfqWzHFYL-N3c5WSgFvkfQ0mR74tBO8SCwgf17Aarz8NYD7Tzm3ToMwJz-7neFa1wggmNtWB989QoR/pub?gid=572585223&single=true&output=csv";

// Link dell'App web (Google Apps Script) che riceve kg, rep, commenti
// e le modifiche alla scheda, scrivendoli nel tab "Risultati"
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzuFR3xaRCGpcF_JNSCJ2afkp2DGSEw4jdL8fWUVC2HvCrP0RiEs1-fA27ig7K-aP3MaQ/exec";
