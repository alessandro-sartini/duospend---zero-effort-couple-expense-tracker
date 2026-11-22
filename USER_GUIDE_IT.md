# DuoSpend — Guida Completa all'Uso & Manuale delle Funzionalità

Benvenuto in **DuoSpend**, la PWA installabile da Chrome per la gestione delle spese di coppia pensata per gestire il bilancio condiviso tra **Partner 1** e **Partner 2** con sforzo minimo.

L'app si apre in **modalità scura**; usa l'icona del sole/luna nella barra superiore per passare al tema chiaro (la preferenza resta salvata su questo dispositivo).

---

## 0. Sicurezza, Sessioni, Privacy & Modello PWA

- **Accesso Google OAuth 2.0 (`HttpOnly` Cookie)**: il backend verifica l’identità tramite Google e rilascia una sessione protetta da cookie `HttpOnly; SameSite=Strict` limitato a `/api` (`Secure` in produzione/HTTPS) solo alle email autorizzate della coppia (`userEmail` / `partnerEmail`). Con `GOOGLE_CLIENT_SECRET` configurato, `access_token` e `refresh_token` restano **esclusivamente nella RAM del server** con refresh automatico (con fallback automatico al Token Model se il secret è omesso).
- **Scadenza per inattività (30 min) e limite massimo assoluto (4 ore)**: la sessione resta attiva durante l'uso dell'app o le scansioni, scade dopo **30 minuti di inattività** (`DUOSPEND_SESSION_IDLE_MINUTES`) e non supera mai le **4 ore complessive** (`DUOSPEND_SESSION_MAX_HOURS`), riportando automaticamente al login. Usa **Blocca** in qualsiasi momento per revocare subito la sessione lato server e pulire le bozze OCR/notifiche salvate in `sessionStorage`.
- **Protezione del Titolare della Coppia**: solo l'account titolare (`userEmail`) può modificare `partnerEmail`; tentativi da altri account o da titolari non configurati ricevono `403 Forbidden`.
- **Console Sviluppatore & Reset Database protetto (`DUOSPEND_DEV_PASSWORD`)**: opzionale nel file `.env`. In produzione, se vuota resta disabilitata (`404`); se impostata, si sblocca solo **dopo** il login Google autorizzato della coppia più verifica della password. Il **Reset Database** apre la finestra di conferma con esportazione rapida backup `.json`, scelta **Svuota tutto (0 spese)** o **Ripristina dati demo iniziali** (conservando sempre `userEmail` e `partnerEmail`) e digitazione obbligatoria di `RESET`.
- **Autenticazione Webhook**: le chiamate esterne verso `POST /api/notifications/ingest` richiedono una sessione coppia valida oppure l'header `x-duospend-secret` (`DUOSPEND_WEBHOOK_SECRET`).
- **PWA Installabile da Chrome (non APK nativo)**: DuoSpend si installa direttamente da Chrome senza APK nativi. Fotocamera, appunti, Share Target e archiviazione offline seguono i permessi del browser. Le risposte `/api/*` e i token OAuth non vengono mai salvati nella cache del Service Worker.

---

## 1. I 4 Metodi di Registrazione a Sforzo Zero

Tutte e 4 le modalità si aprono dal **pulsante flottante `+` (Azioni Rapide)** in basso a destra (oltre che dai collegamenti rapidi in Panoramica e Spese).

### Attività in Background & Notifiche Popup con Swipe verso destra
- Sia la **Scansione Gmail** sia l'**OCR Scontrini** continuano a lavorare in background con **"Continua in background"**, conservando bozza e risultati anche ricaricando la pagina (fino al logout).
- In alto a destra appare un popup di avanzamento: toccalo per riaprire oppure chiudilo con `X` o con **uno swipe/lancio verso destra** senza perdere bozze o risultati (`In corso`, `N salvate`, `Bozza` restano nel menu `+`).

### Metodo 1: Notifiche Bancarie, Share Target & SMS Android
Per notifiche push o SMS bancari (**Revolut, Google Pay/Wallet, Intesa Sanpaolo, UniCredit, PostePay, Nexi, Satispay, PayPal, N26**):
- **A. Incolla Rapido dagli Appunti**:
  1. Apri **`+` → Incolla Notifica / SMS**.
  2. Tocca **Incolla dagli Appunti** (chiede accesso agli appunti solo al tocco).
  3. Seleziona chi ha pagato (**Partner 1** o **Partner 2**), tocca **Estrai Spesa con Gemini** e importa.
- **B. Condivisione Diretta Android (`share_target`)**:
  - Con DuoSpend installata come PWA da Chrome su Android, seleziona un testo SMS o notifica, tocca **Condividi** nel sistema Android e scegli **DuoSpend**: si apre direttamente la finestra di importazione precompilata.
- **C. Cronologia Notifiche Multi-Banca**:
  - Copia più righe da *Impostazioni → Notifiche → Cronologia Notifiche* su Android e incollale insieme per l'estrazione multipla in un solo passaggio.
- **D. Automazione "Senza Mani" con Webhook (MacroDroid / Tasker)**:
  - Poiché una PWA Chrome non può eseguire il servizio Android nativo `NotificationListenerService` ad app chiusa, puoi usare **MacroDroid** o **Tasker** su Android per inoltrare notifiche e SMS via HTTP `POST /api/notifications/ingest`.
  - Segui la procedura completa con permessi Android, configurazione server, esempi MacroDroid per notifiche e SMS e test di verifica in [MACRODROID_SETUP_IT.md](./MACRODROID_SETUP_IT.md).

### Metodo 2: Scansione Fotocamera Scontrini Cartacei (OCR Gemini Vision)
1. Tocca **`+` → Scansiona Scontrino OCR** (o l'icona fotocamera in **Spese**).
2. Tocca **Usa Fotocamera (Android)** (usa il selettore `<input type="file" capture="environment">` solo su richiesta, senza popup preventivi) oppure scegli una foto dalla galleria.
3. **Limiti file & Privacy immagini**:
   - Formati ammessi: **JPEG, PNG, WebP**, max **12 MB** lato client.
   - L'app ricodifica e ridimensiona l'immagine in locale (JPEG max `1280px`) rimuovendo i metadati GPS/EXIF. Il server riverifica inoltre i magic bytes binari reali, blocca payload poliglotti HTML/PHP e decompression bomb (`> 8192px` o `> 25 MP`), applica il limite di `10 MB` decodificati e rimuove eventuali segmenti JPEG `APP1` EXIF e `COM`.
4. Tocca **Continua in background** per continuare a navigare mentre Gemini estrae esercente, data, totale, categoria, IVA e righe dei singoli prodotti.
5. Verifica chi ha pagato e la regola di divisione (`50/50`, `Personale`, `Personalizzata %`) e salva.

### Metodo 3: Sincronizzazione Automatica Gmail (Ordini Digitali & Bollette)
1. Tocca **`+` → Sincronizza Gmail**.
2. Tocca **Accedi con Google** (`gmail.readonly` in sola lettura; con `GOOGLE_CLIENT_SECRET`, i token restano solo nella RAM del server via cookie `HttpOnly` con refresh automatico).
3. Scegli **7 giorni**, **30 giorni** (predefinito) o **90 giorni** e avvia la scansione. La query esclude automaticamente Spam, Cestino, Promozioni, Social e Forum (`-category:promotions -category:social -category:forums`) e segue tutte le pagine in batch da 30 messaggi.
4. Solo il testo delle email candidate viene inviato a Gemini (mai gli allegati). Una cache SQLite per account sul server (durata 30 giorni) evita chiamate AI duplicate mantenendo visibili le ricevute non ancora importate.
5. **Soglie di Confidenza AI**:
   - **`75–100%`**: proposte automaticamente tra le ricevute rilevate.
   - **`55–74%`**: inserite nell'elenco candidate da revisionare manualmente per evitare falsi negativi.
   - **`< 55%`**: scartate automaticamente come rumore non transazionale.
6. Usa **Imposta come spesa ricorrente** per salvare regole mittente+oggetto applicate nelle scansioni future senza chiamare Gemini, oppure **Ignora email / Ignora tutte** per escludere messaggi non pertinenti.
7. Le spese importate con importo a zero non verificato (`0 €`) mostrano un banner persistente in alto (`ZeroAmountBanner`) per aprire subito la modifica o filtrare tutte le voci a `0 €`.

### Metodo 4: Inserimento Manuale Veloce
1. Tocca **`+` → Nuova Spesa Veloce**.
2. Inserisci titolo/esercente, importo, data e categoria.
3. Scegli chi ha pagato (**Partner 1** o **Partner 2**) e la divisione (**Condivisa 50/50**, **100% Personale**, **Personalizzata %**).

---

## 2. Motore di Pareggio 50/50 & Punto Zero (`trackingStartDate`)

### Calcolo del Saldo Netto
- Ogni spesa `50/50` accredita metà importo a chi ha pagato; le spese personalizzate applicano la percentuale salvata; le spese `100% Personali` non generano debito comune.
- Esempio: **Partner 1** paga una cena da 80 € (+40 €) e **Partner 2** paga 50 € di spesa (+25 €) → **Partner 2 deve a Partner 1 15,00 €**.
- **Pareggia Saldo**: tocca **Pareggia Saldo**, verifica la cifra precompilata, scegli Revolut / Bonifico / Contanti e registra il rimborso azzerando il saldo attivo e conservando la cronologia.

### Punto Zero (`trackingStartDate`)
- Puoi impostare una data di **Punto Zero** dalle Impostazioni (**Impostazioni → Punto Zero**) o dalla procedura dedicata per far sì che solo spese e pareggi a partire da quella data concorrano al saldo condiviso attuale. Svuotando la data, la rimozione viene sincronizzata anche sul server.

### Riconciliazione Multi-Canale (±14 Giorni) & Quarantena Spese a `0 €`
- Poiché le notifiche push/SMS arrivano al pagamento mentre la scansione Gmail può essere lanciata giorni o settimane dopo (con date fattura/spedizione sfasate), DuoSpend applica un motore di riconciliazione a finestra elastica (`±14 giorni`) basato su esercente normalizzato, importo e regole ricorrenti:
  - **Unione su canali differiti**: una ricevuta Gmail acquisita 10 giorni dopo la notifica bancaria viene fusa nella spesa esistente (`linkedSources` + `linkedReferences`), conservando i dettagli ed evitando doppi import futuri.
  - **Quarantena `0 €`**: le ricevute Gmail senza importo entrano in `zero_quarantine` con avviso dedicato (`ZeroAmountBanner`). Appena è presente o arriva la notifica bancaria reale entro ±14 giorni, l’importo reale viene agganciato automaticamente o con 1 tocco (**Unisci ed esci dalla quarantena**).

### Modalità Vacanza / Progetti & Spese Ricorrenti
- **Modalità Vacanza & Progetti (`TripModeModal`)**: crea e attiva un viaggio o evento speciale (es. *Weekend a Barcellona*) per assegnare automaticamente `tripId` alle spese del periodo e consultare un mini-saldo 50/50 isolato dal resto del registro.
- **Spese Ricorrenti & Abbonamenti (`RecurringExpensesModal`)**: monitora uscite fisse o variabili (affitto, bollette, streaming) con alias esercente personalizzati, stato ciclo mensile (`YYYY-MM`), aggancio automatico con notifiche/Gmail e registrazione rata in 1 tocco senza duplicazioni.

---

## 3. Le Sezioni dell'Applicazione

- **1. Panoramica (Dashboard)**: Banner del Saldo, riepilogo contributi, progresso budget mensile, categorie principali, scorciatoie rapide di acquisizione e **Ultime Spese di Coppia** (con **swipe laterale ibrido Android** e menu compatto `⋮` su smartphone).
- **2. Spese**: Elenco completo ricercabile e filtrabile (testo, categoria, pagante, spese a `0 €`), dettagli scontrino/IVA/foto allegata, **swipe laterali ibridi in stile Android** (swipe corto per scoprire i pulsanti laterali, swipe lungo deciso per attivare l'azione: destra per modificare, sinistra per aprire la conferma di eliminazione con avviso **Ripristina** per annullare subito), menu `⋮` su smartphone, bottoni completi su desktop ed **Esportazione CSV**.
- **3. Categorie e Trend**: Grafici e metriche per **Mese**, **Trimestre**, **Anno** e **Tutto lo storico**; creazione di **Categorie Personalizzate** con budget mensile dedicato, modifica massiva dei budget e possibilità di nascondere categorie non usate (proteggendo sempre `Altro`).
- **4. Pareggio Saldo**: Dettaglio matematico completo dei totali, quota equa 50%, saldo netto e cronologia storica dei rimborsi (con conferma esplicita prima della rimozione e opzione **Ripristina** immediata).
- **5. Consulente AI**: Chat finanziaria Gemini collegata ai dati del registro comune. Modelli supportati: **Flash** (`gemini-3.8-flash` con fallback su `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.1-flash-lite`), **Carbon** (`gemini-4-carbon`, audit approfondito), **Argon** (`gemini-4-argon`, scenari e matrimonio), **Hydrogen** (`gemini-4-hydrogen`) e **Flash-Lite** (`gemini-3.1-flash-lite`).
- **6. Bacheca Obiettivi (Vision Board) & Sfide di Risparmio**: Schede obiettivi di risparmio, riquadro compatto **Copertina Obiettivi** con generazione AI **1K / 2K / 4K** (`gemini-3.1-flash-image-preview`, `gemini-2.5-flash-image`, `gemini-3-pro-image-preview` con switch automatico verso modelli `imagen-4.0-*` / `imagen-3.0-*`) oppure caricamento diretto **Carica foto** da galleria locale, e sezione integrata **Sfide di Risparmio di Coppia** ad **accordion compatti** (chiusi di default con indicatori colorati di stato, paginazione a 5 voci ed espansione inline).

### Sfide di Risparmio di Coppia (Risparmio Virtuale)
- **Cos’è il Risparmio Virtuale**: Una sfida di risparmio definisce un limite mensile condiviso su una o più categorie collegato a un obiettivo esistente della Vision Board. Il risparmio virtuale è calcolato lato server come `max(0, limite mensile - spese considerate valide)`. **Nessun conto bancario reale viene modificato, non esistono classifiche né competizione tra partner e nessun denaro viene spostato automaticamente.** L’importo sull’obiettivo cambia solo dopo conferma esplicita e resta sempre reversibile.
- **Come creare una sfida**:
  1. Apri **Obiettivi (Vision Board)** e tocca **Nuova sfida** (oppure tocca **Sfida** direttamente su una card obiettivo).
  2. Scegli l’obiettivo collegato, inserisci il nome della sfida, seleziona una o più categorie (anche personalizzate), imposta il limite mensile (`> 0`), il mese iniziale (`YYYY-MM`), la durata (`1–12` mesi), l’ambito spese (*tutte* o *solo condivise 50/50 e %*) e il fuso orario.
  3. Controlla la stima live dal server (spesa media dei 3 mesi precedenti, limite proposto e avviso di risparmio virtuale) e tocca **Attiva sfida**.
- **Modifica, pausa e modifiche retroattive**: Puoi modificare, mettere in pausa, riattivare, terminare, ricalcolare o eliminare una sfida. Le modifiche retroattive su sfide già avviate richiedono conferma esplicita prima del ricalcolo; per cambiare obiettivo quando esistono contributi già applicati occorre prima annullarli.
- **Come confermare o annullare un contributo virtuale**:
  1. Seleziona una sfida con risparmio virtuale disponibile e tocca **Prepara contributo virtuale**.
  2. Verifica l’anteprima server (`Anteprima`), l’importo e il nuovo totale dell’obiettivo, spunta la conferma esplicita e tocca **Conferma contributo virtuale** (protetto da doppio clic e replay).
  3. Per annullare in qualsiasi momento, apri il dettaglio della sfida e tocca **Rimuovi ultimo contributo** (oppure **Annulla** accanto a un contributo nello storico): l’importo virtuale viene stornato atomicamente dall’obiettivo Vision Board.
- **Limiti di valuta, calcolo e uso offline**:
  - **Valuta**: Nessuna conversione valutaria implicita — concorrono solo le spese nella valuta della sfida (`EUR` di default); le spese in valuta estera vengono escluse e segnalate.
  - **Voci escluse**: Sono sempre esclusi spese cancellate, ricevute in quarantena `0 €`, importi negativi/rimborsi, spese future nella timezone della sfida e i pareggi (`settlements`).
  - **Offline e limiti PWA**: Offline puoi consultare l’ultima istantanea salvata in sola lettura, mentre creazione, modifica, conferma e annullamento contributi richiedono la connessione al server SQLite. Essendo una PWA Chrome, non invia notifiche push silenziose automatiche a fine mese ad app chiusa.

---

## 4. Installazione Chrome PWA, Uso Offline & Limiti rispetto ad APK Nativo

### Installazione da Chrome
- **Chrome Android**: apri DuoSpend → tocca il pulsante **Installa app** nella barra superiore o in **Sicurezza** (oppure **`⋮`** → **Aggiungi a schermata Home / Installa app**). Abilita icona su schermata Home, scorciatoie rapide (*Nuova Spesa*, *Notifiche*, *Fotocamera*, *Saldo*) e **Condivisione Android (`share_target`)**.
- **Chrome / Edge Desktop**: usa l'icona di installazione nella barra indirizzi (`⋮ → Installa DuoSpend`).
- **Accessibilità & UX Mobile**: apertura in modalità standalone rispettando le safe area (`env(safe-area-inset-*)`), pannelli bottom-sheet su smartphone, righe mobile compatte con menu `⋮`, gesti swipe laterali ibridi su **Spese** e **Ultime Spese** (con bottoni alternativi accessibili, conferma esplicita per eliminazioni e barra **Ripristina**), zoom del browser sempre preservato, navigazione da tastiera con focus trap nei modali (`useFocusTrap`), chiusura con `Escape` e supporto a `prefers-reduced-motion`.

### Comportamento Offline & Recupero Sincronizzazione
- Il Service Worker (`duospend-shell-v9`, registrato con `updateViaCache: 'none'`) salva nella cache solo le risorse statiche dell'interfaccia, legge il manifest in modalità network-first (e il server serve `/sw.js`, `/index.html`, `/manifest.webmanifest` senza cache per garantire gli aggiornamenti); `/api/*` (incluse `/api/savings-challenges*`) e i dati privati non entrano mai nella cache del Service Worker.
- Le modifiche effettuate offline restano in `localStorage` con stato `duospend_dirty_sync_v1`; al ritorno della rete vengono inviate tramite coda serializzata dove le modifiche locali pendenti prevalgono sui record server obsoleti, preservando comunque eventuali foto `receiptUrl` dal server se rimosse localmente per `QuotaExceededError`.

### Supporto Browser & Funzioni che Richiedono un APK Nativo
| Funzionalità | PWA Chrome (Android / Desktop) | Safari iOS (Schermata Home) | APK Nativo (Perché serve APK) |
| :--- | :--- | :--- | :--- |
| App Standalone & Shell Offline | Supporto completo | Parziale (limiti storage Safari) | Container nativo completo |
| Scansione Scontrino da Fotocamera/Galleria | Su richiesta (`<input capture="environment">`) | Su richiesta da fotocamera/libreria | Accesso diretto Camera2/background |
| Condivisione da App Esterne (`share_target`) | Supportata da Chrome su Android | Non supportata da Safari iOS | Intent nativi Android |
| **Intercettazione Silenziosa Notifiche / SMS** | Non consentita nelle PWA browser | Non consentita | **Richiede `NotificationListenerService` / permessi SMS nativi** (alternativa: MacroDroid webhook) |
| **Sincronizzazione Silenziosa ad App Chiusa** | Solo bozze su tab/ricaricamento | Non supportata | **Richiede servizio OS / WorkManager** |
| Blocco Biometrico Locale Dedicato | Affidato a blocco schermo OS + sessione server | Blocco schermo OS + cookie | API `BiometricPrompt` nativa |
