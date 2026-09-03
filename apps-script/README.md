# Connexió en directe amb Google Sheets

`Codi.gs` és el codi que cal enganxar a l'editor d'Apps Script del teu full
de càlcul perquè `seguiment-modul.html` es pugui connectar en directe (sense
pujar cap fitxer) i cada persona vegi només el que li correspon.

No cal cap projecte de Google Cloud ni tocar OAuth: cada persona rep un
**enllaç personal amb un codi d'accés secret** (una mena de contrasenya
llarga i intransferible). Funciona igual sigui quin sigui el domini de
correu de cadascú — útil en el vostre cas, amb el full a `@xtec.cat` i
l'alumnat a `@apellesmestres.cat`.

## Passos (un sol cop)

1. Obre el full de càlcul a Google Sheets.
2. Menú **Extensions > Apps Script**.
3. Esborra el codi d'exemple i enganxa-hi tot el contingut de `Codi.gs`.
4. Edita les constants de dalt de tot del fitxer:
   - `SHEET_NAME`: el nom exacte de la pestanya amb les notes (p. ex. `"AVALUACIÓ"` o `"RESUM RAs"`).
   - `THRESHOLD`: nota mínima sobre 10 per considerar un RA "assolit" (per defecte 5).
   - `TEACHER_CODE`: posa-hi un codi llarg i difícil d'endevinar (és la teva
     "contrasenya" per accedir al tauler complet). **No el deixis com l'exemple.**
   - `PAGE_URL`: la URL on quedarà publicat `seguiment-modul.html`. Aquest
     repositori ja té GitHub Pages configurat des de la branca `main`, així
     que un cop hi fusioneu aquest canvi serà
     `https://ins-apelles-mestres.github.io/treballs-recerca/seguiment-modul.html`.
5. Desa (icona de disquet).
6. **Desplega > Nova implementació**:
   - Tipus: **Aplicació web**.
   - Executa com a: **Jo** (el propietari del full).
   - Qui té accés: **Anyone** — no cal restringir per domini, perquè l'accés
     el protegeix el codi, no la identitat de Google.
7. Autoritza els permisos que et demani Google la primera vegada.
8. Copia la URL que acaba en `/exec`.
9. Torna al full de càlcul i recarrega'l (cal recarregar perquè aparegui el
   menú nou). Veuràs un menú **"Seguiment"**:
   - **1. Genera codis d'accés**: crea (si no hi és) una pestanya "Accés" i
     hi assigna un codi a cada alumne/a que tingui correu detectat. Es pot
     tornar a executar quan s'afegeixi algú nou: no toca els codis que ja
     existeixen.
   - **2. Envia enllaços per correu**: envia a cada alumne/a (de la pestanya
     "Accés") un correu amb el seu enllaç personal.

El teu propi enllaç (professorat) és:

```
<PAGE_URL>?api=<LA_URL_QUE_ACABA_EN_/exec>&code=<TEACHER_CODE>
```

## Si un alumne/a encara no té correu al full

`generarCodisAccess` només pot assignar codi (i `enviaEnllacosPersonalitzats`
només pot enviar correu) a qui tingui un correu detectat: una columna
"Correu"/"Email" al full de notes, o el seu nom i correu a la pestanya
"Contacte". Afegeix-los-hi i torna a executar el pas 1 del menú.

## Cada cop que canviïs el codi de l'Apps Script

Torna a **Desplega > Gestiona implementacions**, edita la implementació
existent i puja una **versió nova** — si no, els canvis no es veuran.

## Seguretat: on NO ha d'anar el codi real

`TEACHER_CODE` és una contrasenya. El fitxer `Codi.gs` d'aquest
repositori és només una plantilla de referència (per això hi ha el valor
d'exemple `CANVIA-AQUEST-CODI-PER-UN-DE-LLARG-I-SECRET`): un cop l'enganxis
a l'editor d'Apps Script del teu full i hi posis el codi real, **no tornis
a pujar aquest fitxer amb el valor real a un repositori públic com aquest**.
L'única còpia que ha de tenir el codi real és la que queda desada dins de
l'editor d'Apps Script del teu full (privat, lligat al teu compte de Google).

## Com funciona la identitat

- El codi del professorat (`TEACHER_CODE`) dona accés al tauler complet.
- Cada alumne/a té el seu propi codi (pestanya "Accés"); l'script el busca
  i, si el troba, retorna només les seves pròpies dades.
- Un codi que no coincideix amb res retorna un error — mai dades d'altres
  persones.

Com que la protecció és el codi (i no la identitat de Google), tracta cada
enllaç personal com una contrasenya: si algú el reenvia a algú altre, aquell
altre podria veure les dades associades. És una protecció més senzilla que
un inici de sessió real, però suficient per a l'ús normal d'una classe.
