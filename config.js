// ============================================================
// CONFIGURAZIONE - modifica solo questi due link se cambiano
// ============================================================
// Questi due fogli sono condivisi da TUTTI i clienti.
// Il link della scheda del singolo cliente invece NON va qui:
// viene passato nell'indirizzo dell'app (parametro ?data=...)

const ARCHIVIO_CSV_URL = "https://docs.google.com/spreadsheets/d/1M-6QGcdYz61884Q1AJQbD9ze361JqqXHNEjunUodZRk/export?format=csv&gid=251396579";

const FOTO_CSV_URL = "https://docs.google.com/spreadsheets/d/1M-6QGcdYz61884Q1AJQbD9ze361JqqXHNEjunUodZRk/export?format=csv&gid=572585223";

// Elenco clienti (Codice, Cliente, Link scheda) - usato per capire, dal codice
// inserito, quale scheda caricare. Cos\u00ec il link dell'app resta uguale per tutti.
const CLIENTI_CSV_URL = "https://docs.google.com/spreadsheets/d/1M-6QGcdYz61884Q1AJQbD9ze361JqqXHNEjunUodZRk/export?format=csv&gid=1615113886";

// Link dell'App web (Google Apps Script) che riceve kg, rep, commenti
// e le modifiche alla scheda, scrivendoli nel tab "Risultati"
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzuFR3xaRCGpcF_JNSCJ2afkp2DGSEw4jdL8fWUVC2HvCrP0RiEs1-fA27ig7K-aP3MaQ/exec";
