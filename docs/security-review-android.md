# Revisione di sicurezza Android di ScanME

Data: 21 novembre 2026. Perimetro: codice **React Native** in `src/`, progetto **Android** in `android/`, dipendenze **npm** (`package-lock.json`). Il file `.claude/agents/code-security.md` citato nella richiesta non è presente nel repository, per cui la revisione segue una lista di controllo standard ispirata a **OWASP MASVS** ([MASVS](https://mas.owasp.org/MASVS/)).

## Sintesi

Non sono emersi problemi di gravità critica. Sono stati trovati due problemi di gravità alta, entrambi corretti in questa **PR**, che si appoggia alla **PR** #1 (`fix/revisione-qualita-codice`) e va integrata dopo di essa, insieme a due problemi medi di correzione semplice; gli altri punti sono documentati sotto con una raccomandazione, perché richiedono una scelta di prodotto o un test su dispositivo.

| # | Problema | Gravità | Stato |
|---|----------|---------|-------|
| 1 | Build di **release** firmata con la `debug.keystore` pubblica | Alta | Corretto |
| 2 | Nome file dell'utente usato nel percorso senza controlli (**path traversal**) | Alta | Corretto |
| 3 | Scansioni lasciate nella **cache** dell'app dopo l'uso | Media | Corretto |
| 4 | Trasferimento dati da dispositivo a dispositivo non escluso (Android 12+) | Bassa | Corretto |
| 5 | Vulnerabilità note nelle dipendenze di sviluppo (`npm audit`) | Media | Corretto |
| 6 | Documenti salvati nelle cartelle pubbliche `Download` e `Pictures` | Media | Documentato |
| 7 | **R8/ProGuard** disattivato in **release** | Media | Documentato |
| 8 | Assenza di `FLAG_SECURE` (anteprima visibile in "app recenti" e screenshot) | Bassa | Documentato |
| 9 | Libreria **ML Kit Document Scanner** in versione **beta** | Bassa | Documentato |
| 10 | Versione dinamica `+` per `jsc-android` | Bassa | Documentato |

## Problemi corretti

### 1. Firma di release con la chiave di debug

In `android/app/build.gradle` il tipo di build `release` usava `signingConfigs.debug`, cioè la `debug.keystore` presente nel repository con password `android`. Chiunque possieda quella chiave, che è pubblica, potrebbe firmare un **APK** che Android accetterebbe come aggiornamento legittimo dell'app installata, con accesso ai suoi dati privati ([Android, firma delle app](https://developer.android.com/studio/publish/app-signing)).

La correzione introduce un `signingConfig` di **release** che legge archivio, alias e password dalle proprietà **Gradle** (`~/.gradle/gradle.properties`) o da variabili d'ambiente (`SCANME_UPLOAD_STORE_FILE`, `SCANME_UPLOAD_STORE_PASSWORD`, `SCANME_UPLOAD_KEY_ALIAS`, `SCANME_UPLOAD_KEY_PASSWORD`). Se le proprietà mancano, l'**APK** di **release** viene prodotto non firmato e non è installabile, così che non possa più uscire per errore una build firmata con la chiave di debug. Il file `.gitignore` ora esclude `*.jks` e `*.keystore`, con l'unica eccezione della `debug.keystore` standard di **React Native**.

### 2. Path traversal nel nome file

Il nome digitato nella schermata di anteprima veniva concatenato direttamente al percorso di destinazione in `saveToDevice`, `saveToGallery` e `copyToCache`. Un nome come `../../files/qualcosa` faceva scrivere il file fuori dalla cartella prevista, anche all'interno della **sandbox** privata dell'app, sovrascrivendo potenzialmente file interni ([OWASP, Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)).

La **PR** #1 ha introdotto `sanitizeFileName`, che sostituisce separatori di percorso, caratteri riservati e caratteri di controllo. Questa **PR** la rafforza eliminando anche i punti iniziali e finali (niente `..` né file nascosti) e limitando la lunghezza a 100 caratteri; inoltre `copyToCache` la applica di nuovo al proprio interno, come difesa in profondità (**defense in depth**), perché scrive con un percorso diretto nella **cache**. I casi sono coperti da `__tests__/files.test.ts`.

### 3. Scansioni rimaste nella cache

Le pagine **JPEG** e il **PDF** prodotti da **ML Kit**, insieme alle copie create per la condivisione, restavano nella **cache** dell'app senza mai essere cancellati, perché `cleanTempFiles` esisteva ma non veniva chiamata. Per un'app che tratta documenti personali (documenti d'identità, contratti, referti) conviene ridurre al minimo il tempo di permanenza dei dati ([MASVS-STORAGE](https://mas.owasp.org/MASVS/05-MASVS-STORAGE/)).

Ora, quando si lascia l'anteprima, `PreviewScreen` elimina pagine, **PDF** e copie di condivisione. `cleanTempFiles` cancella soltanto file che si trovano nella **cache** dell'app, per cui un file salvato dall'utente non può mai essere rimosso per errore.

### 4. Esclusione da backup e trasferimento

`android:allowBackup="false"` era già impostato, ma da Android 12 non blocca il trasferimento da dispositivo a dispositivo ([Android, backup e ripristino](https://developer.android.com/guide/topics/data/autobackup#include-exclude-android-12)). È stato aggiunto `res/xml/data_extraction_rules.xml`, che esclude tutti i domini sia dal backup cloud sia dal trasferimento.

### 5. Dipendenze npm

`npm audit` segnalava 7 vulnerabilità (1 bassa, 6 medie) in `fast-xml-parser` ([GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4)) e `minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Sono tutte dipendenze transitive degli strumenti di sviluppo (**React Native CLI**, **ESLint**, **Jest**) e non finiscono nell'**APK**. `npm audit fix` le ha aggiornate senza cambi di versione maggiore e ora `npm audit` riporta 0 vulnerabilità. Nessuna dipendenza di runtime risultava vulnerabile.

## Problemi documentati, da decidere

### 6. Salvataggio nelle cartelle pubbliche

Con la **PR** #1 i documenti vengono salvati tramite **MediaStore** in `Download/ScanMe` e `Pictures/ScanMe`, una soluzione più corretta della copia con percorso diretto. Restano però cartelle pubbliche, dove qualunque app con permesso di lettura dei file multimediali o accesso completo alla memoria può leggerli. È coerente con la promessa del prodotto (il file è dell'utente e resta sul dispositivo), ma va reso esplicito. La raccomandazione è passare allo **Storage Access Framework** (**SAF**), con cui l'utente sceglie la cartella o il provider cloud (Google Drive, OneDrive, Dropbox, Nextcloud) senza permessi aggiuntivi ([Android, accesso ai documenti](https://developer.android.com/training/data-storage/shared/documents-files)). Questo rafforza anche il posizionamento rispetto ad Adobe Scan e Microsoft Lens, perché la scelta della destinazione diventa nativa e non vincolata.

### 7. R8/ProGuard disattivato

`enableProguardInReleaseBuilds = false` lascia il codice **Kotlin** e **Java** non offuscato e include classi inutilizzate. Il rischio è contenuto perché l'app non contiene segreti, ma attivare **R8** riduce dimensione e superficie esposta ([Android, R8](https://developer.android.com/build/shrink-code)). Non è stato attivato qui perché richiede una build e un test su dispositivo per verificare le regole `keep` di **ML Kit** e dei moduli nativi.

### 8. FLAG_SECURE

Senza `FLAG_SECURE` l'anteprima dei documenti compare nella schermata delle app recenti e può essere catturata da screenshot o registrazioni dello schermo ([Android, FLAG_SECURE](https://developer.android.com/security/fraud-prevention/activities)). Attivarlo impedisce però anche gli screenshot volontari dell'utente, per cui si consiglia un'opzione nelle impostazioni, o in alternativa di applicarlo solo alla schermata di anteprima.

### 9. ML Kit in beta

`play-services-mlkit-document-scanner:16.0.0-beta1` è una versione **beta**. Conviene verificare la versione più recente nelle note di rilascio prima della pubblicazione ([ML Kit, release notes](https://developers.google.com/ml-kit/release-notes)).

### 10. Versione dinamica di jsc-android

`jscFlavor` usa `2026004.+`, una versione dinamica che rende la build non riproducibile. Con **Hermes** attivo (`hermesEnabled=true`) la libreria non viene inclusa, quindi l'impatto è nullo finché si resta su **Hermes**.

## Controlli senza problemi

- **Permessi**: sono dichiarati solo `CAMERA` e, dalla **PR** #1, `WRITE_EXTERNAL_STORAGE` limitato ad Android 9 (`maxSdkVersion="28"`); nessun permesso di rete o superfluo.
- **Componenti esportati**: solo `MainActivity` è `exported="true"`, come richiesto per l'icona di avvio, e non riceve dati da intent esterni.
- **Traffico in chiaro**: `usesCleartextTraffic` è un segnaposto che il **plugin Gradle** di **React Native** imposta a `false` in **release**; l'app comunque non effettua chiamate di rete.
- **Secrets**: nessuna chiave **API**, token o credenziale nel codice; le uniche password sono quelle pubbliche della `debug.keystore`, ora non più usate in **release**.
- **Modulo nativo** `DocumentScannerModule`: restituisce solo **URI** prodotti da **ML Kit** e non espone metodi che accettino percorsi arbitrari.

## Verifiche eseguite

- `npm audit`: 0 vulnerabilità dopo la correzione.
- `npx tsc --noEmit`: nessun errore.
- `npx jest __tests__/files.test.ts`: 5 test superati. Il test esistente `App.test.tsx` fallisce anche prima di questa **PR** (configurazione `transformIgnorePatterns` di **Jest** per `@react-navigation`), problema non legato alla sicurezza.
- La build **Gradle** non è stata eseguita in questo ambiente perché manca l'**Android SDK**: va verificata con `./gradlew assembleDebug` e `./gradlew assembleRelease`.
