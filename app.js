// ============================================================
// STATO GLOBALE
// ============================================================
let clienteNome = "";
let clienteCsvUrl = "";
let esercizi = [];        // righe grezze del foglio del cliente
let archivio = {};        // nome esercizio -> {video, descrizione, alternative[]}
let fotoGruppi = {};      // gruppo muscolare -> url foto
let giorni = [];          // elenco ordinato dei giorni
let currentGiorno = null;
let currentDettaglio = null; // {giorno, gruppo, esercizio, ...}
let editState = {};       // salvato in localStorage, per cliente

// ============================================================
// AVVIO
// ============================================================
window.addEventListener("DOMContentLoaded", init);

async function init() {
  const params = new URLSearchParams(window.location.search);
  clienteCsvUrl = params.get("data");
  clienteNome = params.get("cliente") || "";

  if (clienteCsvUrl) {
    // primo accesso da browser: salvo per quando l'app viene riaperta dall'icona
    localStorage.setItem("gm_ultimo_link", JSON.stringify({ data: clienteCsvUrl, cliente: clienteNome }));
  } else {
    // riapertura dall'icona: il telefono spesso perde i parametri dopo "?"
    // recupero l'ultimo link salvato la prima volta
    const ultimo = localStorage.getItem("gm_ultimo_link");
    if (ultimo) {
      const obj = JSON.parse(ultimo);
      clienteCsvUrl = obj.data;
      clienteNome = obj.cliente;
    }
  }

  if (!clienteCsvUrl) {
    showScreen("screen-error");
    document.getElementById("error-message").textContent =
      "Manca il collegamento alla tua scheda. Apri prima il link ricevuto dal tuo personal trainer da un browser (non dall'icona), poi salvalo sulla home.";
    return;
  }

  try {
    const [datiCliente, datiArchivio, datiFoto] = await Promise.all([
      fetchCsv(clienteCsvUrl),
      fetchCsv(ARCHIVIO_CSV_URL),
      fetchCsv(FOTO_CSV_URL)
    ]);

    esercizi = datiCliente.filter(r => r.Esercizio && r.Esercizio.trim() !== "");
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
    checkAccess();
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
// ACCESSO
// ============================================================
function storageKey(suffix) {
  return "gm_palestra_" + btoa(clienteCsvUrl).slice(0, 40) + "_" + suffix;
}

function checkAccess() {
  const saved = localStorage.getItem(storageKey("accesso"));
  if (saved === "ok") {
    afterAccessGranted();
    return;
  }
  showScreen("screen-access");
  document.getElementById("access-title").textContent =
    clienteNome ? ("Benvenuto " + clienteNome) : "Benvenuto";

  document.getElementById("access-submit").onclick = () => {
    const inserted = document.getElementById("access-code-input").value.trim();
    const codiceValido = (esercizi[0] && esercizi[0].Codice) ? esercizi[0].Codice.trim() : "";
    if (codiceValido && inserted === codiceValido) {
      localStorage.setItem(storageKey("accesso"), "ok");
      afterAccessGranted();
    } else {
      document.getElementById("access-error").textContent = "Codice non corretto, riprova.";
    }
  };
}

function afterAccessGranted() {
  document.getElementById("greeting-text").textContent = clienteNome ? ("Ciao " + clienteNome) : "Ciao";
  buildGiorni();
  showScreen("screen-categorie");
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
    // se stiamo uscendo dal dettaglio, invia i risultati di quell'esercizio
    if (back.dataset.back === "screen-esercizi" && currentDettaglio) {
      inviaRisultatoCorrente();
    }
    showScreen(back.dataset.back);
  }
  const catCard = e.target.closest(".category-card");
  if (catCard && catCard.dataset.category === "palestra") {
    showScreen("screen-giorni");
  }
});

// invia anche se il cliente chiude/esce dall'app mentre è nel dettaglio
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && currentDettaglio) {
    inviaRisultatoCorrente();
  }
});

// ============================================================
// GIORNI
// ============================================================
function buildGiorni() {
  giorni = [];
  esercizi.forEach(r => {
    if (r.Giorno && !giorni.includes(r.Giorno)) giorni.push(r.Giorno);
  });

  const list = document.getElementById("day-list");
  list.innerHTML = "";
  giorni.forEach(giorno => {
    const rows = esercizi.filter(r => r.Giorno === giorno);
    const gruppi = [...new Set(rows.map(r => r["Gruppo muscolare"]).filter(Boolean))];
    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-icon-box">&#127947;</div>
      <div class="day-info">
        <p class="day-name">${giorno} - ${gruppi.join(" e ")}</p>
        <p class="day-sub">${rows.length} esercizi</p>
      </div>
      <span class="day-arrow">&#8250;</span>
    `;
    card.addEventListener("click", () => openGiorno(giorno));
    list.appendChild(card);
  });
}

function openGiorno(giorno) {
  currentGiorno = giorno;
  const rows = esercizi.filter(r => r.Giorno === giorno);
  const gruppi = [...new Set(rows.map(r => r["Gruppo muscolare"]).filter(Boolean))];

  document.getElementById("day-header-title").textContent = giorno;
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
  showScreen("screen-esercizi");
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

      // esercizi aggiunti manualmente (sostituzioni o aggiunte)
      elencoAggiunti(giorno, gruppo).forEach(agg => {
        const chiave = chiaveEsercizio(giorno, gruppo, agg.esercizio);
        listWrap.appendChild(renderRigaEsercizio(agg, giorno, gruppo, chiave, false, editMode, () => draw()));
      });

      // suggerimenti (solo in modalità modifica)
      if (editMode) {
        const attivi = new Set([
          ...originali.filter(ex => !isRimosso(chiaveEsercizio(giorno, gruppo, ex.Esercizio))).map(ex => ex.Esercizio),
          ...elencoAggiunti(giorno, gruppo).map(a => a.esercizio)
        ]);
        const suggerimenti = raccogliSuggerimenti(originali, attivi);
        suggerimenti.forEach(sugg => {
          const row = document.createElement("div");
          row.className = "suggestion-row";
          row.innerHTML = `
            <div>
              <p class="exercise-name">${sugg.esercizio}</p>
              <p class="exercise-sub">${sugg.Serie} x ${sugg.Ripetizioni}</p>
            </div>
            <span class="icon-add">&#8853;</span>
          `;
          row.addEventListener("click", () => {
            aggiungiEsercizio(giorno, gruppo, sugg);
            draw();
          });
          listWrap.appendChild(row);
        });
      }
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
  const serie = ex.Serie, rip = ex.Ripetizioni;

  let iconsHtml;
  if (!editMode) {
    iconsHtml = `<span class="exercise-chevron">&#8250;</span>`;
  } else if (bloccato) {
    iconsHtml = `<div class="edit-icons"><span class="icon-btn icon-lock-sm">&#128274;</span></div>`;
  } else {
    iconsHtml = `<div class="edit-icons">
      <span class="icon-btn icon-replace" data-action="sostituisci">&#8635;</span>
      <span class="icon-btn icon-remove" data-action="togli">&minus;</span>
    </div>`;
  }

  row.innerHTML = `
    <div>
      <p class="exercise-name">${nome}</p>
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
    row.querySelector('[data-action="togli"]').addEventListener("click", ev => {
      ev.stopPropagation();
      togliEsercizio(giorno, gruppo, nome, ex);
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
function apriDettaglio(ex, giorno, gruppo) {
  const nome = ex.Esercizio || ex.esercizio;
  const info = archivio[nome.trim()] || { video: "", descrizione: "" };
  currentDettaglio = {
    giorno, gruppo, esercizio: nome,
    serie: parseInt(ex.Serie) || 0,
    ripetizioni: ex.Ripetizioni,
    recupero: parseInt(ex.Recupero) || 0,
    tipo: (ex.Tipo || "pesi").toLowerCase(),
    valori: [] // riempito sotto
  };

  document.getElementById("detail-name-top").textContent = nome;
  document.getElementById("detail-name").textContent = nome;
  document.getElementById("desc-text").textContent = info.descrizione || "Nessuna descrizione disponibile.";
  document.getElementById("desc-text").style.display = "none";
  document.getElementById("desc-chevron").classList.remove("open");

  document.getElementById("video-box").innerHTML = info.video
    ? `<iframe src="${toEmbedUrl(info.video)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`
    : `<div class="video-placeholder"></div>`;

  document.getElementById("detail-sets-reps").textContent = currentDettaglio.serie + " x " + currentDettaglio.ripetizioni;

  renderSetsInputs();
  setupRecTimer(currentDettaglio.recupero);

  const savedComment = getSavedInput("commento") || "";
  document.getElementById("comment-input").value = savedComment;

  showScreen("screen-dettaglio");
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
  return dett.giorno + "|" + dett.gruppo + "|" + dett.esercizio;
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
  const savedValori = getSavedInput("valori") || [];
  const savedModo = getSavedInput("modo") || "kg";
  currentDettaglio.modo = corpoLibero ? "spuntato" : savedModo;

  for (let i = 1; i <= currentDettaglio.serie; i++) {
    const row = document.createElement("div");
    row.className = "set-row";

    if (corpoLibero) {
      const checked = savedValori[i - 1] === "fatto" ? "checked" : "";
      row.innerHTML = `
        <span class="set-label">Serie ${i}</span>
        <div class="set-input-group">
          <input type="checkbox" class="set-checkbox" data-idx="${i - 1}" ${checked}>
        </div>
      `;
    } else {
      const valore = savedValori[i - 1] || "";
      row.innerHTML = `
        <span class="set-label">Serie ${i}</span>
        <div class="set-input-group">
          ${i === 1 ? `<span class="set-switch" id="switch-modo">${currentDettaglio.modo === "kg" ? "Kg" : "Rep"}</span>` : ""}
          <input type="text" inputmode="numeric" placeholder="0" data-idx="${i - 1}" value="${valore}">
          ${i === 1 ? "" : `<span class="set-unit">${currentDettaglio.modo === "kg" ? "kg" : "rep"}</span>`}
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

  const switchBtn = document.getElementById("switch-modo");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      currentDettaglio.modo = currentDettaglio.modo === "kg" ? "rep" : "kg";
      saveInput("modo", currentDettaglio.modo);
      renderSetsInputs();
    });
  }
}

function salvaValoriCorrenti() {
  const corpoLibero = currentDettaglio.tipo.includes("corpo");
  const valori = [];
  if (corpoLibero) {
    document.querySelectorAll("#sets-inputs input[type=checkbox]").forEach(inp => {
      valori[parseInt(inp.dataset.idx)] = inp.checked ? "fatto" : "non fatto";
    });
  } else {
    document.querySelectorAll("#sets-inputs input[type=text]").forEach(inp => {
      valori[parseInt(inp.dataset.idx)] = inp.value;
    });
  }
  saveInput("valori", valori);
}

document.getElementById("comment-input").addEventListener("input", e => {
  saveInput("commento", e.target.value);
});

// ============================================================
// TIMER DI RECUPERO CON SUONO
// ============================================================
let recInterval = null;
let recRunning = false;

function setupRecTimer(secondiTotali) {
  clearInterval(recInterval);
  recRunning = false;
  const btn = document.getElementById("rec-btn");
  const text = document.getElementById("rec-text");
  const icon = document.getElementById("rec-icon");
  let tempoRimasto = secondiTotali;

  icon.innerHTML = `<span class="play-tri"></span>`;
  text.textContent = "Rec " + secondiTotali + "''";

  btn.onclick = () => {
    if (!recRunning) {
      recRunning = true;
      icon.innerHTML = `<span class="pause-bars" style="display:flex;"><span></span><span></span></span>`;
      recInterval = setInterval(() => {
        tempoRimasto -= 1;
        if (tempoRimasto <= 0) {
          clearInterval(recInterval);
          recRunning = false;
          tempoRimasto = secondiTotali;
          text.textContent = "Rec " + secondiTotali + "''";
          icon.innerHTML = `<span class="play-tri"></span>`;
          suonaFineTimer();
        } else {
          text.textContent = "Rec " + tempoRimasto + "''";
        }
      }, 1000);
    } else {
      recRunning = false;
      clearInterval(recInterval);
      icon.innerHTML = `<span class="play-tri"></span>`;
    }
  };
}

function suonaFineTimer() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1046].forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      }, i * 250);
    });
  } catch (e) {}
}

// ============================================================
// INVIO DATI VERSO GOOGLE SHEETS (Apps Script)
// ============================================================
function inviaRisultatoCorrente() {
  if (!currentDettaglio) return;
  if (typeof APPS_SCRIPT_URL === "undefined" || !APPS_SCRIPT_URL) {
    currentDettaglio = null;
    return;
  }
  const valori = getSavedInput("valori") || [];
  const modo = currentDettaglio.modo;
  let serieRipetizioni = currentDettaglio.serie + "x" + currentDettaglio.ripetizioni;
  let kg = "", rep = "";
  if (currentDettaglio.tipo.includes("corpo")) {
    kg = valori.join("-");
  } else if (modo === "kg") {
    kg = valori.join("-");
  } else {
    rep = valori.join("-");
  }
  const commento = getSavedInput("commento") || "";

  inviaEvento({
    tipo: "Allenamento",
    giorno: currentDettaglio.giorno,
    gruppoMuscolare: currentDettaglio.gruppo,
    esercizio: currentDettaglio.esercizio,
    serieRipetizioni,
    kg, rep,
    commento
  });

  currentDettaglio = null;
}

function inviaModifica(giorno, gruppo, esercizio, descrizioneModifica) {
  inviaEvento({
    tipo: "Modifica scheda",
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
