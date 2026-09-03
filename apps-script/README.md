# Connexió en directe amb Google Sheets

`Codi.gs` és el codi que cal enganxar a l'editor d'Apps Script del teu full
de càlcul perquè `seguiment-modul.html` es pugui connectar en directe (sense
pujar cap fitxer) i cada persona vegi només el que li correspon segons el
seu compte de Google real.

## Passos (un sol cop)

1. Obre el full de càlcul a Google Sheets.
2. Menú **Extensions > Apps Script**.
3. Esborra el codi d'exemple i enganxa-hi tot el contingut de `Codi.gs`.
4. Edita les 3 constants de dalt de tot del fitxer:
   - `SHEET_NAME`: el nom exacte de la pestanya amb les notes (p. ex. `"AVALUACIÓ"` o `"RESUM RAs"`).
   - `TEACHER_EMAILS`: la llista de correus (institucionals) que han de poder veure el tauler complet.
   - `THRESHOLD`: nota mínima sobre 10 per considerar un RA "assolit" (per defecte 5).
5. Desa (icona de disquet).
6. **Desplega > Nova implementació**:
   - Tipus: **Aplicació web**.
   - Executa com a: **Jo** (el propietari del full).
   - Qui té accés: **Qualsevol persona dins de [el teu domini]** (cal que
     l'institut faci servir Google Workspace amb un domini propi — amb
     comptes Gmail personals aquesta identificació automàtica no funciona).
7. Autoritza els permisos que et demani Google la primera vegada.
8. Copia la URL que acaba en `/exec`.

Aquesta URL és la que has de donar a `seguiment-modul.html`: enganxant-la
directament al quadre "Connecta amb el full de Google" de la pantalla
d'importació, o compartint amb l'alumnat un enllaç del tipus:

```
https://<on tinguis publicat seguiment-modul.html>?api=<LA_URL_QUE_HAS_COPIAT>
```

perquè es connectin automàticament en obrir l'enllaç (encara hauran d'estar
identificats amb el seu compte de Google institucional al navegador).

## Cada cop que canviïs el codi

Torna a **Desplega > Gestiona implementacions**, edita la implementació
existent i puja una **versió nova** — si no, els canvis no es veuran.

## Com funciona la identitat

L'script identifica qui truca amb `Session.getActiveUser().getEmail()`,
és a dir, el compte de Google que la persona té iniciat al navegador —
ningú no escriu el seu correu enlloc. Si el correu és a `TEACHER_EMAILS`
i demana el tauler complet, el rep. Si no, l'script busca aquest correu
entre l'alumnat del full de notes i, si el troba, retorna només les seves
pròpies dades. Mai s'envien al navegador les dades d'altres persones.
