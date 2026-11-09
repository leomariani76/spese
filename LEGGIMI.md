# Le mie spese: app per iPhone

Un'app per tenere traccia delle spese mese per mese, con importazione dei pagamenti Nexi e inserimento manuale delle spese in contanti.
È una **web app**: si installa sulla schermata Home e funziona anche senza internet. **I dati restano solo sull'iPhone**: niente account, niente server, niente cloud.

## Cosa fa

- **Mese**: totale speso, confronto con il mese precedente (allo stesso giorno), divisione carta/contanti, budget, spese per categoria e lista dei movimenti (si può filtrare e cercare).
- **+**: aggiungi una spesa (di solito in contanti) con importo, causale, categoria, metodo, data e nota. Mentre scrivi la causale l'app propone la categoria (es. «caffè» → Ristoranti e bar). Con **Ripeti ogni mese** la spesa viene aggiunta da sola ogni mese, utile per gli abbonamenti.
- **Nexi**: importa i pagamenti salvati dai Comandi Rapidi, oppure incolla il testo di un SMS o di un'email Nexi. Per ogni pagamento l'app trova:
  - **importo**, **esercente**, **data e ora**;
  - **tipo di pagamento**: Apple Pay, online, contactless, ricorrente, prelievo, rimborso, negato;
  - **categoria con il motivo** (es. «Riconosciuto dall'esercente: "netflix" è tra gli esercenti di tipo Abbonamenti»);
  - una **causale** già compilata (es. «Abbonamento Netflix», «Spesa alimentare da Esselunga»).
  Prima di aggiungere i pagamenti li puoi controllare. Se correggi una categoria, l'app crea una regola e la volta dopo lo stesso esercente va nella categoria giusta. I pagamenti già importati vengono saltati, i possibili doppioni e i pagamenti negati vengono segnalati e lasciati deselezionati.
- **Andamento**: grafico degli ultimi 12 mesi, media mensile, abbonamenti attivi con la stima annuale, media per categoria.
- **Altro**: budget, regole delle categorie, spese ricorrenti, backup e ripristino, esportazione CSV per Numbers o Excel.

Categorie: Spesa alimentare, Abbonamenti, Ristoranti e bar, Casa e bollette, Auto e carburante, Trasporti, Shopping, Salute, Cura persona, Svago, Viaggi, Prelievi contanti, Altro.
I **prelievi al bancomat** non vengono sommati al totale, così le spese in contanti che inserisci a mano non vengono contate due volte.

---

## Il limite di iPhone (importante)

**Su iPhone nessuna app può leggere le notifiche di un'altra app**, nemmeno le app dell'App Store: è una regola di Apple. Quindi nessuna app può leggere direttamente le notifiche push di Nexi Pay.

La soluzione è l'app **Comandi**, già presente sull'iPhone:

1. Un'**automazione** scatta da sola quando paghi e scrive il pagamento nel file `spese-nexi.txt` in iCloud Drive, senza aprire nulla.
2. Quando vuoi, apri l'app, vai su **Nexi → Scegli il file**, e i pagamenti nuovi vengono letti e messi in categoria.

I passaggi completi sono anche nell'app (**Nexi → Come si configura**).

---

## 1. Installare l'app sull'iPhone

L'app deve essere aperta da un indirizzo web una sola volta, per installarla. Dopo funziona offline e i dati non escono mai dal telefono (sul sito c'è solo il codice dell'app, nessun dato).

### Opzione A: GitHub Pages (gratis, consigliata)

1. Crea un account gratuito su <https://github.com>.
2. Crea un nuovo repository pubblico, per esempio `spese`.
3. Tocca **Add file → Upload files** e carica **tutto il contenuto** di questa cartella: `index.html`, `styles.css`, `app.js`, `parser.js`, `sw.js`, `manifest.webmanifest` e la cartella `icons`. Poi tocca **Commit changes**.
4. Vai in **Settings → Pages**. In *Build and deployment* scegli **Deploy from a branch**, branch **main**, cartella **/ (root)** e salva.
5. Dopo circa un minuto l'app è online su `https://TUO-NOME.github.io/spese/`.

### Opzione B: Netlify Drop

Vai su <https://app.netlify.com/drop> da un computer e trascina questa cartella. Crea un account gratuito per mantenere il sito online.

### Aggiungerla alla schermata Home

1. Apri l'indirizzo in **Safari** sull'iPhone.
2. Tocca **Condividi** ⬆︎ e poi **Aggiungi alla schermata Home**.
3. Apri l'app sempre dall'icona **Spese** sulla Home. L'app installata e Safari hanno memorie separate.

---

## 2. Collegare i pagamenti Nexi con i Comandi Rapidi

### A) Pagamenti con Apple Pay (consigliato)

Ti servono la carta Nexi nel Wallet e iOS 17 o successivo.

1. Apri **Comandi**, vai nella scheda **Automazione** e tocca **+**.
2. Scegli **Transazione** (Wallet), seleziona la **carta Nexi**, scegli **Esegui immediatamente** e tocca **Avanti**.
3. Tocca **Nuovo comando vuoto** e aggiungi l'azione **Testo**. Nel campo scrivi:

   ```
   @@W|[Data corrente]|[Input comando › Importo]|[Input comando › Esercente]
   ```

   Le parti tra parentesi quadre sono **variabili**: inseriscile dalla barra sopra la tastiera. Inserisci *Input comando* e poi toccalo per scegliere *Importo* o *Esercente*. Il resto (`@@W|` e i `|`) va scritto a mano.
4. Aggiungi l'azione **Aggiungi a file di testo** (in alcune versioni si chiama *Aggiungi al file*):
   - contenuto: la variabile **Testo**
   - cartella: **Shortcuts** (iCloud Drive)
   - percorso: `spese-nexi.txt`
   - **Crea nuova riga**: attivo
5. Facoltativo: aggiungi **Mostra notifica** con il testo «Spesa salvata ✓».
6. Tocca **▶︎** per una prova e rispondi **Consenti sempre** quando iOS chiede il permesso di scrivere nel file. Ignora la riga di prova quando importi.

### B) SMS o email di Nexi (anche pagamenti online e abbonamenti)

Serve se hai attivo il servizio di avviso via SMS o email di Nexi. Cattura anche gli addebiti fatti senza Apple Pay, come gli abbonamenti.

1. **Automazione → + → Messaggio** (oppure **Email**). Imposta **Il messaggio contiene** su `Nexi`, oppure scegli il mittente. Scegli **Esegui immediatamente**.
2. Azione **Testo**:

   ```
   @@T|[Data corrente]|[Input comando › Contenuto]
   ```

3. Azione **Aggiungi a file di testo** sullo stesso file `spese-nexi.txt`.

### Importare

Nell'app vai su **Nexi → Scegli il file → iCloud Drive → Shortcuts → spese-nexi.txt**. Controlla e tocca **Aggiungi**. Puoi importare quando vuoi, anche una volta a settimana: i pagamenti già letti vengono saltati.

### Cosa non viene catturato in automatico

- L'automazione Apple Pay scatta solo quando paghi **con iPhone o Apple Watch**: non con la carta fisica e non quando inserisci il numero della carta su un sito.
- Gli abbonamenti addebitati sulla carta (Netflix, Spotify, palestra…) non passano da Apple Pay. Usa l'automazione B, oppure inserisci la spesa una volta con **Ripeti ogni mese**.
- Le notifiche push di Nexi Pay non si possono leggere né copiare su iPhone. Il testo di un SMS o di un'email invece si può incollare nella scheda **Nexi**.

---

## Backup

I dati sono salvati solo nell'app sul telefono. **Se elimini l'icona dalla schermata Home, i dati vengono cancellati.** Ogni tanto usa **Altro → Esporta backup** e salva il file su iCloud Drive. L'app te lo ricorda se non fai un backup da più di 30 giorni.

## Aggiornare l'app

Se modifichi i file, cambia `VERSION` in `sw.js` (es. `spese-v2`) e ricaricali sul sito. L'app si aggiorna alla seconda apertura. I dati non vengono toccati.

## File

| File | Contenuto |
|---|---|
| `index.html` | struttura dell'app |
| `styles.css` | grafica (tema chiaro e scuro automatico) |
| `app.js` | logica: viste, salvataggio, importazione, grafici |
| `parser.js` | lettura delle notifiche Nexi e categorie (parole chiave modificabili in `KEYWORDS`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | installazione e funzionamento offline |
| `test/parser.test.js` | test del riconoscimento (`node test/parser.test.js`) |
