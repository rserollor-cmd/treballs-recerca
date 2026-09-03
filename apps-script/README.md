# Connexió en directe amb Google Sheets

`Codi.gs` és el codi que cal enganxar a l'editor d'Apps Script del teu full
de càlcul perquè `seguiment-modul.html` es pugui connectar en directe (sense
pujar cap fitxer) i cada persona vegi només el que li correspon segons el
seu compte de Google real.

Hi ha dos modes. **Fes servir el mode B** si, com és el vostre cas, el full
és propietat d'un compte d'un domini (p. ex. `@xtec.cat`, el del
professorat) i l'alumnat és d'un altre domini (p. ex. `@apellesmestres.cat`).

## Mode A — un sol domini (més senzill, no és el vostre cas si els dominis difereixen)

Vàlid només si **qui posseeix el full** i **tot l'alumnat** tenen comptes del
mateix domini Google Workspace.

1. Obre el full de càlcul a Google Sheets.
2. Menú **Extensions > Apps Script**.
3. Esborra el codi d'exemple i enganxa-hi tot el contingut de `Codi.gs`.
4. Edita `SHEET_NAME`, `TEACHER_EMAILS` i `THRESHOLD`. Deixa `CLIENT_ID = ""`.
5. Desa. **Desplega > Nova implementació** > tipus **Aplicació web**:
   - Executa com a: **Jo**.
   - Qui té accés: **Anyone within [el teu domini]**.
6. Autoritza els permisos. Copia la URL que acaba en `/exec`.
7. A `seguiment-modul.html`, enganxa aquesta URL al quadre "Connecta amb el
   full de Google" (o comparteix `...seguiment-modul.html?api=LA_URL`).

## Mode B — dominis diferents (el vostre cas: xtec.cat + apellesmestres.cat)

L'opció "Anyone within [domini]" només accepta **un** domini, i seria el del
propietari del full (`xtec.cat`) — l'alumnat de `apellesmestres.cat` quedaria
exclòs abans d'arribar al codi. La solució: la pàgina web demana a la
persona que iniciï sessió amb Google (OAuth) i el propi script verifica qui
és contra els servidors de Google — això funciona amb qualsevol combinació
de dominis.

### B.1 — Crea un OAuth Client ID a Google Cloud (un sol cop)

1. Vés a [console.cloud.google.com](https://console.cloud.google.com/) amb
   el compte que gestioni el projecte (pot ser el mateix `@xtec.cat` del full).
2. Crea un projecte nou (o fes servir un que ja tinguis).
3. **APIs i serveis > Pantalla de consentiment OAuth**:
   - Tipus d'usuari: **Extern** (imprescindible perquè accepti tots dos
     dominis; "Intern" només accepta el domini del projecte).
   - Omple el nom de l'app, correu de suport i de contacte. Desa.
   - No cal demanar verificació de Google per a aquest ús (un institut, poca
     gent, cap dada sensible més enllà de l'email) — la primera vegada que
     algú iniciï sessió veurà un avís "Google no ha verificat aquesta app";
     fent clic a "Avançat > Anar a [nom de l'app] (no segur)" hi podrà entrar
     igualment. És normal i esperat, no és un error.
4. **APIs i serveis > Credencials > Crea credencials > ID de client d'OAuth**:
   - Tipus d'aplicació: **Aplicació web**.
   - **Orígens autoritzats de JavaScript**: la URL on publiquis
     `seguiment-modul.html` (només l'arrel, sense la ruta), per exemple:
     `https://ins-apelles-mestres.github.io`
     (aquest repositori ja té GitHub Pages configurat des de la branca
     `main` — un cop hi fusioneu aquest canvi, l'eina quedarà publicada a
     `https://ins-apelles-mestres.github.io/treballs-recerca/seguiment-modul.html`).
   - **Important**: aquest mode NO funciona obrint l'HTML com a fitxer local
     (`file://`) — Google no accepta aquest origen. Cal servir-lo per web
     (GitHub Pages, com aquí, o qualsevol altre allotjament).
5. Desa i copia el **Client ID** (acaba en `.apps.googleusercontent.com`).
   No és secret, es pot enganxar directament al codi.

### B.2 — Configura i desplega l'Apps Script

1. Obre el full de càlcul a Google Sheets.
2. Menú **Extensions > Apps Script**.
3. Esborra el codi d'exemple i enganxa-hi tot el contingut de `Codi.gs`.
4. Edita:
   - `SHEET_NAME`: el nom exacte de la pestanya amb les notes.
   - `TEACHER_EMAILS`: correus del professorat amb accés al tauler complet.
   - `THRESHOLD`: nota mínima sobre 10 per considerar un RA "assolit".
   - `CLIENT_ID`: enganxa aquí el Client ID del pas B.1.
5. Desa. **Desplega > Nova implementació** > tipus **Aplicació web**:
   - Executa com a: **Jo**.
   - Qui té accés: **Anyone** (ara la identitat NO ve d'aquest ajust, sinó
     del testimoni d'inici de sessió amb Google que verifica el codi).
6. Autoritza els permisos. Copia la URL que acaba en `/exec`.

### B.3 — Configura seguiment-modul.html

Un cop publicat a GitHub Pages, comparteix amb el professorat i l'alumnat un
enllaç amb la URL de l'script i el Client ID:

```
https://ins-apelles-mestres.github.io/treballs-recerca/seguiment-modul.html?api=LA_URL_DE_LEXEC&client_id=EL_CLIENT_ID
```

En obrir l'enllaç, la pàgina mostrarà un botó "Inicia sessió amb Google";
cadascú hi entra amb el seu propi compte (`@xtec.cat` el professorat,
`@apellesmestres.cat` l'alumnat) i, un cop identificat, es connecta sol.

## Cada cop que canviïs el codi de l'Apps Script

Torna a **Desplega > Gestiona implementacions**, edita la implementació
existent i puja una **versió nova** — si no, els canvis no es veuran.

## Com funciona la identitat

- **Mode A**: l'script fa servir `Session.getActiveUser().getEmail()` — el
  compte que la persona té iniciat al navegador. Només fiable dins d'un únic
  domini Workspace.
- **Mode B**: la pàgina obté un testimoni (ID token) en iniciar sessió amb
  Google (Google Identity Services) i el passa a l'script, que el verifica
  contra `oauth2.googleapis.com` (comprova que no ha caducat i que és
  realment per a la vostra aplicació) abans de confiar-hi.

En tots dos casos: si el correu és a `TEACHER_EMAILS` i es demana el tauler
complet, el rep. Si no, l'script busca aquest correu entre l'alumnat del
full de notes i, si el troba, retorna només les seves pròpies dades. Mai
s'envien al navegador les dades d'altres persones.
