import {NativeModules} from 'react-native';

/** Cartella scelta dall'utente con il selettore di sistema (SAF). */
export interface FolderDestination {
  /** URI `content://` dell'albero, con permesso persistente. */
  uri: string;
  /** Nome della cartella come lo mostra il provider. */
  name: string;
  /** App che fornisce la cartella (es. "Drive", "Dropbox"), se nota. */
  provider?: string;
}

export const StorageErrorCode = {
  Cancelled: 'PICK_CANCELLED',
  PermissionDenied: 'PERMISSION_DENIED',
} as const;

const {StorageAccess} = NativeModules;

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Storage Access Framework not available'));
}

/** Apre il selettore di cartelle di Android e chiede un permesso persistente. */
export function pickFolder(): Promise<FolderDestination> {
  return StorageAccess ? StorageAccess.pickFolder() : unavailable();
}

/** true se l'app può ancora scrivere nella cartella. */
export async function hasAccess(uri: string): Promise<boolean> {
  return StorageAccess ? StorageAccess.hasAccess(uri) : false;
}

/** Rilascia il permesso su una cartella non più usata. */
export async function releaseAccess(uri: string): Promise<void> {
  if (StorageAccess) {
    await StorageAccess.releaseAccess(uri);
  }
}

/**
 * Copia un file locale nella cartella, dentro `subFolders` (create se mancano).
 * Restituisce l'URI `content://` del file creato.
 */
export function saveToFolder(
  folder: FolderDestination,
  subFolders: string[],
  fileName: string,
  mimeType: string,
  sourcePath: string,
): Promise<string> {
  return StorageAccess
    ? StorageAccess.saveFile(
        folder.uri,
        subFolders,
        fileName,
        mimeType,
        sourcePath,
      )
    : unavailable();
}

/** Etichetta breve per l'interfaccia, es. "Drive › Scansioni". */
export function describeFolder(folder: FolderDestination): string {
  return folder.provider && folder.provider !== folder.name
    ? `${folder.provider} › ${folder.name}`
    : folder.name;
}
