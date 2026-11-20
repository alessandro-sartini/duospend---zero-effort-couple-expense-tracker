# DuoSpend — Guida Completa all'Uso & Manuale delle Funzionalità

Benvenuto in **DuoSpend**, l'applicazione per la gestione delle spese di coppia pensata per gestire al meglio il bilancio condiviso tra **Partner 1** e **Partner 2**. Questa guida ti illustra tutte le funzionalità, i metodi di acquisizione automatica, le formule matematiche del pareggio conti e le modalità per sfruttare l'app al massimo con **sforzo vicino allo zero**.

L'app si apre in **modalità scura**; usa l'icona del sole/luna nella barra superiore per passare al tema chiaro. La preferenza viene salvata su questo dispositivo.

---

## 0. Sicurezza & Protezione della Privacy (Cassaforte Privata)

**Controlli di accesso e Sessioni**
- **Accesso Google OAuth 2.0 Code Model (`HttpOnly` Cookie)**: il backend verifica l’identità tramite Google e rilascia una sessione protetta da cookie `HttpOnly; SameSite=Strict` solo agli indirizzi autorizzati della coppia (`userEmail` / `partnerEmail`). Con `GOOGLE_CLIENT_SECRET` attivo, i token OAuth (incluso l'eventuale `refresh_token` Gmail) restano **esclusivamente nella RAM del server** senza mai toccare il browser (con fallback al Token Model se il secret è omesso). Firebase non è usato.
- **Scadenza per inattività (30 min) e limite massimo assoluto (4 ore)**: la sessione resta attiva mentre usi l'app (tocchi, tastiera, scroll) o durante una scansione in background, si chiude automaticamente dopo **30 minuti di inattività** (`DUOSPEND_SESSION_IDLE_MINUTES`) e non supera mai le **4 ore complessive** dal login (`DUOSPEND_SESSION_MAX_HOURS`). Quando scade, l'interfaccia si blocca automaticamente riportandoti al login. Il PIN client-side è stato rimosso perché non proteggeva le API.
- **Pulsante "Blocca"**: termina subito la sessione Google (revocando il token lato server) e riporta alla schermata di accesso.
- **Console Sviluppatore & Reset Database protetto (`DUOSPEND_DEV_PASSWORD`)**: opzionale nel file `.env`. In produzione, se assente/vuota resta completamente disabilitata (`404`); se configurata, consente di accedere dal menu Impostazioni o dal Footer (solo **dopo** aver effettuato il login Google della coppia) previa verifica della password `.env`. Il **Reset Database** apre il popup di conferma **"Sei sicuro di voler procedere?"**, offre il download rapido di un backup `.json`, permette di scegliere **Svuota tutto (0 spese)** o **Ripristina dati demo iniziali** (conservando sempre le email autorizzate della coppia) e richiede di digitare `RESET`.
- **Webhook**: richiede un account autorizzato oppure un segreto configurato solo sul server (`DUOSPEND_WEBHOOK_SECRET`). Per le automazioni esterne, configura il segreto separatamente nell'header `x-duospend-secret`.

Nessun sistema può essere garantito invulnerabile: usa HTTPS in produzione, custodisci `.env` con permessi restrittivi (`chmod 600`) ed esegui backup periodici del database SQLite.

---

## 1. I 4 Metodi di Registrazione a Sforzo Zero

DuoSpend elimina completamente la fatica di dover digitare a mano importi, date o categorie. Tutte e 4 le modalità si aprono comodamente dal **pulsante flottante `+` (Azioni Rapide)** in basso a destra (oltre che dai collegamenti rapidi nelle sezioni):

### Attività in Background & Notifiche Popup con Swipe verso destra
- Sia la **Scansione Gmail** sia l'**OCR Scontrini** continuano a lavorare in background se chiudi la finestra con **"Continua in background"** (e conservano la bozza/stato anche ricaricando la pagina).
- In alto a destra compare un popup flottante di avanzamento o completamento. Puoi toccarlo per riaprire subito la schermata oppure **chiuderlo con il tasto `X` o con uno swipe / lancio verso destra**.
- Chiudere o "swipare" via il popup **non cancella la ricerca**: i risultati trovati o la bozza OCR restano salvati. Sul pulsante `+` compare un puntino indicatore e dentro il menu trovi i badge (**`In corso`**, **`N salvate`**, **`Bozza`**) per riprenderli quando vuoi. Se chiudi un popup mentre un'operazione è *in corso*, la notifica riapparirà al completamento.

### Metodo 1: Notifiche Bancarie & SMS Android (Il più rapido su Smartphone)
Quando effettui un acquisto con carta o smartphone (POS, online, contactless), la tua banca ti invia una notifica push o un SMS (es. **Revolut, Intesa Sanpaolo, UniCredit, PostePay, Nexi, Satispay, Google Pay/Wallet**).

#### A. Incolla Rapido (con 1 Solo Tocco)
1. Apri il menu **`+`** in basso a destra e tocca **Incolla Notifica / SMS** (oppure usa la card nella Panoramica).
2. Tocca il pulsante arancione **"Incolla dagli Appunti"**: se hai appena copiato un SMS o una riga di notifica, il testo apparirà all'istante.
3. Seleziona chi ha pagato (**Partner 1** o **Partner 2**).
4. Tocca **"Estrai Spesa con Gemini"**: l'intelligenza artificiale ricaverà esercente, importo esatto in Euro, data e categoria.
5. Tocca **"Aggiungi al Registro Spese Condivise"**.

#### B. Cronologia Notifiche Multi-Banca
Su Android (*Impostazioni → Notifiche → Cronologia Notifiche*) puoi copiare 5 o 10 notifiche tutte insieme. Incolla il testo completo: Gemini le suddividerà ed estrarrà tutte contemporaneamente in un solo secondo!

#### C. Automazione "Senza Mani" con Webhook (MacroDroid - Gratis su Play Store)
Se non vuoi nemmeno copiare e incollare, puoi configurare una macro automatica su Android che inoltra le notifiche direttamente a DuoSpend in background:
1. Installa **MacroDroid** gratuitamente dal Google Play Store.
2. Vai su **Aggiungi Macro**:
   - **Trigger (Attivatore)**: Seleziona *Notifica Ricevuta* (o *SMS Ricevuto*) e seleziona le app delle tue banche (es. Revolut, Intesa, PostePay, Satispay).
   - **Azione**: Seleziona *Connettività* → *Richiesta HTTP (POST)* e usa `/api/notifications/ingest`. Per l'autenticazione webhook, configura nel dispositivo l'header `x-duospend-secret` con lo stesso segreto configurato sul server; non copiarlo da documentazione o dall'interfaccia dell'app.
   - **Corpo Richiesta**: inserisci il JSON `{"notificationText": "{notification_text}", "appName": "{notification_app_name}", "payer": "user"}`.
3. Fatto! Ogni volta che paghi un caffè o fai la spesa, la notifica viene inviata automaticamente al tuo registro spese.

---

### Metodo 2: Scansione Fotocamera Scontrini Cartacei (OCR Gemini Vision)
Ideale per gli scontrini cartacei del supermercato, ristoranti, farmacie o negozi fisici.

1. Tocca **`+` → Scansiona Scontrino OCR** (oppure il pulsante fotocamera in **Spese**).
2. Dal tuo smartphone Android tocca **Usa Fotocamera (Android)** per scattare una foto diretta dello scontrino, oppure carica un'immagine dalla galleria.
3. Il modello di visione artificiale Gemini analizzerà l'immagine ed estrarrà:
   - Nome del negozio / esercente.
   - Data dello scontrino.
   - Totale speso e valuta (€).
   - Categoria appropriata (es. Spesa, Ristoranti e Bar, Salute...).
   - Elenco dettagliato dei singoli prodotti con prezzi unitari.
   - IVA / imposte rilevate.
4. Se vuoi continuare ad usare l'app mentre Gemini analizza la foto, tocca **Continua in background**: la bozza resta salvata anche al ricaricamento della pagina.
5. Conferma la regola di divisione (50/50 o Personale) e tocca **Aggiungi al Registro Spese Condivise**.
6. La fotografia dello scontrino rimane archiviata con la spesa, pronta da consultare in qualsiasi momento.

---

### Metodo 3: Sincronizzazione Automatica Gmail (Ordini Digitali & Bollette)
Ideale per le ricevute elettroniche che arrivano via posta (Amazon, Deliveroo, bollette di luce/gas, biglietti del treno/aereo, Airbnb, IKEA).

1. Tocca **`+` → Sincronizza Gmail**.
2. Tocca **Accedi con Google**: la connessione utilizza i permessi Google ufficiali e sicuri di sola lettura (`gmail.readonly`, gestiti lato server via Code Model con cookie `HttpOnly` quando `GOOGLE_CLIENT_SECRET` è configurato).
3. Scegli il periodo (7 giorni, un mese/30 giorni o 90 giorni; un mese è il valore iniziale) e tocca **Scansiona mese intero**. DuoSpend cerca tutte le email con parole chiave d'acquisto nel periodo scelto. I batch da 30 sono solo un dettaglio tecnico: la scansione continua automaticamente fino all'ultima pagina, senza fermarsi alla prima tranche, e prosegue in background se chiudi la finestra.
4. Solo il testo delle email candidate viene inviato a Gemini per estrarre importi e articoli; gli allegati non vengono letti né inviati. Il riepilogo mostra l'avanzamento.
5. Gmail esclude Spam e Cestino, e la query esclude automaticamente **Promozioni, Social e Forum** (`-category:promotions -category:social -category:forums`) riducendo drasticamente newsletter e pubblicità. DuoSpend scarta ulteriori notifiche non transazionali (es. codici OTP o newsletter) e salta i messaggi già importati. Per evitare analisi ripetute, salva nel database sul server l'ID Gmail e il risultato sintetico della scansione per 30 giorni (non il testo integrale dell'email); i risultati trovati ma non ancora importati restano disponibili nelle scansioni successive. Gemini assegna una stima di confidenza da 0 a 100: le email sotto 40 vengono escluse dalla revisione, quelle da 40 a 64 restano da controllare e quelle da 65 in su sono proposte come spese.
6. Controlla importo, esercente e dettagli prima di selezionare le spese. Gli importi non verificati a zero (`0 €`) sono evidenziati e generano un avviso persistente in alto: toccandolo puoi aprire subito la spesa da correggere (se è una) oppure filtrare le sole spese a `0 €` nel registro. Per una fattura ricorrente non riconosciuta, scegli **Imposta come spesa ricorrente**, inserisci importo, nome e categoria: la regola esatta mittente+oggetto applica l'importo nelle scansioni future senza chiamare Gemini.
7. Se un messaggio non è una spesa, tocca **Ignora email** oppure **Ignora tutte** per escluderlo dalle scansioni successive. L'importazione aggiunge la spesa al registro ma non modifica né elimina l'email Gmail (permesso di sola lettura); l'email importata viene rimossa dalla coda e saltata nelle scansioni successive.
8. Seleziona le spese che desideri registrare e tocca **Importa**. Puoi fermare la scansione dopo il batch in corso; la schermata indica quante email sono state ricevute e se restano altre pagine.

Nel registro, l'eliminazione di una spesa richiede una conferma esplicita.

---

### Metodo 4: Inserimento Manuale Veloce
Per pagamenti in contanti o spese particolari.

1. Tocca **`+` → Nuova Spesa Veloce**.
2. Inserisci importo, esercente, data e categoria.
3. Scegli chi ha pagato (**Partner 1** o **Partner 2**).
4. Scegli la formula di ripartizione:
   - **Condivisa 50 / 50**: divisione equa a metà (predefinita).
   - **100% Personale**: spesa sostenuta per sé stessi (non genera debito/credito di coppia).
   - **Personalizzata %**: per dividere con percentuali differenti (es. 60/40 o 70/30).
5. Tocca **Salva Spesa**.

---

## 2. Il Motore di Pareggio Conti 50/50: "Chi Deve Dare a Chi"

La difficoltà più grande nella gestione delle spese di coppia è capire chi ha anticipato di più e quale sia la cifra esatta da rimborsare. DuoSpend calcola tutto matematicamente in tempo reale.

### Come Funziona il Calcolo Matematico:
1. Ogni spesa condivisa viene divisa al 50%.
2. Se **Partner 1** paga una cena da 80 €:
   - Partner 1 ha anticipato 80 €.
   - La quota di Partner 2 è 40 €.
   - Il saldo netto è: Partner 2 deve a Partner 1 40 €.
3. Se il giorno dopo **Partner 2** paga la spesa al supermercato da 50 €:
   - Partner 2 ha anticipato 50 € (quota di Partner 1: 25 €).
   - Il saldo si compensa automaticamente: 40 € - 25 € = **Partner 2 deve a Partner 1 15 €**.
4. Le spese personali al 100% non intaccano il saldo comune.

### Il Banner di Saldo in Primo Piano
Nella schermata **Panoramica** vedrai sempre una tessera chiara e ben visibile:
- 🟢 **Conti Perfettamente in Pari!**: Nessuno deve soldi all'altro.
- 🟢 **Partner 2 ti deve € XX,XX**: Hai anticipato una quota maggiore delle spese condivise.
- 🟠 **Devi a Partner 2 € XX,XX**: Partner 2 ha coperto più spese del dovuto.

### Come Pareggiare i Conti (Settle Up):
1. Quando uno dei due effettua un bonifico, un invio Revolut o un passaggio in contanti, tocca il tasto **Pareggia Saldo**.
2. DuoSpend imposta automaticamente l'importo esatto del debito residuo.
3. Seleziona il metodo di rimborso (Revolut, Bonifico Bancario, Contanti) e tocca **Registra Pareggio**.
4. Il saldo si azzera a **0,00 €** e il rimborso viene registrato nella cronologia dei pareggi.

---

## 3. Le Sezioni dell'Applicazione

### 1. Panoramica (Dashboard)
- **Banner del Saldo di Coppia**: Il punto focale per capire istantaneamente se i conti sono in pari.
- **Riepilogo Contributi**:
  - Totale pagato da Partner 1.
  - Totale pagato da Partner 2.
  - Totale Spese Comuni e la quota ideale del 50%.
- **Progresso Spesa Mensile**: Barra di avanzamento dinamica rispetto al budget prefissato (2.800,00 €).
- **Categorie Principali**: Grafico orizzontale delle aree di spesa più rilevanti del mese corrente.
- **Accesso Rapido Acquisizione**: Pulsanti diretti per Scansione Fotocamera, Gmail, Notifiche/SMS e Consulente AI.
- **Ultime Spese di Coppia**: Cronologia delle transazioni più recenti con dettagli dell'esercente e badge di provenienza.

### 2. Spese (Registro Completo)
- Elenco completo e filtrabile di tutte le spese di coppia.
- **Filtri di ricerca**: per testo, per categoria (Spesa, Casa, Utenze, Svago...) e per persona (Tutte, Pagate da Partner 1, Pagate da Partner 2).
- **Dettagli Scontrino**: Cliccando su ogni spesa puoi visualizzare la distinta dettagliata dei prodotti, l'IVA e la foto dello scontrino allegato.
- **Modifica ed Eliminazione**: Possibilità di correggere importi o eliminare registrazioni in qualsiasi momento.

### 3. Categorie e Trend (Analisi Finanziaria)
- **Selettore Temporale**: Questo Mese, Ultimi 3 Mesi, Anno in Corso (2026), Tutto lo Storico.
- **Spettro Proporzionale**: Barra a colori che evidenzia la distribuzione percentuale del budget familiare.
- **Tabella di Confronto**: Mostra per ciascuna categoria la quota versata da Partner 1 e quella versata da Partner 2, con avviso "Sopra Target" se una categoria supera la soglia di allerta.

### 4. Pareggio Saldo (Dettaglio Matematico)
- Trasparenza totale sui conti: visualizza la formula esatta, i totali versati, l'obiettivo 50% e la differenza netta.
- Cronologia storica dei rimborsi registrati in passato con date e note.

### 5. Consulente AI (Chat Finanziaria Gemini)
Un consulente dedicato che legge in tempo reale le tue spese di coppia e fornisce consigli personalizzati. Puoi scegliere tra 4 modelli specializzati:
- **Flash (Consulente Generale - Gratuito)**: Per domande quotidiane, riassunti di spesa e consigli di risparmio.
- **Carbon (Revisore Spese)**: Individua sprechi, abbonamenti dimenticati e spese ricorrenti ottimizzabili.
- **Argon (Pianificatore Scenari & Matrimonio)**: Simula i costi del matrimonio, la pianificazione del viaggio di nozze e previsioni plurimensili.
- **Flash-Lite (Risposte Rapide)**: Per risposte immediate ed elenchi puntati sintetici.

### 6. Bacheca Obiettivi (Vision Board con Immagini 1K/2K/4K)
- Schede degli obiettivi di risparmio della coppia (Fondo Viaggio di Nozze in Costiera Amalfitana, Caparra Location Matrimonio, Cuscinetto Casa) con percentuali di completamento.
- **Generatore Visuale ad Alta Definizione (Gemini 3 Pro Image Preview)**:
  - Scrivi il tuo sogno (es. *"Tramonto romantico sul mare per viaggio di nozze in Costiera Amalfitana"*).
  - Scegli la risoluzione: **1K** (1024x1024), **2K** (2048x2048) o **4K** (4096x4096).
  - Genera l'immagine e associala all'obiettivo di coppia per rimanere sempre motivati!

---

## 4. Consigli per l'Uso su Android

1. **Installa come App su Schermata Home**:
   - Apri DuoSpend in Google Chrome sul tuo telefono Android.
   - Tocca i tre puntini in alto a destra (⋮).
   - Seleziona **"Aggiungi a schermata Home"** (o **"Installa app"**).
   - DuoSpend si aprirà a schermo intero come una vera applicazione Android nativa.
2. **Scatta subito lo scontrino**:
   - Appena esci dalla cassa del supermercato, tocca l'icona della fotocamera su DuoSpend e scatta lo scontrino prima di gettarlo.
3. **Condivisione Rapida da SMS**:
   - Quando ricevi un SMS bancario, seleziona il testo, tocca "Copia", apri DuoSpend e tocca "Incolla dagli Appunti": registrazione completata in 3 secondi netti.
4. **100% Gratuito**:
   - L'applicazione, le API di intelligenza artificiale Gemini e l'accesso Google Workspace non comportano alcun costo di licenza o abbonamento.
