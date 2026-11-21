import ReactNativeBlobUtil from 'react-native-blob-util';
import {Platform, PermissionsAndroid} from 'react-native';
import {t} from '../i18n';

/** Sottocartella usata dentro Download/ e Pictures/ per i file salvati. */
const APP_FOLDER = 'ScanMe';

/** Caratteri non ammessi nei nomi file su Android (e sulla maggior parte dei filesystem). */
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * Descrittore atteso dal modulo nativo MediaCollection di react-native-blob-util.
 * Il tipo pubblicato dalla libreria dichiara `path` invece di `name`, ma il codice
 * nativo legge `name`: per questo lo ridefiniamo qui.
 */
type MediaStoreFile = {name: string; parentFolder: string; mimeType: string};
type MediaStoreTarget = 'Download' | 'Image';

export function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${t('fileNameDefault')} ${date} ${time}`;
}

/** Lunghezza massima del nome base, lasciando spazio a suffisso ed estensione. */
const MAX_FILE_NAME_LENGTH = 100;

/**
 * Rende sicuro il nome scelto dall'utente: rimuove i caratteri non validi
 * (es. "/" creerebbe sottocartelle o farebbe fallire il salvataggio), i punti
 * iniziali e finali (niente "..", niente file nascosti), limita la lunghezza e,
 * se il risultato è vuoto, ricade sul nome predefinito. Insieme evitano che il
 * nome faccia scrivere fuori dalla cartella prevista (path traversal).
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(INVALID_FILE_NAME_CHARS, '_')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '')
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : defaultFileName();
}

/** Converte un URI `file://` in percorso assoluto; gli URI `content://` restano invariati. */
function toNativePath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/**
 * Su Android 9 e precedenti la scrittura nelle cartelle pubbliche richiede
 * WRITE_EXTERNAL_STORAGE. Da Android 10 si passa da MediaStore e il permesso
 * non serve (né viene concesso).
 */
async function ensureLegacyWritePermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version >= 29) {
    return;
  }
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  if (status !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('WRITE_EXTERNAL_STORAGE not granted');
  }
}

async function copyToMediaStore(
  sourceUri: string,
  fileName: string,
  mimeType: string,
  target: MediaStoreTarget,
): Promise<string> {
  await ensureLegacyWritePermission();
  const file: MediaStoreFile = {
    name: fileName,
    parentFolder: APP_FOLDER,
    mimeType,
  };
  return ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
    file as unknown as Parameters<
      typeof ReactNativeBlobUtil.MediaCollection.copyToMediaStore
    >[0],
    target,
    toNativePath(sourceUri),
  );
}

/**
 * Salva il file in Download/ScanMe tramite MediaStore.
 * Restituisce l'URI del file creato. Se esiste già un file con lo stesso
 * nome, Android ne crea uno nuovo con un suffisso invece di sovrascriverlo.
 */
export async function saveToDevice(
  sourceUri: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  return copyToMediaStore(sourceUri, fileName, mimeType, 'Download');
}

/** Salva un'immagine JPEG in Pictures/ScanMe, così compare nella galleria. */
export async function saveToGallery(
  sourceUri: string,
  fileName: string,
): Promise<string> {
  return copyToMediaStore(sourceUri, `${fileName}.jpg`, 'image/jpeg', 'Image');
}

/** Copia il file nella cache dell'app (sovrascrivendo l'eventuale copia precedente). */
export async function copyToCache(
  uri: string,
  fileName: string,
): Promise<string> {
  const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${sanitizeFileName(
    fileName,
  )}`;
  await ReactNativeBlobUtil.fs.cp(toNativePath(uri), cachePath);
  return cachePath;
}

/**
 * Elimina i file temporanei (scansioni ML Kit e copie per la condivisione).
 * Agisce solo dentro la cache privata dell'app: un percorso altrove, o un URI
 * `content://`, viene ignorato, così un file salvato dall'utente non può mai
 * essere cancellato per errore.
 */
export async function cleanTempFiles(paths: string[]): Promise<void> {
  const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  for (const uri of paths) {
    const p = toNativePath(uri);
    if (!p.startsWith(`${cacheDir}/`) || p.includes('..')) {
      continue;
    }
    try {
      if (await ReactNativeBlobUtil.fs.exists(p)) {
        await ReactNativeBlobUtil.fs.unlink(p);
      }
    } catch {
      // Best effort: un file temporaneo non rimosso non deve bloccare l'utente.
    }
  }
}
