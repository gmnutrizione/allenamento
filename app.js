// ============================================================
// STATO GLOBALE
// ============================================================
let clienteNome = "";
let clienteCsvUrl = "";
let clientiList = [];     // elenco Codice/Cliente/Link scheda
let eserciziTotali = []; // tutte le righe del foglio del cliente, tutti i blocchi
let esercizi = [];        // sottoinsieme del blocco attualmente aperto
let currentBloccoNumero = 1;
let archivio = {};        // nome esercizio -> {video, descrizione, alternative[]}
let fotoGruppi = {};      // gruppo muscolare -> url foto
let giorni = [];          // elenco ordinato dei giorni
let currentGiorno = null;
let currentSessione = 1;
let currentDettaglio = null; // {giorno, gruppo, esercizio, ...}
let editState = {};       // salvato in localStorage, per cliente

// ============================================================
// AVVIO
// ============================================================
window.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    clientiList = await fetchCsv(CLIENTI_CSV_URL);
  } catch (err) {
    console.error(err);
    showScreen("screen-error");
    document.getElementById("error-message").textContent =
      "Non riesco a contattare il server. Controlla la connessione e riprova.";
    return;
  }

  // sessione gi\u00e0 validata in precedenza su questo telefono?
  const sessione = localStorage.getItem("gm_sessione");
  if (sessione) {
    const obj = JSON.parse(sessione);
    clienteNome = obj.cliente;
    clienteCsvUrl = obj.csvUrl;
    await caricaSchedaCliente();
    return;
  }

  showScreen("screen-access");
  document.getElementById("access-title").textContent = "Benvenuto";
  document.getElementById("access-submit").onclick = provaAccesso;
}

async function provaAccesso() {
  const inserito = document.getElementById("access-code-input").value.trim();
  const riga = clientiList.find(r => (r.Codice || "").trim() === inserito);
  if (!riga || !riga["Link scheda"]) {
    document.getElementById("access-error").textContent = "Codice non corretto, riprova.";
    return;
  }
  clienteNome = (riga.Cliente || "").trim();
  clienteCsvUrl = (riga["Link scheda"] || "").trim();
  localStorage.setItem("gm_sessione", JSON.stringify({ cliente: clienteNome, csvUrl: clienteCsvUrl }));

  document.getElementById("access-submit").textContent = "Attendere...";
  await caricaSchedaCliente();
}

async function caricaSchedaCliente() {
  showScreen("screen-loading");
  try {
    const [datiCliente, datiArchivio, datiFoto] = await Promise.all([
      fetchCsv(clienteCsvUrl),
      fetchCsv(ARCHIVIO_CSV_URL),
      fetchCsv(FOTO_CSV_URL)
    ]);

    eserciziTotali = datiCliente.filter(r => r.Esercizio && r.Esercizio.trim() !== "");
    currentBloccoNumero = Math.max(1, ...eserciziTotali.map(r => parseBloccoNum(r.Blocco)));
    archivio = {};
    datiArchivio.forEach(r => {
      if (!r.Esercizio) return;
      archivio[r.Esercizio.trim()] = {
        video: (r.Video || "").trim(),
        descrizione: (r.Descrizione || "").trim(),
        alternative: (r.Alternative || "").split(";").map(s => s.trim()).filter(Boolean)
      };
    });
    fotoGruppi = {};
    datiFoto.forEach(r => {
      if (!r["Gruppo muscolare"]) return;
      fotoGruppi[r["Gruppo muscolare"].trim()] = (r.Foto || "").trim();
    });

    loadEditState();
    afterAccessGranted();
  } catch (err) {
    console.error(err);
    showScreen("screen-error");
    document.getElementById("error-message").textContent =
      "Non riesco a leggere la tua scheda. Controlla la connessione e riprova.";
  }
}

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data),
      error: reject
    });
  });
}

// ============================================================
// ACCESSO (vedi provaAccesso() piu' in alto)
// ============================================================
function storageKey(suffix) {
  return "gm_palestra_" + btoa(clienteCsvUrl).slice(0, 40) + "_" + suffix;
}

function afterAccessGranted() {
  document.getElementById("greeting-text").textContent = clienteNome ? ("Ciao " + clienteNome) : "Ciao";
  showScreen("screen-categorie");
}

// ============================================================
// BLOCCHI
// ============================================================
function parseBloccoNum(s) {
  const m = (s || "").match(/\d+/);
  return m ? parseInt(m[0]) : 1;
}

function caricoColumns(row) {
  return Object.keys(row)
    .map(k => {
      const m = k.match(/^Carico\s*(\d+)\s*sett/i);
      return m ? { n: parseInt(m[1]), key: k } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);
}

function caricoColonnaSessione(row, sessione) {
  const cols = caricoColumns(row);
  const trovata = cols.find(c => c.n === sessione);
  return trovata ? (row[trovata.key] || "").trim() : "";
}

function estraiKgDaCarico(testo) {
  const str = (testo || "").toString().trim();
  if (!str) return "";
  const conUnita = str.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (conUnita) return conUnita[1].replace(",", ".");
  const soloNumero = str.match(/(\d+(?:[.,]\d+)?)/);
  return soloNumero ? soloNumero[1].replace(",", ".") : "";
}

function ultimoCarico(row) {
  const cols = caricoColumns(row);
  for (let i = cols.length - 1; i >= 0; i--) {
    const val = (row[cols[i].key] || "").trim();
    if (val) return val;
  }
  return "";
}

function buildBlocchi() {
  const list = document.getElementById("blocchi-list");
  list.innerHTML = "";

  for (let i = 1; i <= currentBloccoNumero; i++) {
    const card = document.createElement("div");
    if (i < currentBloccoNumero) {
      card.className = "blocco-card completato";
      card.innerHTML = `
        <div style="flex:1;">
          <p class="blocco-nome">Blocco ${i}</p>
          <p class="blocco-stato">Completato</p>
        </div>
        <span style="font-size:16px;">&#10003;</span>
      `;
    } else {
      card.className = "blocco-card attivo";
      card.innerHTML = `
        <div style="flex:1;">
          <p class="blocco-nome">Blocco ${i}</p>
          <p class="blocco-stato">In corso</p>
        </div>
        <span>&#8250;</span>
      `;
      card.addEventListener("click", () => apriBlocco(i));
    }
    list.appendChild(card);
  }

  const prossimo = document.createElement("div");
  prossimo.className = "blocco-card bloccato";
  prossimo.innerHTML = `
    <div style="flex:1;">
      <p class="blocco-nome">Blocco ${currentBloccoNumero + 1}</p>
      <p class="blocco-stato">Si sblocca al completamento del Blocco ${currentBloccoNumero}</p>
    </div>
    <span style="font-size:16px;">&#128274;</span>
  `;
  list.appendChild(prossimo);
}

function apriBlocco(numero) {
  esercizi = eserciziTotali.filter(r => parseBloccoNum(r.Blocco) === numero);
  document.getElementById("giorni-title").textContent = "Blocco " + numero;
  buildGiorni();
  showScreen("screen-giorni");
}

document.getElementById("reset-blocchi-btn").addEventListener("click", resetAllenamenti);

function resetAllenamenti() {
  const codice = prompt("Inserisci il codice per confermare il reset:");
  if (codice === null) return;
  if (codice.trim() !== "7858") {
    alert("Codice non corretto.");
    return;
  }
  if (!confirm("Sicuro di voler azzerare da 0 tutti gli allenamenti (rep, fatica, commenti) di questo blocco?")) return;

  const giorniBlocco = [...new Set(
    eserciziTotali.filter(r => parseBloccoNum(r.Blocco) === currentBloccoNumero).map(r => r.Giorno)
  )];
  giorniBlocco.forEach(g => localStorage.removeItem(sessioniCompletateKey(g)));

  // rimuovo tutte le chiavi di input (rep/fatica/commento) che appartengono
  // a uno di questi giorni, per qualunque gruppo/esercizio/sessione
  const daRimuovere = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(storageKey("input_"))) continue;
    const appartieneAlBlocco = giorniBlocco.some(g => k.startsWith(storageKey("input_" + g + "|")));
    if (appartieneAlBlocco) daRimuovere.push(k);
  }
  daRimuovere.forEach(k => localStorage.removeItem(k));

  alert("Allenamenti azzerati completamente.");
  buildBlocchi();
}

// ============================================================
// NAVIGAZIONE SCHERMATE
// ============================================================
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.addEventListener("click", e => {
  const back = e.target.closest("[data-back]");
  if (back) {
    const target = back.dataset.back;
    if (target === "screen-giorni") buildGiorni();
    if (target === "screen-sessioni" && currentGiorno) apriSessioni(currentGiorno);
    showScreen(target);
  }
  const catCard = e.target.closest(".category-card");
  if (catCard && catCard.dataset.category === "palestra") {
    buildBlocchi();
    showScreen("screen-blocchi");
  }
});

// ============================================================
// GIORNI
// ============================================================
function sessioniCompletateKey(giorno) {
  return storageKey("sessioni_completate_" + currentBloccoNumero + "_" + giorno);
}
function getSessioniCompletate(giorno) {
  const raw = localStorage.getItem(sessioniCompletateKey(giorno));
  return raw ? JSON.parse(raw) : [];
}
function segnaSessioneCompletata(giorno, sessione) {
  const arr = getSessioniCompletate(giorno);
  if (!arr.includes(sessione)) {
    arr.push(sessione);
    localStorage.setItem(sessioniCompletateKey(giorno), JSON.stringify(arr));
  }
}

function buildGiorni() {
  giorni = [];
  esercizi.forEach(r => {
    if (r.Giorno && !giorni.includes(r.Giorno)) giorni.push(r.Giorno);
  });

  const dati = giorni.map(giorno => {
    const rows = esercizi.filter(r => r.Giorno === giorno);
    const gruppi = [...new Set(rows.map(r => r["Gruppo muscolare"]).filter(Boolean))];
    const totale = rows.length ? Math.max(1, caricoColumns(rows[0]).length) : 0;
    const completate = getSessioniCompletate(giorno).length;
    const percentuale = totale > 0 ? Math.min(100, Math.round((completate / totale) * 100)) : 0;
    return { giorno, gruppi, rowsCount: rows.length, totale, completate, percentuale };
  });

  // il "prossimo" e' quello non ancora completato al 100% con meno allenamenti fatti,
  // a parita' vince l'ordine alfabetico del nome del giorno
  const candidati = dati.filter(d => d.totale > 0 && d.percentuale < 100);
  candidati.sort((a, b) => a.completate - b.completate || a.giorno.localeCompare(b.giorno));
  const prossimoGiorno = candidati.length ? candidati[0].giorno : null;

  const list = document.getElementById("day-list");
  list.innerHTML = "";
  dati.forEach(d => {
    const completato = d.totale > 0 && d.percentuale >= 100;
    const evidenziato = d.giorno === prossimoGiorno;

    const card = document.createElement("div");
    card.className = "day-card" + (evidenziato ? " day-card-next" : "");
    card.innerHTML = `
      <div class="day-card-top">
        <div class="day-icon-box${completato ? " completato" : ""}">${completato ? "&#10003;" : "&#127947;"}</div>
        <div class="day-info">
          <p class="day-name">${d.giorno} - ${d.gruppi.join(" e ")}</p>
          <p class="day-sub">${d.totale > 0 ? d.completate + " di " + d.totale + " allenamenti" : d.rowsCount + " esercizi"}</p>
        </div>
        <span class="day-arrow">&#8250;</span>
      </div>
      ${d.totale > 0 ? `<div class="day-progress"><div class="day-progress-fill" style="width:${d.percentuale}%;"></div></div>` : ""}
    `;
    card.addEventListener("click", () => apriSessioni(d.giorno));
    list.appendChild(card);
  });
}

function apriSessioni(giorno) {
  currentGiorno = giorno;
  const rows = esercizi.filter(r => r.Giorno === giorno);
  const totale = rows.length ? Math.max(1, caricoColumns(rows[0]).length) : 1;
  const completate = getSessioniCompletate(giorno);

  document.getElementById("sessioni-title").textContent = giorno;
  const list = document.getElementById("sessioni-list");
  list.innerHTML = "";

  let prossimaSessione = null;
  for (let i = 1; i <= totale; i++) {
    if (!completate.includes(i)) { prossimaSessione = i; break; }
  }

  for (let i = 1; i <= totale; i++) {
    const fatto = completate.includes(i);
    const evidenziato = i === prossimaSessione;
    const card = document.createElement("div");
    card.className = "day-card" + (evidenziato ? " day-card-next" : "");
    card.innerHTML = `
      <div class="day-card-top">
        <div class="day-icon-box${fatto ? " completato" : ""}">${fatto ? "&#10003;" : i}</div>
        <div class="day-info">
          <p class="day-name">Allenamento ${i}</p>
          <p class="day-sub">${fatto ? "Completato" : "Da fare"}</p>
        </div>
        <span class="day-arrow">&#8250;</span>
      </div>
    `;
    card.addEventListener("click", () => {
      currentSessione = i;
      openGiorno(giorno);
    });
    list.appendChild(card);
  }

  showScreen("screen-sessioni");
}

function openGiorno(giorno) {
  currentGiorno = giorno;
  const rows = esercizi.filter(r => r.Giorno === giorno);
  const gruppi = [...new Set(rows.map(r => r["Gruppo muscolare"]).filter(Boolean))];

  document.getElementById("day-header-title").textContent = giorno;
  document.getElementById("day-header-sessione").textContent = "Allenamento " + currentSessione;
  const chipRow = document.getElementById("day-chips");
  chipRow.innerHTML = gruppi.map(g => `<span class="chip">${g}</span>`).join("");

  const primoGruppo = gruppi[0];
  const foto = primoGruppo ? fotoGruppi[primoGruppo] : "";
  const header = document.getElementById("day-header");
  if (foto && !foto.includes("LINK_FOTO_DRIVE")) {
    header.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.35)), url('${foto}')`;
  } else {
    header.style.backgroundImage = "";
  }

  renderGruppi(giorno, gruppi);
  document.getElementById("concludi-btn").onclick = () => concludiAllenamento(giorno);
  showScreen("screen-esercizi");
}

function getSavedInputRefs(giorno, gruppo, esercizio, campo) {
  const chiave = giorno + "|" + gruppo + "|" + esercizio + "|s" + currentSessione;
  const saved = localStorage.getItem(storageKey("input_" + chiave));
  if (!saved) return null;
  return JSON.parse(saved)[campo];
}

function concludiAllenamento(giorno) {
  const flat = listaFlatGiorno(giorno);

  flat.forEach(item => {
    const valori = getSavedInputRefs(giorno, item.gruppo, item.nome, "valori") || [];
    const valoriKg = getSavedInputRefs(giorno, item.gruppo, item.nome, "valoriKg") || [];
    const commento = getSavedInputRefs(giorno, item.gruppo, item.nome, "commento") || "";
    const rpe = getSavedInputRefs(giorno, item.gruppo, item.nome, "rpe");

    const haDati = valori.some(v => v) || rpe || (commento && commento.trim());
    if (!haDati) return;

    const tipo = (item.ex.Tipo || "pesi").toLowerCase();
    let kg = "", rep = "";
    if (tipo.includes("corpo")) {
      rep = valori.join("-");
    } else {
      const kgCompilati = valoriKg.some(v => v && v.trim() !== "");
      kg = kgCompilati ? valoriKg.join("-") : (caricoColonnaSessione(item.ex, currentSessione) || ultimoCarico(item.ex) || "");
      rep = valori.join("-");
    }
    const commentoCompleto = (rpe ? "Fatica: " + rpe + "/10. " : "") + commento;

    inviaEvento({
      tipo: "Allenamento",
      blocco: currentBloccoNumero,
      giorno: giorno,
      gruppoMuscolare: item.gruppo,
      esercizio: item.nome,
      serieRipetizioni: (item.ex.Serie || "") + "x" + (item.ex.Rep || ""),
      kg, rep,
      commento: commentoCompleto
    });
  });

  segnaSessioneCompletata(giorno, currentSessione);
  inviaEvento({
    tipo: "Giorno completato",
    blocco: currentBloccoNumero,
    giorno: giorno,
    commento: "Allenamento " + currentSessione + " concluso"
  });
  buildGiorni();
  showScreen("screen-giorni");
}

// ============================================================
// GRUPPI ED ESERCIZI (con modalità modifica)
// ============================================================
function chiaveEsercizio(giorno, gruppo, nome) {
  return giorno + "|" + gruppo + "|" + nome;
}

function isRimosso(chiave) {
  return !!(editState.removed && editState.removed[chiave]);
}

function elencoAggiunti(giorno, gruppo) {
  if (!editState.added) return [];
  return Object.values(editState.added).filter(a => a.giorno === giorno && a.gruppo === gruppo);
}

function renderGruppi(giorno, gruppi) {
  const container = document.getElementById("exercise-groups");
  container.innerHTML = "";

  gruppi.forEach(gruppo => {
    const originali = esercizi
      .filter(r => r.Giorno === giorno && r["Gruppo muscolare"] === gruppo)
      .sort((a, b) => (parseInt(a.Ordine) || 0) - (parseInt(b.Ordine) || 0));

    const block = document.createElement("div");
    block.className = "group-block";
    block.dataset.editMode = "false";

    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `<p class="group-name">${gruppo}</p><span class="group-toggle">Modifica</span>`;
    block.appendChild(header);

    const listWrap = document.createElement("div");
    block.appendChild(listWrap);

    function draw() {
      listWrap.innerHTML = "";
      const editMode = block.dataset.editMode === "true";
      header.querySelector(".group-toggle").textContent = editMode ? "Fatto" : "Modifica";

      // esercizi originali non rimossi
      originali.forEach(ex => {
        const chiave = chiaveEsercizio(giorno, gruppo, ex.Esercizio);
        if (isRimosso(chiave)) return;
        listWrap.appendChild(renderRigaEsercizio(ex, giorno, gruppo, chiave, ex.Bloccato === "si", editMode, () => draw()));
      });

      // esercizi aggiunti manualmente (sostituzioni)
      elencoAggiunti(giorno, gruppo).forEach(agg => {
        const chiave = chiaveEsercizio(giorno, gruppo, agg.esercizio);
        listWrap.appendChild(renderRigaEsercizio(agg, giorno, gruppo, chiave, false, editMode, () => draw()));
      });
    }

    header.querySelector(".group-toggle").addEventListener("click", () => {
      block.dataset.editMode = block.dataset.editMode === "true" ? "false" : "true";
      draw();
    });

    draw();
    container.appendChild(block);
  });
}

function raccogliSuggerimenti(originali, attivi) {
  const risultato = [];
  const visti = new Set();
  originali.forEach(ex => {
    const info = archivio[ex.Esercizio.trim()];
    if (!info) return;
    info.alternative.forEach(altNome => {
      if (attivi.has(altNome) || visti.has(altNome)) return;
      visti.add(altNome);
      risultato.push({
        esercizio: altNome,
        Serie: ex.Serie,
        Ripetizioni: ex.Ripetizioni,
        Recupero: ex.Recupero,
        Tipo: ex.Tipo,
        Bloccato: "no",
        Giorno: ex.Giorno,
        "Gruppo muscolare": ex["Gruppo muscolare"]
      });
    });
  });
  return risultato;
}

function renderRigaEsercizio(ex, giorno, gruppo, chiave, bloccato, editMode, onChange) {
  const row = document.createElement("div");
  row.className = "exercise-row";
  const nome = ex.Esercizio || ex.esercizio;
  const variante = ex.Variante ? ` (${ex.Variante})` : "";
  const serie = ex.Serie, rip = ex.Rep;

  let iconsHtml;
  if (!editMode) {
    iconsHtml = `<span class="exercise-chevron">&#8250;</span>`;
  } else if (bloccato) {
    iconsHtml = `<div class="edit-icons"><span class="icon-btn icon-lock-sm">&#128274;</span></div>`;
  } else {
    iconsHtml = `<div class="edit-icons">
      <span class="icon-btn icon-replace" data-action="sostituisci">&#8635;</span>
    </div>`;
  }

  row.innerHTML = `
    <div>
      <p class="exercise-name">${nome}${variante}</p>
      <p class="exercise-sub">${serie} x ${rip}</p>
    </div>
    ${iconsHtml}
  `;

  if (!editMode) {
    row.addEventListener("click", () => apriDettaglio(ex, giorno, gruppo));
  } else if (!bloccato) {
    row.querySelector('[data-action="sostituisci"]').addEventListener("click", ev => {
      ev.stopPropagation();
      sostituisciEsercizio(giorno, gruppo, ex, nome);
      onChange();
    });
  }

  return row;
}

// ============================================================
// MODIFICHE (sostituisci / togli / aggiungi) - salvate in locale
// ============================================================
function loadEditState() {
  const saved = localStorage.getItem(storageKey("modifiche"));
  editState = saved ? JSON.parse(saved) : { removed: {}, added: {} };
}
function saveEditState() {
  localStorage.setItem(storageKey("modifiche"), JSON.stringify(editState));
}

function togliEsercizio(giorno, gruppo, nome, ex) {
  const chiave = chiaveEsercizio(giorno, gruppo, nome);
  editState.removed[chiave] = true;
  saveEditState();
  inviaModifica(giorno, gruppo, nome, "Rimosso dalla scheda");
}

function sostituisciEsercizio(giorno, gruppo, ex, nomeOriginale) {
  const info = archivio[nomeOriginale.trim()];
  const alternative = info ? info.alternative : [];
  if (alternative.length === 0) {
    alert("Nessuna alternativa disponibile per questo esercizio.");
    return;
  }
  const scelta = prompt("Sostituisci con:\n" + alternative.map((a, i) => (i + 1) + ") " + a).join("\n") + "\n\nScrivi il numero:");
  const idx = parseInt(scelta) - 1;
  if (isNaN(idx) || !alternative[idx]) return;
  const nuovo = alternative[idx];

  editState.removed[chiaveEsercizio(giorno, gruppo, nomeOriginale)] = true;
  editState.added[chiaveEsercizio(giorno, gruppo, nuovo)] = {
    esercizio: nuovo, giorno, gruppo,
    Serie: ex.Serie, Ripetizioni: ex.Ripetizioni, Recupero: ex.Recupero, Tipo: ex.Tipo
  };
  saveEditState();
  inviaModifica(giorno, gruppo, nomeOriginale, "Sostituito con: " + nuovo);
}

function aggiungiEsercizio(giorno, gruppo, sugg) {
  editState.added[chiaveEsercizio(giorno, gruppo, sugg.esercizio)] = {
    esercizio: sugg.esercizio, giorno, gruppo,
    Serie: sugg.Serie, Ripetizioni: sugg.Ripetizioni, Recupero: sugg.Recupero, Tipo: sugg.Tipo
  };
  saveEditState();
  inviaModifica(giorno, gruppo, sugg.esercizio, "Aggiunto alla scheda");
}

// ============================================================
// DETTAGLIO ESERCIZIO
// ============================================================
function parseRecuperoSecondi(testo) {
  const str = (testo || "").toString().trim();
  if (!str) return 0;
  const m = str.match(/(\d+(?:[.,]\d+)?)\s*('{1,2})/);
  if (m) {
    const num = parseFloat(m[1].replace(",", "."));
    return m[2] === "'" ? Math.round(num * 60) : Math.round(num);
  }
  const soloNumero = str.match(/\d+/);
  return soloNumero ? parseInt(soloNumero[0]) : 0;
}

function apriDettaglio(ex, giorno, gruppo) {
  const nome = ex.Esercizio || ex.esercizio;
  const info = archivio[nome.trim()] || { video: "", descrizione: "" };
  const video = (ex.Video || "").trim() || info.video;

  currentDettaglio = {
    giorno, gruppo, esercizio: nome,
    serie: parseInt(ex.Serie) || 1,
    ripetizioni: ex.Rep,
    recupero: parseRecuperoSecondi(ex.Recupero),
    tipo: (ex.Tipo || "pesi").toLowerCase(),
    caricoPrevisto: caricoColonnaSessione(ex, currentSessione) || ultimoCarico(ex),
    valori: [] // riempito sotto
  };

  const variante = ex.Variante ? " (" + ex.Variante + ")" : "";
  document.getElementById("detail-name-top").textContent = nome + variante;
  document.getElementById("detail-name").textContent = nome + variante;
  document.getElementById("desc-text").textContent = info.descrizione || "Nessuna descrizione disponibile.";
  document.getElementById("desc-text").style.display = "none";
  document.getElementById("desc-chevron").classList.remove("open");

  document.getElementById("video-box").innerHTML = video
    ? `<iframe src="${toEmbedUrl(video)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`
    : `<div class="video-placeholder"></div>`;

  document.getElementById("detail-sets-reps").textContent = currentDettaglio.serie + " x " + currentDettaglio.ripetizioni;
  document.getElementById("rec-static").textContent = "Rec " + ((ex.Recupero || "").trim() || (currentDettaglio.recupero + "''"));

  renderSetsInputs();
  setupRecTimer(currentDettaglio.recupero);

  showScreen("screen-dettaglio");
}

document.getElementById("avanti-btn").addEventListener("click", vaiAValutazione);

function vaiAValutazione() {
  const rpeSalvato = getSavedInput("rpe");
  const grid = document.getElementById("rpe-grid");
  grid.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("div");
    opt.className = "rpe-option" + (rpeSalvato == i ? " selezionato" : "");
    opt.textContent = i;
    opt.addEventListener("click", () => {
      grid.querySelectorAll(".rpe-option").forEach(o => o.classList.remove("selezionato"));
      opt.classList.add("selezionato");
      saveInput("rpe", i);
    });
    grid.appendChild(opt);
  }

  document.getElementById("comment-input").value = getSavedInput("commento") || "";
  showScreen("screen-valutazione");
}

document.getElementById("prossimo-btn").addEventListener("click", prossimoEsercizio);
document.getElementById("indietro-btn").addEventListener("click", esercizioPrecedente);

function listaFlatGiorno(giorno) {
  const rows = esercizi.filter(r => r.Giorno === giorno);
  const gruppi = [...new Set(rows.map(r => r["Gruppo muscolare"]).filter(Boolean))];
  const flat = [];
  gruppi.forEach(gruppo => {
    const originali = rows
      .filter(r => r["Gruppo muscolare"] === gruppo)
      .sort((a, b) => (parseInt(a.Ordine) || 0) - (parseInt(b.Ordine) || 0));
    originali.forEach(ex => {
      const chiave = chiaveEsercizio(giorno, gruppo, ex.Esercizio);
      if (!isRimosso(chiave)) flat.push({ ex, giorno, gruppo, nome: ex.Esercizio });
    });
    elencoAggiunti(giorno, gruppo).forEach(agg => {
      flat.push({ ex: agg, giorno, gruppo, nome: agg.esercizio });
    });
  });
  return flat;
}

function esercizioPrecedente() {
  if (!currentDettaglio) return;
  const flat = listaFlatGiorno(currentDettaglio.giorno);
  const idx = flat.findIndex(item => item.gruppo === currentDettaglio.gruppo && item.nome === currentDettaglio.esercizio);
  if (idx > 0) {
    const prev = flat[idx - 1];
    apriDettaglio(prev.ex, prev.giorno, prev.gruppo);
  } else {
    showScreen("screen-esercizi");
  }
}

function prossimoEsercizio() {
  const giorno = currentDettaglio.giorno;
  const gruppoCorrente = currentDettaglio.gruppo;
  const nomeCorrente = currentDettaglio.esercizio;
  currentDettaglio = null;

  const flat = listaFlatGiorno(giorno);
  const idx = flat.findIndex(item => item.gruppo === gruppoCorrente && item.nome === nomeCorrente);

  if (idx >= 0 && idx < flat.length - 1) {
    const next = flat[idx + 1];
    apriDettaglio(next.ex, next.giorno, next.gruppo);
  } else {
    showScreen("screen-esercizi");
  }
}

function toEmbedUrl(url) {
  if (!url) return url;
  if (url.includes("drive.google.com")) {
    return url.replace(/\/view.*$/, "/preview");
  }
  if (url.includes("youtu.be/")) {
    return url.replace("youtu.be/", "www.youtube.com/embed/");
  }
  if (url.includes("watch?v=")) {
    return url.replace("watch?v=", "embed/").split("&")[0];
  }
  return url;
}

document.getElementById("desc-toggle").addEventListener("click", () => {
  const desc = document.getElementById("desc-text");
  const chev = document.getElementById("desc-chevron");
  const open = desc.style.display !== "none";
  desc.style.display = open ? "none" : "block";
  chev.classList.toggle("open", !open);
});

function inputKeyFor(dett) {
  return dett.giorno + "|" + dett.gruppo + "|" + dett.esercizio + "|s" + currentSessione;
}
function getSavedInput(campo) {
  if (!currentDettaglio) return null;
  const saved = localStorage.getItem(storageKey("input_" + inputKeyFor(currentDettaglio)));
  if (!saved) return null;
  const obj = JSON.parse(saved);
  return obj[campo];
}
function saveInput(campo, valore) {
  if (!currentDettaglio) return;
  const key = storageKey("input_" + inputKeyFor(currentDettaglio));
  const obj = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : {};
  obj[campo] = valore;
  localStorage.setItem(key, JSON.stringify(obj));
}

function renderSetsInputs() {
  const wrap = document.getElementById("sets-inputs");
  wrap.innerHTML = "";
  const corpoLibero = currentDettaglio.tipo.includes("corpo");
  const savedRep = getSavedInput("valori") || [];
  const savedKg = getSavedInput("valoriKg") || [];
  const kgSuggerito = estraiKgDaCarico(currentDettaglio.caricoPrevisto);

  for (let i = 1; i <= currentDettaglio.serie; i++) {
    const row = document.createElement("div");
    row.className = "set-row";

    if (corpoLibero) {
      const checked = savedRep[i - 1] === "fatto" ? "checked" : "";
      row.innerHTML = `
        <span class="set-label">Serie ${i}</span>
        <div class="set-input-group">
          <input type="checkbox" class="set-checkbox" data-idx="${i - 1}" ${checked}>
        </div>
      `;
    } else {
      const valoreRep = savedRep[i - 1] || "";
      const valoreKg = savedKg[i - 1] !== undefined ? savedKg[i - 1] : (kgSuggerito || "");
      row.innerHTML = `
        <span class="set-label">Serie ${i}</span>
        <div class="set-input-group">
          <input type="text" inputmode="decimal" placeholder="0" class="kg-input" data-idx="${i - 1}" value="${valoreKg}">
          <span class="set-unit">Kg</span>
          <input type="text" inputmode="numeric" placeholder="0" class="rep-input" data-idx="${i - 1}" value="${valoreRep}">
          <span class="set-unit">rep</span>
        </div>
      `;
    }
    wrap.appendChild(row);
  }

  wrap.querySelectorAll("input[type=text]").forEach(inp => {
    inp.addEventListener("input", salvaValoriCorrenti);
  });
  wrap.querySelectorAll("input[type=checkbox]").forEach(inp => {
    inp.addEventListener("change", salvaValoriCorrenti);
  });
}

function salvaValoriCorrenti() {
  const corpoLibero = currentDettaglio.tipo.includes("corpo");
  if (corpoLibero) {
    const valori = [];
    document.querySelectorAll("#sets-inputs input[type=checkbox]").forEach(inp => {
      valori[parseInt(inp.dataset.idx)] = inp.checked ? "fatto" : "non fatto";
    });
    saveInput("valori", valori);
  } else {
    const valoriRep = [];
    document.querySelectorAll("#sets-inputs .rep-input").forEach(inp => {
      valoriRep[parseInt(inp.dataset.idx)] = inp.value;
    });
    const valoriKg = [];
    document.querySelectorAll("#sets-inputs .kg-input").forEach(inp => {
      valoriKg[parseInt(inp.dataset.idx)] = inp.value;
    });
    saveInput("valori", valoriRep);
    saveInput("valoriKg", valoriKg);
  }
}

document.getElementById("comment-input").addEventListener("input", e => {
  saveInput("commento", e.target.value);
});

// ============================================================
// TIMER DI RECUPERO CON SUONO
// ============================================================
let recInterval = null;
let recRunning = false;

function sbloccaAudio() {
  const audio = document.getElementById("beep-audio");
  if (!audio || audio.dataset.unlocked === "1") return;
  const volumeOriginale = audio.volume;
  audio.volume = 0;
  audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volumeOriginale;
    audio.dataset.unlocked = "1";
  }).catch(() => {});
}

function setupRecTimer(secondiTotali) {
  clearInterval(recInterval);
  recRunning = false;
  const btn = document.getElementById("timer-btn");
  const stopBtn = document.getElementById("timer-stop-btn");
  let tempoRimasto = secondiTotali;
  let avviato = false;

  function formatTempo(s) {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return h + ":" + m + ":" + sec;
  }

  function mostraIdle() {
    btn.innerHTML = "Avvia timer";
    btn.classList.remove("attivo");
    stopBtn.style.display = "none";
    stopBtn.classList.remove("attivo");
  }
  function mostraConteggio(inPausa) {
    const icona = inPausa
      ? '<span class="timer-icon-play"></span>'
      : '<span class="timer-icon-pause"><span></span><span></span></span>';
    btn.innerHTML = '<span class="timer-time">' + formatTempo(tempoRimasto) + '</span>' + icona;
    btn.classList.add("attivo");
    stopBtn.style.display = "flex";
    stopBtn.classList.add("attivo");
  }
  function avvia() {
    recRunning = true;
    mostraConteggio(false);
    recInterval = setInterval(() => {
      tempoRimasto -= 1;
      if (tempoRimasto <= 0) {
        clearInterval(recInterval);
        recRunning = false;
        avviato = false;
        tempoRimasto = secondiTotali;
        mostraIdle();
        suonaFineTimer();
      } else {
        mostraConteggio(false);
      }
    }, 1000);
  }
  function ferma() {
    clearInterval(recInterval);
    recRunning = false;
    avviato = false;
    tempoRimasto = secondiTotali;
    mostraIdle();
  }

  mostraIdle();

  btn.onclick = () => {
    sbloccaAudio();
    if (!avviato) {
      avviato = true;
      avvia();
    } else if (recRunning) {
      recRunning = false;
      clearInterval(recInterval);
      mostraConteggio(true);
    } else {
      avvia();
    }
  };

  stopBtn.onclick = ferma;
}

function suonaFineTimer() {
  const audio = document.getElementById("beep-audio");
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (e) {}
}

// ============================================================
// INVIO DATI VERSO GOOGLE SHEETS (Apps Script)
// ============================================================
function inviaModifica(giorno, gruppo, esercizio, descrizioneModifica) {
  inviaEvento({
    tipo: "Modifica scheda",
    blocco: currentBloccoNumero,
    giorno, gruppoMuscolare: gruppo, esercizio,
    commento: descrizioneModifica
  });
}

function inviaEvento(dati) {
  if (typeof APPS_SCRIPT_URL === "undefined" || !APPS_SCRIPT_URL) return;
  dati.cliente = clienteNome;
  try {
    navigator.sendBeacon(APPS_SCRIPT_URL, new Blob([JSON.stringify(dati)], { type: "application/json" }));
  } catch (e) {
    fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(dati) }).catch(() => {});
  }
}
