This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Generare e installare l'APK su Android

Questa sezione spiega come produrre un file **APK** di ScanMe e come installarlo su un dispositivo Android senza passare dal Play Store. I comandi sono allineati alla configurazione presente in `android/build.gradle`, `android/app/build.gradle` e `android/gradle.properties`.

## Prerequisiti

- **Node.js** 22.11 o superiore (vincolo `engines` del `package.json`) e dipendenze installate con `npm install`, perché il build **Gradle** legge il plugin React Native da `node_modules`.
- **JDK** 17 o superiore, come richiesto da React Native e dal **Gradle wrapper** del progetto (Gradle 9.4.1).
- **Android SDK** con `compileSdk` 37, **Build Tools** 37.0.0 e **NDK** 27.1.12297006, installabili da Android Studio (SDK Manager). La variabile `ANDROID_HOME` deve puntare alla cartella dell'SDK.
- **adb** (Android Debug Bridge), incluso negli **Platform Tools** dell'SDK, solo se si vuole installare l'APK via cavo.

Tutti i comandi seguenti vanno eseguiti dalla cartella `android/` (su Windows usare `gradlew.bat` al posto di `./gradlew`).

```sh
cd android
```

## APK di debug

```sh
./gradlew assembleDebug
```

Il file viene generato in `android/app/build/outputs/apk/debug/app-debug.apk` ed è firmato con la chiave di debug inclusa nel repository (`android/app/debug.keystore`).

Nota importante: nella variante di debug React Native **non incorpora il bundle JavaScript** nell'APK, quindi l'app all'avvio lo cerca sul server **Metro**. Per usarla occorre avviare `npm start` sul computer e, con il telefono collegato via USB, eseguire `adb reverse tcp:8081 tcp:8081`. Per un'APK autonoma da usare lontano dal computer serve la variante di release.

## APK di release

```sh
./gradlew assembleRelease
```

Il file viene generato in `android/app/build/outputs/apk/release/app-release.apk` e contiene il bundle JavaScript compilato con **Hermes**, quindi funziona senza Metro.

### Firma della release

Allo stato attuale `android/app/build.gradle` firma anche la release con la chiave di debug (`signingConfig signingConfigs.debug` nel blocco `release`). Questo va bene per prove personali e per il sideload, ma non per la distribuzione: Google Play rifiuta gli APK firmati con la chiave di debug e chiunque possieda quella chiave pubblica potrebbe firmare un aggiornamento.

Per una firma di produzione:

1. Generare un **keystore** privato (da custodire fuori dal repository, perché perderlo significa non poter più aggiornare l'app):

   ```sh
   keytool -genkeypair -v -storetype PKCS12 -keystore scanme-release.keystore \
     -alias scanme -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copiare il file in `android/app/` e aggiungere le credenziali in `~/.gradle/gradle.properties` (file personale, non versionato):

   ```properties
   SCANME_UPLOAD_STORE_FILE=scanme-release.keystore
   SCANME_UPLOAD_KEY_ALIAS=scanme
   SCANME_UPLOAD_STORE_PASSWORD=*****
   SCANME_UPLOAD_KEY_PASSWORD=*****
   ```

3. In `android/app/build.gradle` aggiungere una configurazione `release` dentro `signingConfigs` e usarla nel `buildType` di release:

   ```groovy
   signingConfigs {
       debug { /* invariato */ }
       release {
           if (project.hasProperty('SCANME_UPLOAD_STORE_FILE')) {
               storeFile file(SCANME_UPLOAD_STORE_FILE)
               storePassword SCANME_UPLOAD_STORE_PASSWORD
               keyAlias SCANME_UPLOAD_KEY_ALIAS
               keyPassword SCANME_UPLOAD_KEY_PASSWORD
           }
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           // ...
       }
   }
   ```

4. Aggiungere `*.keystore` (eccetto `debug.keystore`) al `.gitignore` per non pubblicare la chiave per errore, poi rieseguire `./gradlew assembleRelease`.

Per verificare con quale chiave è firmato un APK si può usare `apksigner verify --print-certs app-release.apk` (dai Build Tools dell'SDK). Se l'app andrà sul Play Store, il formato richiesto è l'**AAB**, che si genera con `./gradlew bundleRelease`.

### Ridurre la dimensione dell'APK

`android/gradle.properties` compila per quattro architetture (`armeabi-v7a,arm64-v8a,x86,x86_64`). Per un APK destinato solo a telefoni moderni si può limitare la build a `arm64-v8a`:

```sh
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Installare l'APK sul dispositivo

### Via cavo con adb

1. Sul telefono attivare le **Opzioni sviluppatore** (toccare sette volte "Numero build" in Impostazioni → Info sul telefono) e abilitare il **Debug USB**.
2. Collegare il telefono, accettare la richiesta di autorizzazione e verificare che sia visibile con `adb devices`.
3. Installare l'APK (`-r` sostituisce una versione già presente mantenendo i dati):

   ```sh
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

Se compare l'errore `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, sul dispositivo c'è una versione firmata con una chiave diversa: va disinstallata prima con `adb uninstall com.scanmeapp`, sapendo che questo cancella i documenti salvati nella memoria privata dell'app.

### Sideload senza computer

1. Copiare il file APK sul telefono (cavo, Google Drive, email, chat).
2. Aprirlo dal gestore file: Android chiederà di consentire l'installazione di **app sconosciute** per l'app da cui si è aperto il file (Impostazioni → App → Accesso speciale → Installa app sconosciute).
3. Confermare l'installazione. Play Protect potrebbe mostrare un avviso perché l'app non proviene dal Play Store, ed è un comportamento atteso.

L'app richiede almeno Android 7.0 (`minSdkVersion` 24). Lo scanner usa **ML Kit Document Scanner**, che richiede i Google Play Services sul dispositivo.

## Fonti

- [Publishing to Google Play Store (React Native)](https://reactnative.dev/docs/signed-apk-android)
- [Running on device (React Native)](https://reactnative.dev/docs/running-on-device)
- [Build your app from the command line (Android Developers)](https://developer.android.com/build/building-cmdline)
- [Sign your app (Android Developers)](https://developer.android.com/studio/publish/app-signing)
- [Android Debug Bridge (adb)](https://developer.android.com/tools/adb)
- [ML Kit Document Scanner](https://developers.google.com/ml-kit/vision/doc-scanner/android)

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
