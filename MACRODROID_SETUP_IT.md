# DuoSpend - Manuale MacroDroid

Questa procedura permette ad Android di inoltrare automaticamente nuove notifiche bancarie e nuovi SMS ricevuti a DuoSpend. MacroDroid agisce come listener esterno: DuoSpend resta una PWA Chrome e non riceve direttamente notifiche o SMS.

## 1. Prima della configurazione

Verifica i requisiti:

- Smartphone Android con MacroDroid installato da Google Play.
- DuoSpend raggiungibile da Internet tramite HTTPS.
- `DUOSPEND_WEBHOOK_SECRET` configurato sul server.
- Gemini opzionale: senza una chiave Gemini valida il server usa comunque il parser euristico locale.
- Permessi Android concessi per il tipo di evento scelto.

Il nome dell'ambiente server deve essere scritto esattamente come segue:

```dotenv
DUOSPEND_WEBHOOK_SECRET=una-stringa-casuale-lunga-almeno-24-caratteri
```

Usa lo stesso valore esatto nell'header MacroDroid `x-duospend-secret`. Non pubblicare il segreto nelle immagini, nelle macro condivise, nelle issue o nel repository.

Per un dominio locale non valido da Internet non basta essere collegati alla stessa rete: DuoSpend deve avere un indirizzo HTTPS raggiungibile dal telefono e dal tunnel o dal proxy configurato.

Riavvia DuoSpend o il contenitore dopo aver cambiato `.env`:

```bash
docker compose up -d --build
```

## 2. Indirizzo del webhook

L'endpoint è:

```text
POST https://IL-TUO-DOMINIO-DUOSPEND/api/notifications/ingest
```

Se DuoSpend è raggiungibile tramite un tunnel, usa nel campo URL l'indirizzo HTTPS pubblico completo. Non usare `http://`, indirizzi locali come `localhost` o indirizzi IP privati raggiungibili solo dal PC.

Header obbligatori:

```text
Content-Type: application/json
x-duospend-secret: IL_SEGRETO_CONFIGURATO_NEL_SERVER
```

Corpo JSON accettato dal server:

```json
{
  "notificationText": "testo della notifica o dell'SMS",
  "appName": "nome dell'app bancaria",
  "payer": "user"
}
```

Campi:

- `notificationText`: obbligatorio, testo da analizzare; massimo 10.000 caratteri.
- `appName`: facoltativo, nome dell'app o della banca; massimo 60 caratteri.
- `payer`: deve essere `user` o `partner`.
  - `user` indica Partner 1.
  - `partner` indica Partner 2.

## 3. Macro per notifiche bancarie

1. Apri MacroDroid e tocca **Aggiungi Macro**.
2. Sezione **Trigger**:
   - scegli **Notifica ricevuta**;
   - oppure una variante localizzata equivalente come **Notification** → **Notification Received**;
   - abilita l'accesso alle notifiche quando richiesto da Android;
   - seleziona una o più app bancarie;
   - come filtro iniziale puoi usare l'app, non una parola chiave per ogni banca.
3. Sezione **Azioni**:
   - scegli **Connettività**;
   - scegli **Richiesta HTTP** o **HTTP Request**;
   - imposta il metodo su **POST**;
   - incolla l'URL webhook completo.
4. Aggiungi i due header:

```text
Content-Type = application/json
x-duospend-secret = IL_SEGRETO_CONFIGURATO_NEL_SERVER
```

5. Nel corpo imposta **JSON** e usa:

```json
{
  "notificationText": "{notification_text}",
  "appName": "{notification_app_name}",
  "payer": "user"
}
```

Le scritte tra parentesi graffe sono le variabili MacroDroid. Nel selettore delle variabili scegli il testo completo della notifica e il nome dell'app. Se MacroDroid usa una sintassi diversa nel tuo dispositivo, inserisci la variabile equivalente dal selettore invece di digitare manualmente il testo.

6. Usa **Test Action** o invia una vera notifica bancaria di prova.
7. Il server deve rispondere con JSON e con `success: true`. Se salva la spesa, il campo `persisted` sarà `true`.

## 4. Macro per SMS bancari

1. Apri una nuova macro.
2. Sezione **Trigger**:
   - scegli **SMS ricevuto**;
   - concedi a MacroDroid il permesso Android SMS;
   - inserisci i numeri o gli alias della banca nel filtro mittente, se vuoi limitare l'intercettazione;
   - se disponibile, scegli **Qualsiasi SMS** solo per i test iniziali.
3. Sezione **Azioni**:
   - scegli **Connettività** → **Richiesta HTTP**;
   - imposta `POST`;
   - incolla lo stesso URL webhook;
   - aggiungi gli stessi due header.
4. Corpo JSON:

```json
{
  "notificationText": "{sms_message}",
  "appName": "{sms_sender}",
  "payer": "user"
}
```

Nel selettore delle variabili MacroDroid:

- usa la variabile contenente il testo completo dell'SMS per `notificationText`;
- usa la variabile contenente il mittente per `appName`;
- modifica `payer` da `user` a `partner` se l'SMS riguarda la carta del Partner 2.

5. Testa prima con un SMS reale della banca o con l'azione di test fornita da MacroDroid.
6. Alcune banche inviano solo notifiche senza SMS o viceversa: usa due macro separate, una per le notifiche e una per gli SMS.

## 5. Macro separate per i due partner

Le carte o gli account possono essere assegnati in modo diverso. Crea una macro per ciascun partner:

- Partner 1: `"payer": "user"`.
- Partner 2: `"payer": "partner"`.

Nella macro dedicata ai due ruoli:

- seleziona solo app, mittenti e carte appartenenti a quel partner;
- usa una regola separata per ciascun partner;
- controlla che il campo `payer` resti `user` o `partner`: altri valori vengono rifiutati dal server.

## 6. Test manuali

### Test autorizzato

Da PowerShell su Windows, sostituisci il dominio e il segreto:

```powershell
$body = @{
  notificationText = "Pagato 12.50 EUR presso BAR ROMA"
  appName = "Banca di prova"
  payer = "user"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://IL-TUO-DOMINIO-DUOSPEND/api/notifications/ingest" `
  -Method Post `
  -ContentType "application/json" `
  -Headers @{ "x-duospend-secret" = "IL_SEGRETO_CONFIGURATO_NEL_SERVER" } `
  -Body $body
```

Se la risposta contiene `persisted: true`, il webhook è configurato correttamente e DuoSpend ha registrato la spesa.

### Test da MacroDroid

Invia una notifica o SMS di prova. Nelle impostazioni MacroDroid controlla la cronologia dell'esecuzione e l'eventuale codice HTTP. Nel pannello DuoSpend sotto `+ → Incolla Notifica / SMS` non compare automaticamente una notifica eseguita: la spesa viene già registrata dal webhook se il segreto è valido.

## 7. Sicurezza e privacy

- Usa sempre HTTPS.
- Non condividere il segreto MacroDroid.
- Non usare una password banale o un valore contenente `replace`, `changeme` o `example`.
- Non loggare nel testo delle notifiche informazioni che non vuoi lasciare al server.
- Limita i trigger alle sole app bancarie o ai numeri conosciuti.
- Il segreto non evita che chiunque possa leggere i dati trasmessi se il dispositivo o la macro vengono compromessi; HTTPS cifra il percorso ma non è una protezione contro la diffusione del segreto.
- La PWA può vedere solo gli eventi nuovi trasmessi da MacroDroid: non può leggere automaticamente la cronologia precedente né SMS e notifiche in app chiusa senza il componente Android esterno.

## 8. Errori comuni

### `Webhook disabilitato`

`DUOSPEND_WEBHOOK_SECRET` non è presente sul server o il server non è stato riavviato dopo la modifica.

### `401 Autenticazione richiesta`

L'header è assente, contiene uno spazio o un valore diverso da quello server. I nomi header sono case-insensitive, ma il valore deve essere identico.

### `400 notificationText è obbligatorio`

MacroDroid non ha sostituito la variabile nel JSON o la notifica/SMS ha testo vuoto.

### `400 payer non valido`

Il campo `payer` non è `user` o `partner`.

### `503` o dominio irraggiungibile

Controlla URL, HTTPS, tunnel, router, DNS e stato del server Docker. Un tunnel Cloudflare temporaneo può cambiare URL e va aggiornato nella macro.

### Il webhook risponde ma non salva

La notifica viene analizzata, ma il server non persiste se il testo non contiene un importo valido oppure se la richiesta è priva del segreto valido. Con il segreto valido, `persisted` è generalmente `true` per importi superiori a zero.
