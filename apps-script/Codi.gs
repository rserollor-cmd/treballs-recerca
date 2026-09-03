/**
 * Backend d'Apps Script per a "Seguiment del mòdul".
 *
 * QUÈ FA
 * Aquest script s'enganxa DIRECTAMENT al full de càlcul de Google Drive (cal crear-lo
 * des de dins del mateix full: Extensions > Apps Script). Un cop desplegat com a
 * aplicació web, l'eina seguiment-modul.html s'hi pot connectar per llegir les dades
 * sempre actualitzades, sense haver de baixar ni pujar cap fitxer .xlsx.
 *
 * Cada persona que hi accedeix s'identifica amb el SEU compte de Google — no calen
 * contrasenyes ni introduir cap correu a mà:
 *   - Si el correu és a TEACHER_EMAILS -> pot demanar les dades de TOTA la classe.
 *   - Si el correu coincideix amb el d'un alumne/a -> només rep LES SEVES dades.
 *   - Si no coincideix amb res -> resposta d'error, mai dades d'altres persones.
 *
 * DOS MODES D'IDENTIFICACIÓ (tria el que et calgui a CLIENT_ID més avall)
 *   A) Un sol domini Google Workspace (senzill): si QUI POSSEEIX el full i TOT
 *      l'alumnat són del mateix domini (p.ex. tots @elteudomini.cat), deixa
 *      CLIENT_ID buit ("") i desplega amb «Qui té accés: Anyone within [domini]».
 *      Google identifica sol qui truca (Session.getActiveUser()).
 *   B) Dominis diferents (p.ex. professorat @xtec.cat, alumnat @elteuinstitut.cat):
 *      l'opció "dins del domini" només en permet UN. Cal fer «Inicia sessió amb
 *      Google» des de la pàgina web (OAuth) i verificar aquí el testimoni (token)
 *      rebut — funciona amb qualsevol combinació de dominis. Omple CLIENT_ID amb
 *      el teu OAuth Client ID (veute apps-script/README.md) i desplega amb «Qui
 *      té accés: Anyone».
 *
 * CONFIGURACIÓ (edita només aquestes constants)
 */
const SHEET_NAME = "RESUM RAs";                 // pestanya amb les notes (p.ex. "AVALUACIÓ" o "RESUM RAs")
const TEACHER_EMAILS = ["EL_TEU_CORREU@exemple.cat"]; // correus amb accés al tauler complet
const THRESHOLD = 5;                            // nota mínima (/10) per considerar un RA "assolit"
const CLIENT_ID = "";                           // OAuth Client ID (mode B). Deixa "" pel mode A.

/**
 * INSTRUCCIONS DE DESPLEGAMENT — veure apps-script/README.md per als detalls
 * complets (inclou el mode B, amb OAuth, pas a pas). Resum ràpid del mode A:
 * 1. Obre el full de càlcul a Google Sheets.
 * 2. Extensions > Apps Script. Esborra el codi d'exemple i enganxa TOT aquest fitxer.
 * 3. Edita les constants de dalt (pestanya, correus de professorat, llindar).
 * 4. Desa (icona de disquet).
 * 5. Desplega > Nova implementació > tipus "Aplicació web".
 *      - Executa com a: "Jo" (el propietari del full).
 *      - Qui té accés: "Anyone within [el teu domini]" (mode A) o "Anyone" (mode B).
 * 6. Autoritza els permisos que et demani Google.
 * 7. Copia la URL que et dona ("...script.google.com/macros/s/.../exec") i posa-la
 *    a seguiment-modul.html (camp "URL de l'aplicatiu", o a l'enllaç que
 *    comparteixis: ...seguiment-modul.html?api=URL ).
 * 8. Cada vegada que canviïs el codi, torna a "Gestiona implementacions" i puja
 *    una nova versió (si no, els canvis no es veuran reflectits).
 */

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  const action = (e && e.parameter && e.parameter.action) || "me";
  const idToken = e && e.parameter && e.parameter.id_token;
  let payload;
  try {
    const identity = resolveIdentity_(idToken);
    if (identity.error) {
      payload = identity;
    } else if (action === "full") {
      if (TEACHER_EMAILS.map(normEmail_).indexOf(identity.email) < 0) {
        payload = { error: "forbidden", message: "Aquest correu no té accés al tauler complet." };
      } else {
        payload = buildFullPayload_();
      }
    } else {
      payload = buildMePayload_(identity.email);
    }
  } catch (err) {
    payload = { error: "exception", message: String(err) };
  }
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Determina qui truca. Si CLIENT_ID és buit (mode A), fa servir la identitat de
 * sessió de Google (només funciona si tothom és del mateix domini Workspace).
 * Si CLIENT_ID té valor (mode B), exigeix i verifica un testimoni (id_token)
 * obtingut amb "Inicia sessió amb Google" a la pàgina — funciona entre dominis.
 */
function resolveIdentity_(idToken) {
  if (CLIENT_ID) {
    if (!idToken) {
      return { error: "no-auth", message: "Cal iniciar sessió amb Google des de la pàgina (botó «Inicia sessió amb Google»)." };
    }
    return verifyIdToken_(idToken);
  }
  const email = normEmail_(Session.getActiveUser().getEmail());
  if (!email) {
    return { error: "no-auth", message: "No s'ha pogut identificar el teu compte de Google. Assegura't d'haver iniciat sessió amb el correu de l'institut." };
  }
  return { email };
}

/** Verifica un ID token de Google Identity Services contra l'endpoint oficial de Google. */
function verifyIdToken_(idToken) {
  let info;
  try {
    const resp = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { error: "no-auth", message: "El testimoni de Google no és vàlid o ha caducat. Torna a iniciar sessió." };
    }
    info = JSON.parse(resp.getContentText());
  } catch (err) {
    return { error: "exception", message: "No s'ha pogut verificar la identitat: " + String(err) };
  }
  if (info.aud !== CLIENT_ID) {
    return { error: "no-auth", message: "El testimoni no correspon a aquesta aplicació." };
  }
  if (info.email_verified !== "true" && info.email_verified !== true) {
    return { error: "no-auth", message: "El correu de Google associat no està verificat." };
  }
  return { email: normEmail_(info.email) };
}

function normEmail_(s) { return String(s || "").trim().toLowerCase(); }

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

function loadData_() {
  const sheetNames = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
  const rows = sheetRows_(SHEET_NAME);
  if (!rows) throw new Error("No s'ha trobat la pestanya «" + SHEET_NAME + "». Revisa la constant SHEET_NAME.");
  const tr = findRaTitleRow_(rows);
  if (tr < 0) throw new Error("La pestanya «" + SHEET_NAME + "» no té l'estructura esperada (RA / TOTAL RA).");
  const ra = parseRaSheet_(rows, tr);

  let titleCell = "";
  for (let r = 0; r < 3; r++) { const v = clean_((rows[r] || [])[0]); if (v) { titleCell = v; break; } }

  const attendance = sheetNames.indexOf("Assistència") >= 0 ? parseAssistencia_(sheetRows_("Assistència")) : null;
  const compromis = sheetNames.indexOf("Compromís i professionalitat") >= 0 ? parseCompromis_(sheetRows_("Compromís i professionalitat")) : null;
  const material = sheetNames.indexOf("Material") >= 0 ? parseMaterial_(sheetRows_("Material")) : null;
  const incidents = sheetNames.indexOf("Incidències") >= 0 ? parseIncidencies_(sheetRows_("Incidències")) : null;
  const contacteMap = sheetNames.indexOf("Contacte") >= 0 ? parseContacte_(sheetRows_("Contacte")) : null;

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
