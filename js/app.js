// ─── LOGIN (Firebase Auth) ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC1XGWamPI4eTedacK84uMJ-8hHgGDCZps",
  authDomain: "treballs-recerca.firebaseapp.com",
  projectId: "treballs-recerca",
  storageBucket: "treballs-recerca.firebasestorage.app",
  messagingSenderId: "624915028496",
  appId: "1:624915028496:web:3fda3add683616e0060895"
};

firebase.initializeApp(firebaseConfig);

const DOMINI_PERMET = '@apellesmestres.cat';

firebase.auth().onAuthStateChanged(function (user) {
  if (user && user.email.endsWith(DOMINI_PERMET)) {
    document.getElementById('login-overlay').hidden = true;
    document.getElementById('contingut-principal').hidden = false;
  } else {
    if (user) firebase.auth().signOut();
    document.getElementById('login-overlay').hidden = false;
    document.getElementById('contingut-principal').hidden = true;
    if (user) document.getElementById('login-error').hidden = false;
  }
});

document.getElementById('btn-google-login').addEventListener('click', function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'apellesmestres.cat' });
  document.getElementById('login-error').hidden = true;
  firebase.auth().signInWithPopup(provider).catch(function () {
    document.getElementById('login-error').hidden = false;
  });
});

function logout() {
  firebase.auth().signOut();
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── VISOR PDF ────────────────────────────────────────────────────────────────
function obrirPDF(pdfUrl, titol, autor, tutor) {
  const params = new URLSearchParams({ url: pdfUrl });
  if (titol) params.set('titol', titol);
  if (autor)  params.set('autor', autor);
  if (tutor)  params.set('tutor', tutor);
  window.location.href = 'visor.html?' + params.toString();
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── COMPTADOR DE VISITES ─────────────────────────────────────────────────────
(function() {
  const APIs = [
    () => fetch('https://api.counterapi.dev/v1/apellesmestres-tr/visites/up').then(r => r.json()).then(d => d && d.count),
    () => fetch('https://hits.sh/ins-apelles-mestres.github.io/treballs-recerca.json').then(r => r.json()).then(d => d && (d.total || d.count))
  ];
  function tryNext(i) {
    if (i >= APIs.length) return;
    APIs[i]().then(count => {
      if (!count) { tryNext(i + 1); return; }
      document.getElementById('stat-visites').textContent = Number(count).toLocaleString('ca-ES');
      document.getElementById('stat-bloc-visites').hidden = false;
    }).catch(() => tryNext(i + 1));
  }
  tryNext(0);
})();
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── CONFIGURACIÓ ────────────────────────────────────────────────────────────
  // Enganxa aquí l'URL del teu full de càlcul publicat com a CSV
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQtAl6dUB2E0h_79JLFoYRq0CFXbSTi_JID8BgeinxLsSUH1kgzwD8_GaPu4XEsPCpdqggLhckD0BXW/pub?output=csv';
  const N_RECENTS = 5; // quants treballs mostrar a la secció "recents"

  // Noms exactes de les columnes al full de càlcul
  const COLS = {
    titol:       'Títol',
    autor:       'Autor',
    tutor:       'Tutor',
    pdf:         'Enllaç PDF',
    any:         'Any de defensa',
    optaPremi:   'Ha optat a premi',
    premi:       'Ha guanyat premi i quin',
    resum:       'Resum',
    paraulesClau:'Paraules Clau',
    imatgePortada:'Imatge portada',
    ambit:       'Àmbit',
  };
  // ─────────────────────────────────────────────────────────────────────────────

  let dades = [];
  let dadsFiltrades = [];
  let vistActual = 'cards';
  let ordenCol = null;
  let ordenDir = 'asc';

  // ─── FETCH I PARSE ───────────────────────────────────────────────────────────

  async function fetchData() {
    try {
      const resp = await fetch(CSV_URL, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      dades = parseCSV(text);
      if (dades.length === 0) throw new Error('El full de càlcul sembla buit o els noms de columna no coincideixen.');
      dades.sort((a, b) => b.any - a.any);
      init();
    } catch (err) {
      mostrarError(err.message);
    }
  }

  function parseCSV(text) {
    const files = parseCSVComplet(text);
    if (files.length < 2) return [];

    const headers = files[0];
    const idx = {};
    Object.entries(COLS).forEach(([clau, nom]) => {
      const i = headers.findIndex(h => normalitzaText(h) === normalitzaText(nom));
      idx[clau] = i;
    });

    return files.slice(1).map(cels => ({
      titol:        cel(cels, idx.titol),
      autor:        cel(cels, idx.autor),
      tutor:        cel(cels, idx.tutor),
      pdf:          cel(cels, idx.pdf),
      any:          parseInt(cel(cels, idx.any), 10) || 0,
      optaPremi:    normalitzaBolea(cel(cels, idx.optaPremi)),
      premi:        cel(cels, idx.premi),
      resum:        cel(cels, idx.resum),
      paraulesClau: cel(cels, idx.paraulesClau),
      imatgePortada:cel(cels, idx.imatgePortada),
      ambit:        cel(cels, idx.ambit),
    })).filter(t => t.titol);
  }

  function parseCSVComplet(text) {
    const files = [];
    let fila = [], camp = '', entreCometes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (entreCometes) {
        if (c === '"' && text[i + 1] === '"') { camp += '"'; i++; }
        else if (c === '"') { entreCometes = false; }
        else { camp += c; }
      } else {
        if (c === '"') { entreCometes = true; }
        else if (c === ',') { fila.push(camp.trim()); camp = ''; }
        else if (c === '\n') {
          fila.push(camp.trim()); camp = '';
          if (fila.some(f => f !== '')) files.push(fila);
          fila = [];
        } else if (c !== '\r') { camp += c; }
      }
    }
    if (camp || fila.length > 0) {
      fila.push(camp.trim());
      if (fila.some(f => f !== '')) files.push(fila);
    }
    return files;
  }

  function cel(cels, i) { return (i >= 0 && i < cels.length) ? cels[i].replace(/^"|"$/g, '').trim() : ''; }
  function normalitzaText(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function normalitzaBolea(s) { return ['sí', 'si', 'yes', 'true', '1', 's'].includes(normalitzaText(s)); }

  function inicialsTitol(titol) {
    const paraules = titol.split(/\s+/).filter(w => w.replace(/[^a-zA-ZàáèéíïòóúüÀÁÈÉÍÏÒÓÚÜ]/g, '').length > 3);
    return paraules.slice(0, 2).map(w => w[0].toUpperCase()).join('') || titol[0]?.toUpperCase() || '?';
  }

  function renderTagsCard(paraulesClau) {
    if (!paraulesClau) return '';
    const tags = paraulesClau.split(',').map(k => k.trim()).filter(Boolean);
    if (!tags.length) return '';
    return `<div class="tags-clau">${tags.map(t => `<button class="tag-clau" type="button">${escHtml(t)}</button>`).join('')}</div>`;
  }

  // ─── INICIALITZACIÓ ───────────────────────────────────────────────────────────

  function init() {
    omplirFiltreAny();
    omplirFiltreAmbit();
    dadsFiltrades = [...dades];
    renderDestacats();
    renderCards(dadsFiltrades);
    renderTaula(dadsFiltrades);
    actualitzarStats();
    actualitzarComptador();
    setupFiltres();
    setupToggleRecents();
    setupFlipTactil();
    setupTema();
    document.getElementById('timestamp').textContent = new Date().toLocaleString('ca');
  }

  // ─── RECENTS ─────────────────────────────────────────────────────────────────

  function renderRecents() {
    const anyMax = Math.max(...dades.map(t => t.any).filter(Boolean));
    const recents = dades
      .filter(t => t.any === anyMax)
      .sort((a, b) => {
        const ordre = { premi: 0, destacat: 1, cap: 2 };
        return (ordre[tipusPremi(a.premi)] ?? 2) - (ordre[tipusPremi(b.premi)] ?? 2);
      })
      .slice(0, N_RECENTS);
    renderScrollRecents(recents, 'No hi ha treballs recents.');
  }

  function renderDestacats() {
    const llista = dades
      .filter(t => tipusPremi(t.premi) !== 'cap')
      .sort((a, b) => {
        const ordre = { premi: 0, destacat: 1 };
        return (ordre[tipusPremi(a.premi)] ?? 2) - (ordre[tipusPremi(b.premi)] ?? 2);
      });
    renderScrollRecents(llista, 'No hi ha treballs destacats ni premiats.');
  }

  function renderScrollRecents(llista, missatgeBuit) {
    const cont = document.getElementById('recents-scroll');
    if (llista.length === 0) {
      cont.innerHTML = `<p class="loading">${missatgeBuit}</p>`;
      return;
    }
    cont.innerHTML = llista.map(t => htmlCard(t)).join('');
  }

  function setupToggleRecents() {
    document.getElementById('btn-recents').addEventListener('click', () => {
      document.getElementById('btn-recents').classList.add('actiu');
      document.getElementById('btn-destacats-sec').classList.remove('actiu');
      renderRecents();
    });
    document.getElementById('btn-destacats-sec').addEventListener('click', () => {
      document.getElementById('btn-destacats-sec').classList.add('actiu');
      document.getElementById('btn-recents').classList.remove('actiu');
      renderDestacats();
    });
  }

  // ─── MINIATURA GOOGLE DRIVE ───────────────────────────────────────────────────

  function extractDriveId(url) {
    if (!url) return null;
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  }

  function thumbnailUrl(pdfUrl) {
    const id = extractDriveId(pdfUrl);
    if (!id) return null;
    return `https://drive.google.com/thumbnail?id=${id}&sz=w400`;
  }

  // ─── TARGETES ─────────────────────────────────────────────────────────────────

  function renderCards(llista) {
    const cont = document.getElementById('vista-cards');
    if (llista.length === 0) {
      cont.innerHTML = '';
      document.getElementById('missatge-buit').hidden = false;
      return;
    }
    document.getElementById('missatge-buit').hidden = true;
    cont.innerHTML = llista.map(t => htmlCard(t)).join('');
  }

  function tipusPremi(premi) {
    const val = (premi || '').trim().toLowerCase();
    if (!val || val === 'pendent') return 'cap';
    if (val === 'destacat') return 'destacat';
    return 'premi';
  }

  function badgeCard(premi) {
    const tipus = tipusPremi(premi);
    if (tipus === 'cap') return '';
    if (tipus === 'destacat') return `<span class="card-badge-destacat">◆ Destacat</span>`;
    return `<span class="card-badge-premi">★ ${escHtml(premi)}</span>`;
  }

  function badgeTaula(premi) {
    const tipus = tipusPremi(premi);
    if (tipus === 'cap') return '—';
    if (tipus === 'destacat') return `<span class="badge-destacat-taula">◆ Destacat</span>`;
    return `<span class="badge-premi-taula">★ ${escHtml(premi)}</span>`;
  }

  function htmlCard(t) {
    const badgePremi = badgeCard(t.premi);

    const thumb = t.imatgePortada || thumbnailUrl(t.pdf);
    const portada = thumb
      ? `<a class="card-portada" href="${escHtml(t.pdf)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
           <img src="${thumb}" alt="Portada de ${escHtml(t.titol)}" loading="lazy"
                onerror="this.style.display='none'; this.closest('.card-portada').classList.add('card-portada--error')">
         </a>`
      : `<div class="card-portada card-portada--error" aria-hidden="true"></div>`;

    const btnPdf = t.pdf
      ? `<button class="btn-pdf" data-pdf-url="${escHtml(t.pdf)}" data-pdf-titol="${escHtml(t.titol)}" data-pdf-autor="${escHtml(t.autor)}" data-pdf-tutor="${escHtml(t.tutor)}">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
           Veure PDF
         </button>`
      : `<span class="btn-pdf" aria-disabled="true">Sense PDF</span>`;

    const respostaDors = t.resum
      ? escHtml(t.resum)
      : '<em>Sense resum disponible.</em>';

    return `
      <div class="card-contenidor">
        <article class="card">
          <div class="card-front">
            ${portada}
            <div class="card-cos">
              ${badgePremi}
              <h3 class="card-titol">${escHtml(t.titol)}</h3>
              <div class="card-meta">
                <span><strong>Autor:</strong> ${escHtml(t.autor)}</span>
                <span><strong>Tutor:</strong> ${escHtml(t.tutor)}</span>
              </div>
              <div class="card-peu">
                ${t.any ? `<span class="card-any">${t.any}</span>` : '<span></span>'}
                ${btnPdf}
              </div>
            </div>
          </div>
          <div class="card-back">
            <h3 class="card-back-titol">${escHtml(t.titol)}</h3>
            <div class="card-back-contingut">
              <p class="card-back-resum">${respostaDors}</p>
              ${renderTagsCard(t.paraulesClau)}
            </div>
            <div class="card-back-peu">
              ${btnPdf}
            </div>
          </div>
        </article>
      </div>`;
  }

  // ─── TAULA ────────────────────────────────────────────────────────────────────

  function renderTaula(llista) {
    const cos = document.getElementById('taula-cos');
    if (llista.length === 0) {
      cos.innerHTML = '';
      return;
    }
    cos.innerHTML = llista.map(t => {
      const celPremi = badgeTaula(t.premi);

      const celPdf = t.pdf
        ? `<button class="btn-pdf-taula" data-pdf-url="${escHtml(t.pdf)}" data-pdf-titol="${escHtml(t.titol)}" data-pdf-autor="${escHtml(t.autor)}" data-pdf-tutor="${escHtml(t.tutor)}">PDF</button>`
        : `<span class="btn-pdf-taula desactivat">—</span>`;

      return `<tr>
        <td>${escHtml(t.titol)}</td>
        <td>${escHtml(t.autor)}</td>
        <td>${escHtml(t.tutor)}</td>
        <td>${escHtml(t.ambit) || '—'}</td>
        <td>${t.any || '—'}</td>
        <td>${celPremi}</td>
        <td>${celPdf}</td>
      </tr>`;
    }).join('');
  }

  // ─── FILTRES I CERCA ─────────────────────────────────────────────────────────

  function setupFiltres() {
    document.getElementById('cerca').addEventListener('input', aplicarFiltres);
    document.getElementById('filtre-any').addEventListener('change', aplicarFiltres);
    document.getElementById('filtre-premi').addEventListener('change', aplicarFiltres);
    document.getElementById('filtre-ambit').addEventListener('change', aplicarFiltres);
    document.getElementById('btn-cards').addEventListener('click', () => canviarVista('cards'));
    document.getElementById('btn-taula').addEventListener('click', () => canviarVista('taula'));
    document.getElementById('btn-sorpresa').addEventListener('click', sorpresa);
    document.getElementById('btn-grafic').addEventListener('click', obrirGrafic);
    document.getElementById('grafic-tancar').addEventListener('click', tancarGrafic);
    document.querySelector('.grafic-fons').addEventListener('click', tancarGrafic);

    document.querySelectorAll('.taula-treballs th.ordenable').forEach(th => {
      th.addEventListener('click', () => ordenaColumna(th.dataset.col));
    });

    document.addEventListener('click', function(e) {
      const tag = e.target.closest('.tag-clau');
      if (!tag) return;
      document.getElementById('cerca').value = tag.textContent.trim();
      aplicarFiltres();
      document.querySelector('.seccio-principal').scrollIntoView({ behavior: 'smooth' });
    });

    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-pdf-url]');
      if (!btn) return;
      obrirPDF(btn.dataset.pdfUrl, btn.dataset.pdfTitol, btn.dataset.pdfAutor, btn.dataset.pdfTutor);
    });
  }

  function aplicarFiltres() {
    const q = normalitzaText(document.getElementById('cerca').value);
    const any = document.getElementById('filtre-any').value;
    const premi = document.getElementById('filtre-premi').value;
    const ambit = document.getElementById('filtre-ambit').value;

    dadsFiltrades = dades.filter(t => {
      if (q && !normalitzaText(t.titol).includes(q) &&
               !normalitzaText(t.autor).includes(q) &&
               !normalitzaText(t.tutor).includes(q) &&
               !normalitzaText(t.resum).includes(q) &&
               !normalitzaText(t.paraulesClau).includes(q)) return false;
      if (any && t.any !== parseInt(any, 10)) return false;
      if (premi === 'guanyadors' && tipusPremi(t.premi) !== 'premi') return false;
      if (premi === 'destacats' && tipusPremi(t.premi) !== 'destacat') return false;
      if (ambit && t.ambit !== ambit) return false;
      return true;
    });

    if (ordenCol) dadsFiltrades = ordena(dadsFiltrades, ordenCol, ordenDir);

    renderCards(dadsFiltrades);
    renderTaula(dadsFiltrades);
    actualitzarComptador();

    const buit = dadsFiltrades.length === 0;
    document.getElementById('missatge-buit').hidden = !buit || vistActual !== 'cards';
  }

  function omplirFiltreAny() {
    const anys = [...new Set(dades.map(t => t.any).filter(Boolean))].sort((a, b) => b - a);
    const sel = document.getElementById('filtre-any');
    anys.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      sel.appendChild(opt);
    });
  }

  // ─── ORDENACIÓ TAULA ─────────────────────────────────────────────────────────

  function ordenaColumna(col) {
    if (ordenCol === col) {
      ordenDir = ordenDir === 'asc' ? 'desc' : 'asc';
    } else {
      ordenCol = col;
      ordenDir = 'asc';
    }

    document.querySelectorAll('.taula-treballs th[data-col]').forEach(th => {
      th.removeAttribute('aria-sort');
    });
    const th = document.querySelector(`.taula-treballs th[data-col="${col}"]`);
    if (th) th.setAttribute('aria-sort', ordenDir === 'asc' ? 'ascending' : 'descending');

    dadsFiltrades = ordena(dadsFiltrades, ordenCol, ordenDir);
    renderTaula(dadsFiltrades);
  }

  function ordena(llista, col, dir) {
    return [...llista].sort((a, b) => {
      let va = a[col] ?? '', vb = b[col] ?? '';
      if (col === 'any') { va = va || 0; vb = vb || 0; }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ─── TOGGLE DE VISTA ─────────────────────────────────────────────────────────

  function canviarVista(vista) {
    vistActual = vista;
    const esCards = vista === 'cards';
    document.getElementById('vista-cards').hidden = !esCards;
    document.getElementById('vista-taula').hidden = esCards;
    document.getElementById('btn-cards').classList.toggle('actiu', esCards);
    document.getElementById('btn-taula').classList.toggle('actiu', !esCards);
    document.getElementById('btn-cards').setAttribute('aria-pressed', esCards);
    document.getElementById('btn-taula').setAttribute('aria-pressed', !esCards);
    document.getElementById('missatge-buit').hidden = dadsFiltrades.length > 0 || !esCards;
  }

  // ─── FLIP TÀCTIL (mòbil/tauleta) ─────────────────────────────────────────────

  function setupFlipTactil() {
    if (!window.matchMedia('(hover: none)').matches) return;
    document.addEventListener('click', function (e) {
      const contenidor = e.target.closest('.card-contenidor');
      if (!contenidor) {
        document.querySelectorAll('.card-contenidor.flipped')
          .forEach(c => c.classList.remove('flipped'));
        return;
      }
      if (e.target.closest('[data-pdf-url]')) return;
      if (e.target.closest('.tag-clau')) return;
      e.preventDefault();
      const jaFlipped = contenidor.classList.contains('flipped');
      document.querySelectorAll('.card-contenidor.flipped')
        .forEach(c => c.classList.remove('flipped'));
      if (!jaFlipped) contenidor.classList.add('flipped');
    });
  }

  // ─── STATS I COMPTADORS ───────────────────────────────────────────────────────

  function actualitzarStats() {
    const total = dades.length;
    const premiats = dades.filter(t => tipusPremi(t.premi) === 'premi').length;
    const destacats = dades.filter(t => tipusPremi(t.premi) === 'destacat').length;

    document.getElementById('stat-total-num').textContent = total;
    document.getElementById('stat-premiats-num').textContent = premiats;
    document.getElementById('stat-destacats-num').textContent = destacats;
    document.getElementById('stat-bloc-premiats').hidden = premiats === 0;
    document.getElementById('stat-bloc-destacats').hidden = destacats === 0;
  }

  function actualitzarComptador() {
    const n = dadsFiltrades.length;
    const total = dades.length;
    document.getElementById('comptador').textContent =
      n === total
        ? `${total} treball${total !== 1 ? 's' : ''}`
        : `Mostrant ${n} de ${total} treballs`;
  }

  // ─── ERRORS ───────────────────────────────────────────────────────────────────

  function mostrarError(msg) {
    document.getElementById('recents-scroll').innerHTML = '';
    document.getElementById('missatge-error').hidden = false;
    document.getElementById('error-detall').textContent = msg;
  }

  // ─── UTILITATS ────────────────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── ÀMBIT ───────────────────────────────────────────────────────────────────

  function omplirFiltreAmbit() {
    const ambits = [...new Set(dades.map(t => t.ambit).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ca'));
    const sel = document.getElementById('filtre-ambit');
    ambits.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      sel.appendChild(opt);
    });
    if (!ambits.length) sel.hidden = true;
  }

  // ─── MODE FOSC ────────────────────────────────────────────────────────────────

  function setupTema() {
    function actualitzarIcona() {
      const fosc = document.documentElement.dataset.tema === 'fosc';
      const btn = document.getElementById('btn-tema');
      btn.title = fosc ? 'Activar mode clar' : 'Activar mode fosc';
      btn.setAttribute('aria-label', fosc ? 'Activar mode clar' : 'Activar mode fosc');
      btn.innerHTML = fosc
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
    actualitzarIcona();
    document.getElementById('btn-tema').addEventListener('click', () => {
      const nou = document.documentElement.dataset.tema === 'fosc' ? 'clar' : 'fosc';
      document.documentElement.dataset.tema = nou;
      localStorage.setItem('tema', nou);
      actualitzarIcona();
    });
  }

  // ─── SORPRESA ─────────────────────────────────────────────────────────────────

  function sorpresa() {
    const candidats = dades.filter(t => tipusPremi(t.premi) !== 'cap' && t.pdf);
    if (!candidats.length) return;
    const t = candidats[Math.floor(Math.random() * candidats.length)];
    obrirPDF(t.pdf, t.titol, t.autor, t.tutor);
  }

  // ─── GRÀFIC ───────────────────────────────────────────────────────────────────

  function obrirGrafic() {
    const perAny = {};
    dades.forEach(t => {
      if (!t.any) return;
      if (!perAny[t.any]) perAny[t.any] = { premiats: 0, destacats: 0 };
      if (tipusPremi(t.premi) === 'premi')    perAny[t.any].premiats++;
      if (tipusPremi(t.premi) === 'destacat') perAny[t.any].destacats++;
    });
    const anys = Object.keys(perAny).map(Number).sort((a, b) => a - b);
    document.getElementById('grafic-cos').innerHTML = renderGraficSVG(perAny, anys);
    document.getElementById('grafic-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function tancarGrafic() {
    document.getElementById('grafic-modal').hidden = true;
    document.body.style.overflow = '';
  }

  function renderGraficSVG(perAny, anys) {
    if (!anys.length) return '<p style="text-align:center;padding:2rem;color:var(--color-text-suau)">Sense dades.</p>';
    const fosc = document.documentElement.dataset.tema === 'fosc';
    const W = 640, H = 280;
    const PAD = { top: 20, right: 20, bottom: 44, left: 36 };
    const areaW = W - PAD.left - PAD.right;
    const areaH = H - PAD.top - PAD.bottom;
    const maxVal = Math.max(...anys.map(a => perAny[a].premiats + perAny[a].destacats), 1);
    const slotW = areaW / anys.length;
    const barW = Math.max(6, Math.min(40, slotW * 0.65));
    const colorGrid = fosc ? '#2e3347' : '#dde3ec';
    const colorText = fosc ? '#8090a8' : '#5a6a7e';

    const xOf = i => PAD.left + (i + 0.5) * slotW - barW / 2;
    const yOf = v => PAD.top + areaH - Math.round((v / maxVal) * areaH);
    const hOf = v => Math.max(v > 0 ? 2 : 0, Math.round((v / maxVal) * areaH));

    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="grafic-svg">`;

    for (let i = 1; i <= 4; i++) {
      const val = Math.round((maxVal * i) / 4);
      const yp = PAD.top + areaH - Math.round((val / maxVal) * areaH);
      s += `<line x1="${PAD.left}" y1="${yp}" x2="${W - PAD.right}" y2="${yp}" stroke="${colorGrid}" stroke-width="1"/>`;
      s += `<text x="${PAD.left - 4}" y="${yp + 4}" text-anchor="end" font-size="10" fill="${colorText}" font-family="system-ui">${val}</text>`;
    }

    anys.forEach((any, i) => {
      const d = perAny[any];
      const total = d.premiats + d.destacats;
      const xi = xOf(i);
      if (total > 0) s += `<rect x="${xi}" y="${yOf(total)}" width="${barW}" height="${hOf(total)}" fill="#7a1a3a" rx="2"/>`;
      const lx = PAD.left + (i + 0.5) * slotW;
      const ly = H - PAD.bottom + 14;
      if (anys.length > 10) {
        s += `<text transform="rotate(-45,${lx},${ly + 6})" x="${lx}" y="${ly + 6}" text-anchor="end" font-size="9" fill="${colorText}" font-family="system-ui">${any}</text>`;
      } else {
        s += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" fill="${colorText}" font-family="system-ui">${any}</text>`;
      }
    });

    s += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + areaH}" stroke="${colorGrid}"/>`;
    s += `<line x1="${PAD.left}" y1="${PAD.top + areaH}" x2="${W - PAD.right}" y2="${PAD.top + areaH}" stroke="${colorGrid}"/>`;
    s += '</svg>';
    return s;
  }

  // ─── ARRENCADA ────────────────────────────────────────────────────────────────

  fetchData();

})();
