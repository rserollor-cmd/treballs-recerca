/**
 * Backend d'Apps Script per a "Seguiment del mòdul".
 *
 * QUÈ FA
 * Aquest script s'enganxa DIRECTAMENT al full de càlcul de Google Drive (cal crear-lo
 * des de dins del mateix full: Extensions > Apps Script). Un cop desplegat com a
 * aplicació web, l'eina seguiment-modul.html s'hi pot connectar per llegir les dades
 * sempre actualitzades, sense haver de baixar ni pujar cap fitxer .xlsx.
 *
 * IDENTIFICACIÓ — sense cap projecte de Google Cloud ni tocar OAuth. Cada persona
 * rep un ENLLAÇ PERSONAL amb un codi d'accés secret (una mena de contrasenya llarga
 * i intransferible):
 *   - El codi del professorat (TEACHER_CODE) dona accés al tauler complet.
 *   - Cada alumne/a té el seu propi codi (generat i enviat des del mateix full,
 *     veure el menú "Seguiment" que apareix en obrir-lo) i només rep LES SEVES dades.
 *   - Un codi que no coincideix amb res -> resposta d'error, mai dades d'altres persones.
 * Funciona igual sigui quin sigui el domini de correu de cadascú (útil quan, com aquí,
 * el professorat és d'un domini com @xtec.cat i l'alumnat d'un altre com el propi
 * de l'institut): el codi és el que dona accés, no el compte de Google.
 *
 * ATENCIÓ — SEGURETAT: TEACHER_CODE és una contrasenya. Un cop l'hagis posat aquí i
 * desplegat, NO tornis a pujar aquest fitxer amb el codi real a un repositori públic
 * (com GitHub) — deixa-hi sempre el valor de mostra. El fitxer que fa falta protegir
 * és el que queda desat DINS de l'editor d'Apps Script del teu full, no cap còpia
 * externa.
 *
 * CONFIGURACIÓ (edita només aquestes constants)
 */
const SHEET_NAME = "RESUM RAs";                 // pestanya amb les notes (p.ex. "AVALUACIÓ" o "RESUM RAs")
const THRESHOLD = 5;                            // nota mínima (/10) per considerar un RA "assolit"
const TEACHER_CODE = "CANVIA-AQUEST-CODI-PER-UN-DE-LLARG-I-SECRET"; // "contrasenya" del professorat
const ACCESS_SHEET_NAME = "Accés";              // pestanya on es guarden els codis de l'alumnat
const PAGE_URL = ""; // opcional: només si has publicat seguiment-modul.html en una URL real. Deixa-ho buit si el/la reps com a fitxer.
const EXEC_URL = ""; // ENGANXA AQUÍ la URL de "Desplega > Gestiona implementacions" (acaba en /exec).
                      // No la deixis en blanc: si Google la detecta sola de vegades dona una altra
                      // URL amb "/a/EL_TEU_DOMINI/" que no funciona per a comptes d'un altre domini.

/**
 * INSTRUCCIONS DE DESPLEGAMENT (fes-ho un sol cop) — detalls a apps-script/README.md
 * 1. Obre el full de càlcul a Google Sheets.
 * 2. Extensions > Apps Script. Esborra el codi d'exemple i enganxa TOT aquest fitxer.
 * 3. Edita les constants de dalt: SHEET_NAME i TEACHER_CODE (posa'n un de llarg
 *    i difícil d'endevinar). Deixa PAGE_URL buit si distribueixes tu mateix/a
 *    seguiment-modul.html (per Drive, correu, etc.) en lloc de publicar-lo en
 *    una pàgina web.
 * 4. Desa (icona de disquet).
 * 5. Desplega > Nova implementació > tipus "Aplicació web".
 *      - Executa com a: "Jo" (el propietari del full).
 *      - Qui té accés: "Anyone" (no cal restringir per domini: el codi és el que
 *        protegeix l'accés, no la identitat de Google).
 * 6. Autoritza els permisos que et demani Google. Copia la URL que acaba en "/exec".
 * 7. Torna a l'editor, enganxa aquesta URL a la constant EXEC_URL (a dalt del
 *    tot) i desa de nou. NO confiïs en què l'script la detecti sol: en comptes
 *    de comparar, digues-li exactament quina és.
 * 8. Torna al full de càlcul (recarrega'l si cal) — hi apareixerà un menú nou
 *    "Seguiment". Fes clic a "1. Genera codis d'accés" i després a "2. Envia
 *    enllaços per correu": cada alumne/a rebrà un correu amb EXEC_URL i el
 *    seu codi personal, per enganxar a seguiment-modul.html. El teu propi
 *    accés (professorat) és la mateixa EXEC_URL amb el codi TEACHER_CODE.
 * 9. Envia tu mateix/a (Classroom, correu com a adjunt manual, etc.) el fitxer
 *    seguiment-modul.html a tot l'alumnat — un cop n'hi ha prou, no cal repetir-ho
 *    quan actualitzis notes: l'eina llegeix el full en directe cada vegada.
 * 10. Cada vegada que canviïs el codi, torna a "Gestiona implementacions" i puja
 *     una nova versió (si no, els canvis no es veuran reflectits). L'EXEC_URL
 *     no sol canviar quan puges una versió nova de la MATEIXA implementació.
 */

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  const code = e && e.parameter && e.parameter.code;
  let payload;
  try {
    const identity = resolveIdentity_(code);
    payload = identity.error ? identity : (identity.role === "teacher" ? buildFullPayload_() : buildMePayload_(identity.email));
  } catch (err) {
    payload = { error: "exception", message: String(err) };
  }
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Determina qui truca a partir del codi d'accés rebut a la URL. */
function resolveIdentity_(code) {
  if (!code) {
    return { error: "no-auth", message: "Falta el codi d'accés personal a l'enllaç." };
  }
  if (code === TEACHER_CODE) {
    return { role: "teacher" };
  }
  const email = lookupCodeEmail_(code);
  if (!email) {
    return { error: "not-found", message: "Aquest codi d'accés no és vàlid. Demana'l de nou al/la professor/a." };
  }
  return { role: "student", email };
}

function lookupCodeEmail_(code) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCESS_SHEET_NAME);
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][2] || "").trim() === code) return normEmail_(rows[r][0]);
  }
  return null;
}

function normEmail_(s) { return String(s || "").trim().toLowerCase(); }

/* ============ MENÚ I GESTIÓ DE CODIS D'ACCÉS ============ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Seguiment")
    .addItem("1. Genera codis d'accés", "generarCodisAccess")
    .addItem("2. Envia enllaços per correu", "enviaEnllacosPersonalitzats")
    .addToUi();
}

/** Crea (si cal) la pestanya "Accés" i assigna un codi nou a qui encara no en tingui. */
function generarCodisAccess() {
  const data = loadData_();
  let sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCESS_SHEET_NAME);
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(ACCESS_SHEET_NAME);
    sh.appendRow(["Correu", "Nom", "Codi"]);
  }
  const rows = sh.getDataRange().getValues();
  const existing = {};
  for (let r = 1; r < rows.length; r++) { if (rows[r][0]) existing[normEmail_(rows[r][0])] = { row: r + 1, code: rows[r][2] }; }
  let added = 0; const missingEmail = [];
  data.students.forEach(s => {
    if (!s.email) { missingEmail.push(s.fullName); return; }
    const key = normEmail_(s.email);
    if (existing[key] && existing[key].code) return;
    const code = generateCode_();
    if (existing[key]) sh.getRange(existing[key].row, 3).setValue(code);
    else sh.appendRow([s.email, s.fullName, code]);
    added++;
  });
  const msg = "S'han generat " + added + " codis nous."
    + (missingEmail.length ? "\n\nSense correu detectat (no se'ls pot enviar enllaç fins que n'hi hagi): " + missingEmail.join(", ") : "");
  SpreadsheetApp.getUi().alert(msg);
}

function generateCode_() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sense caràcters ambigus (0/O, 1/I/L)
  let s = ""; for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Envia per correu, a qui tingui un codi a la pestanya "Accés", la URL de
 * l'aplicatiu i el seu codi personal (per separat i curts, perquè no es
 * trenquin en copiar-los). Si PAGE_URL té valor, també hi afegeix l'enllaç
 * combinat que connecta sol; si no, només cal enganxar els dos valors a
 * seguiment-modul.html.
 */
function enviaEnllacosPersonalitzats() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCESS_SHEET_NAME);
  if (!sh) { SpreadsheetApp.getUi().alert("Primer genera els codis (menú Seguiment > 1. Genera codis d'accés)."); return; }
  if (!EXEC_URL) { SpreadsheetApp.getUi().alert("Falta EXEC_URL: enganxa a la constant EXEC_URL (a dalt del codi) la URL de Desplega > Gestiona implementacions abans d'enviar correus."); return; }
  const execUrl = EXEC_URL;
  const rows = sh.getDataRange().getValues();
  let sent = 0;
  for (let r = 1; r < rows.length; r++) {
    const email = rows[r][0], nom = rows[r][1], code = rows[r][2];
    if (!email || !code) continue;
    let plain = "Hola " + nom + ",\n\n"
      + "Per consultar el teu seguiment del mòdul, obre el fitxer seguiment-modul.html "
      + "que t'ha donat el/la professor/a i enganxa-hi aquests dos valors:\n\n"
      + "URL de l'aplicatiu:\n" + execUrl + "\n\n"
      + "El teu codi d'accés:\n" + code + "\n\n";
    let html = "<p>Hola " + nom + ",</p>"
      + "<p>Per consultar el teu seguiment del mòdul, obre el fitxer <b>seguiment-modul.html</b> "
      + "que t'ha donat el/la professor/a i enganxa-hi aquests dos valors:</p>"
      + "<p><b>URL de l'aplicatiu:</b><br><code>" + execUrl + "</code></p>"
      + "<p><b>El teu codi d'accés:</b><br><code>" + code + "</code></p>";
    if (PAGE_URL) {
      const link = PAGE_URL + "?api=" + encodeURIComponent(execUrl) + "&code=" + encodeURIComponent(code);
      plain += "També pots fer clic directament en aquest enllaç:\n" + link + "\n\n";
      html += "<p>També pots fer clic directament en aquest enllaç: <a href=\"" + link + "\">" + link + "</a></p>";
    }
    plain += "És personal i intransferible: no el comparteixis amb ningú.\n";
    html += "<p>És personal i intransferible: no el comparteixis amb ningú.</p>";
    MailApp.sendEmail(email, "El teu accés al seguiment del mòdul", plain, { htmlBody: html });
    sent++;
  }
  SpreadsheetApp.getUi().alert("S'han enviat " + sent + " correus.");
}

function buildFullPayload_() {
  const data = loadData_();
  return {
    ok: true, role: "teacher",
    subject: data.courseName, sheetUsed: data.sheetUsed, threshold: THRESHOLD,
    raGroups: data.raGroups.map(g => ({ id: g.id, code: g.code, label: g.label, tasks: g.tasks.map(t => ({ name: t.name, weight: t.weight })) })),
    classRaAvg: data.classRaAvg, classGlobal: data.classGlobal,
    students: data.students.map(stripInternal_),
  };
}

function buildMePayload_(email) {
  const data = loadData_();
  const st = data.students.find(s => s.email && s.email === email);
  if (!st) return { error: "not-found", message: "No s'ha trobat cap alumne/a amb aquest correu al full de notes." };
  return {
    ok: true, role: "student",
    subject: data.courseName, threshold: THRESHOLD,
    raGroups: data.raGroups.map(g => ({ id: g.id, code: g.code, label: g.label, tasks: g.tasks.map(t => ({ name: t.name, weight: t.weight })) })),
    classRaAvg: data.classRaAvg,
    student: stripInternal_(st),
  };
}

function stripInternal_(s) {
  return {
    fullName: s.fullName, raScore: s.raScore, taskVals: s.taskVals,
    global: s.global, globalEff: s.globalEff, globalIsFallback: s.globalIsFallback, assolit: s.assolit,
    recovery: s.recovery, observations: s.observations,
    attendance: s.attendance, material: s.material, compromis: s.compromis, incidents: s.incidents,
  };
}

/* ============ LECTURA I ANÀLISI DEL FULL (mateixa lògica que l'app local) ============ */
function clean_(s) { return String(s == null ? "" : s).replace(/[​‌‍﻿]/g, "").replace(/\s+/g, " ").trim(); }
function toNum_(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (/^#/.test(s)) return null;
  const pm = s.match(/(-?[\d.,]+)\s*%/);
  if (pm) { const n = parseFloat(pm[1].replace(",", ".")); return isNaN(n) ? null : n / 100; }
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}
function normName_(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function nameTokens_(s) { return normName_(s).split(" ").filter(Boolean); }
function namesMatch_(a, b) {
  const ta = new Set(nameTokens_(a)), tb = nameTokens_(b);
  if (!ta.size || !tb.length) return false;
  let hit = 0; tb.forEach(t => { if (ta.has(t)) hit++; });
  return hit >= Math.min(ta.size, tb.length) && hit / Math.max(ta.size, tb.length) >= 0.5;
}
function sheetRows_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh ? sh.getDataRange().getValues() : null;
}
function findRow_(rows, test) { for (let r = 0; r < rows.length; r++) { if (test(rows[r] || [])) return r; } return -1; }
function findRaTitleRow_(rows) {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const row = rows[r] || []; let hasRA = false, hasTotal = false;
    row.forEach(c => { const t = clean_(c); if (/^ra\s*\d/i.test(t)) hasRA = true; if (/^total/i.test(t)) hasTotal = true; });
    if (hasRA && hasTotal) return r;
  }
  return -1;
}
function parseRaSheet_(rows, titleRowIdx) {
  const titleRow = rows[titleRowIdx] || [], tasksRow = rows[titleRowIdx + 1] || [], weightsRow = rows[titleRowIdx + 3] || [];
  const dataStart = titleRowIdx + 4;
  const ncols = Math.max(titleRow.length, tasksRow.length, weightsRow.length);
  let raGroups = [], current = null, globalCol = null, recoveryCol = null, obsCol = null, emailCol = null, seenFirstRA = false;
  for (let c = 2; c < ncols; c++) {
    const t = clean_(titleRow[c]);
    if (/^ra\s*\d/i.test(t)) {
      seenFirstRA = true;
      if (current) raGroups.push(current);
      const codeMatch = t.match(/^ra\s*\d+/i);
      current = { id: "RA" + (raGroups.length + 1), code: (codeMatch ? codeMatch[0].replace(/\s+/g, "") : "RA" + (raGroups.length + 1)).toUpperCase(), label: t, tasks: [], totalCol: null };
    } else if (current && /total/i.test(t)) {
      current.totalCol = c; raGroups.push(current); current = null; continue;
    } else if (!current && seenFirstRA && /^total\b/i.test(t) && !/ra/i.test(t)) { globalCol = c; continue; }
    else if (/recuperar/i.test(t)) { recoveryCol = c; continue; }
    else if (/observ/i.test(t)) { obsCol = c; continue; }
    else if (!seenFirstRA) {
      const lbl = clean_(titleRow[c]) || clean_(tasksRow[c]) || clean_(weightsRow[c]);
      if (/correu|email/i.test(lbl)) emailCol = c;
    }
    if (current) { const tn = clean_(tasksRow[c]); if (tn) current.tasks.push({ name: tn, weight: toNum_(weightsRow[c]), col: c }); }
  }
  const students = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    const cognoms = clean_(row[0]), nom = clean_(row[1]);
    if (!cognoms && !nom) continue;
    const st = { idx: students.length, cognoms, nom, fullName: (nom + " " + cognoms).trim(), email: emailCol != null ? clean_(row[emailCol]).toLowerCase() : "", raScore: {}, taskVals: {} };
    raGroups.forEach(g => {
      st.taskVals[g.id] = g.tasks.map(tk => toNum_(row[tk.col]));
      st.raScore[g.id] = g.totalCol != null ? toNum_(row[g.totalCol]) : null;
    });
    st.global = globalCol != null ? toNum_(row[globalCol]) : null;
    st.recovery = recoveryCol != null ? clean_(row[recoveryCol]) : "";
    st.observations = obsCol != null ? clean_(row[obsCol]) : "";
    students.push(st);
  }
  return { raGroups, globalCol, recoveryCol, obsCol, emailCol, students };
}
function parseAssistencia_(rows) {
  const hdr = findRow_(rows, row => row.some(c => /total\s*absentisme/i.test(clean_(c))));
  if (hdr < 0) return null;
  let absCol = null, perduaCol = null;
  (rows[hdr] || []).forEach((c, i) => { const t = clean_(c); if (/total\s*absentisme/i.test(t)) absCol = i; if (/p[eè]rdua/i.test(t)) perduaCol = i; });
  const dataStart = hdr + 3, list = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []; if (row[0] == null || row[0] === "") continue;
    list.push({ absences: absCol != null ? (toNum_(row[absCol]) || 0) : null, lost: perduaCol != null ? /^s[ií]$/i.test(clean_(row[perduaCol])) : false });
  }
  return list;
}
function parseCompromis_(rows) {
  const hdr = findRow_(rows, row => { const t = row.map(clean_); return t.some(x => /^bon$/i.test(x)) && t.some(x => /^millorar$/i.test(x)) && t.some(x => /^sense$/i.test(x)); });
  if (hdr < 0) return null;
  let bonCol, millCol, senseCol, compCol, assistCol, totCol;
  (rows[hdr] || []).forEach((v, i) => { const t = clean_(v);
    if (/^bon$/i.test(t)) bonCol = i; else if (/^millorar$/i.test(t)) millCol = i; else if (/^sense$/i.test(t)) senseCol = i;
    else if (/^compromís/i.test(t)) compCol = i; else if (/^assist[eè]ncia$/i.test(t)) assistCol = i; else if (/^total$/i.test(t)) totCol = i; });
  const dataStart = hdr + 2, list = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []; const nom = clean_(row[1]);
    if (row[0] == null || row[0] === "") continue;
    list.push({ nom, bon: toNum_(row[bonCol]), millorar: toNum_(row[millCol]), sense: toNum_(row[senseCol]), compromisScore: toNum_(row[compCol]), assistenciaScore: toNum_(row[assistCol]), total: toNum_(row[totCol]) });
  }
  return list;
}
function parseMaterial_(rows) {
  const hdr = findRow_(rows, row => row.some(v => /^mitjana$/i.test(clean_(v))));
  if (hdr < 0) return null;
  let mitjanaCol = null;
  (rows[hdr] || []).forEach((v, i) => { if (/^mitjana$/i.test(clean_(v))) mitjanaCol = i; });
  const dataStart = hdr + 2, list = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []; const nom = clean_(row[0]);
    if (!nom) continue;
    list.push({ nom, mitjana: mitjanaCol != null ? toNum_(row[mitjanaCol]) : null });
  }
  return list;
}
function parseIncidencies_(rows) {
  const hdr = findRow_(rows, row => row.some(v => /nom.*alumne/i.test(clean_(v))));
  if (hdr < 0) return null;
  let dateCol, nameCol, posCol, negCol, reasonCol, typeCol;
  (rows[hdr] || []).forEach((v, i) => { const t = clean_(v);
    if (/^data/i.test(t)) dateCol = i; else if (/nom.*alumne/i.test(t)) nameCol = i;
    else if (/positiva/i.test(t)) posCol = i; else if (/negativa/i.test(t)) negCol = i;
    else if (/motiu/i.test(t)) reasonCol = i; else if (/tipus/i.test(t)) typeCol = i; });
  const dataStart = hdr + 1, list = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []; const name = clean_(row[nameCol]);
    if (!name) continue;
    list.push({ name, date: row[dateCol] instanceof Date ? row[dateCol].toISOString() : row[dateCol], positive: !!toNum_(row[posCol]), negative: !!toNum_(row[negCol]), reason: clean_(row[reasonCol]), type: clean_(row[typeCol]) });
  }
  return list;
}
function parseContacte_(rows) {
  const hdr = findRow_(rows, row => row.some(v => /^alumne\/a$/i.test(clean_(v))));
  if (hdr < 0) return null;
  let nameCol = null, emailCol = null;
  (rows[hdr] || []).forEach((v, i) => { const t = clean_(v); if (/^alumne\/a$/i.test(t)) nameCol = i; if (/adre[çc]a electr[oò]nica alumne/i.test(t)) emailCol = i; });
  if (emailCol == null) return null;
  const dataStart = hdr + 1, map = {};
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []; const name = clean_(row[nameCol]), email = clean_(row[emailCol]);
    if (name && email) map[normName_(name)] = email.toLowerCase();
  }
  return map;
}

/**
 * Pestanya senzilla de correus fet a mida (p.ex. "Correus"): columnes Cognoms,
 * Nom(s) i Correu (mateix ordre que la pestanya de notes). Es detecta buscant
 * qualsevol pestanya amb una capçalera que tingui "Cognoms" i "Correu"/"Email",
 * independentment de com s'anomeni la pestanya. Retorna un mapa
 * "cognoms|nom" (normalitzat) -> correu, i també la llista en ordre de fila
 * (per si cal repescar per posició).
 */
function findCorreusSheet_() {
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (const sh of sheets) {
    const rows = sh.getDataRange().getValues();
    const hdr = findRow_(rows, row => {
      const t = row.map(clean_);
      return t.some(x => /^cognoms$/i.test(x)) && t.some(x => /^(correu|email|correu electr[oò]nic)$/i.test(x));
    });
    if (hdr >= 0) return { rows, hdr };
  }
  return null;
}
function parseCorreusSheet_() {
  const found = findCorreusSheet_();
  if (!found) return null;
  const { rows, hdr } = found;
  let cognomsCol = null, nomCol = null, correuCol = null;
  (rows[hdr] || []).forEach((v, i) => { const t = clean_(v);
    if (/^cognoms$/i.test(t)) cognomsCol = i;
    else if (/^noms?$/i.test(t)) nomCol = i;
    else if (/^(correu|email|correu electr[oò]nic)$/i.test(t)) correuCol = i;
  });
  const dataStart = hdr + 1, map = {}, list = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    const cognoms = clean_(row[cognomsCol]), nom = nomCol != null ? clean_(row[nomCol]) : "", email = clean_(row[correuCol]);
    if (!cognoms && !nom) continue;
    list.push(email ? email.toLowerCase() : "");
    if (email) map[normName_(cognoms) + "|" + normName_(nom)] = email.toLowerCase();
  }
  return { map, list };
}

function loadData_() {
  const rows = sheetRows_(SHEET_NAME);
  if (!rows) throw new Error("No s'ha trobat la pestanya «" + SHEET_NAME + "». Revisa la constant SHEET_NAME.");
  const tr = findRaTitleRow_(rows);
  if (tr < 0) throw new Error("La pestanya «" + SHEET_NAME + "» no té l'estructura esperada (RA / TOTAL RA).");
  const ra = parseRaSheet_(rows, tr);
  const sheetNames = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());

  let titleCell = "";
  for (let r = 0; r < 3; r++) { const v = clean_((rows[r] || [])[0]); if (v) { titleCell = v; break; } }

  const attendance = sheetNames.indexOf("Assistència") >= 0 ? parseAssistencia_(sheetRows_("Assistència")) : null;
  const compromis = sheetNames.indexOf("Compromís i professionalitat") >= 0 ? parseCompromis_(sheetRows_("Compromís i professionalitat")) : null;
  const material = sheetNames.indexOf("Material") >= 0 ? parseMaterial_(sheetRows_("Material")) : null;
  const incidents = sheetNames.indexOf("Incidències") >= 0 ? parseIncidencies_(sheetRows_("Incidències")) : null;
  const contacteMap = sheetNames.indexOf("Contacte") >= 0 ? parseContacte_(sheetRows_("Contacte")) : null;
  const correus = parseCorreusSheet_();

  function bestNameIndex(list, nom) {
    if (!list) return -1;
    let exact = -1, ambiguous = false;
    list.forEach((it, i) => { if (it.nom && normName_(it.nom) === normName_(nom)) { if (exact >= 0) ambiguous = true; exact = i; } });
    return (exact >= 0 && !ambiguous) ? exact : -1;
  }

  ra.students.forEach((s, i) => {
    s.attIdx = attendance && attendance[i] ? i : -1;
    s.matIdx = material ? bestNameIndex(material, s.nom) : -1;
    if (s.matIdx < 0 && material && material[i]) s.matIdx = i;
    s.compIdx = compromis ? bestNameIndex(compromis, s.nom) : -1;
    if (s.compIdx < 0 && compromis && compromis[i]) s.compIdx = i;
    if (!s.email && correus) {
      const key = normName_(s.cognoms) + "|" + normName_(s.nom);
      if (correus.map[key]) s.email = correus.map[key];
      else if (correus.list[i]) s.email = correus.list[i];
    }
    if (!s.email && contacteMap) {
      const key = Object.keys(contacteMap).filter(k => namesMatch_(k, s.fullName))[0];
      if (key) s.email = contacteMap[key];
    }
    s.incidents = incidents ? incidents.filter(inc => namesMatch_(inc.name, s.fullName)) : [];
    s.attendance = (attendance && s.attIdx >= 0) ? attendance[s.attIdx] : null;
    s.material = (material && s.matIdx >= 0) ? material[s.matIdx] : null;
    s.compromis = (compromis && s.compIdx >= 0) ? compromis[s.compIdx] : null;
    const vals = ra.raGroups.map(g => s.raScore[g.id]).filter(v => v != null);
    s.globalEff = s.global != null ? s.global : (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    s.globalIsFallback = s.global == null && vals.length > 0;
    s.assolit = s.globalEff != null ? s.globalEff >= THRESHOLD : null;
  });

  const classRaAvg = {};
  ra.raGroups.forEach(g => {
    const vs = ra.students.map(s => s.raScore[g.id]).filter(v => v != null);
    classRaAvg[g.id] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  });
  const gv = ra.students.map(s => s.globalEff).filter(v => v != null);
  const classGlobal = gv.length ? gv.reduce((a, b) => a + b, 0) / gv.length : null;

  return { courseName: titleCell || SHEET_NAME, sheetUsed: SHEET_NAME, raGroups: ra.raGroups, students: ra.students, classRaAvg, classGlobal };
}
