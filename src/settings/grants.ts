import {releaseAccess} from '../native/StorageAccess';
import {loadRecents} from '../recents/recents';
import type {RecentFile} from '../recents/recents';
import type {Settings} from './settings';

/**
 * Android tiene un solo permesso persistente per URI e non conta chi lo usa:
 * rilasciarlo toglie l'accesso a tutto ciò che vi fa riferimento. Prima di
 * rilasciare un permesso bisogna quindi verificare che nulla lo usi più.
 */

/** Tutti gli URI dei file salvati di una voce degli ultimi file. */
function recentUris(r: RecentFile): string[] {
  return r.uris ?? [r.uri];
}

/**
 * true se la cartella `treeUri` è ancora usata: è la destinazione predefinita,
 * quella di un progetto, o contiene file presenti negli ultimi file (i documenti
 * creati con il SAF hanno URI `<treeUri>/document/...`).
 */
export function isFolderInUse(
  treeUri: string,
  settings: Settings,
  recents: RecentFile[],
): boolean {
  if (settings.destination?.uri === treeUri) {
    return true;
  }
  if (settings.projects.some(p => p.destination?.uri === treeUri)) {
    return true;
  }
  const prefix = `${treeUri}/document/`;
  return recents.some(r => recentUris(r).some(u => u.startsWith(prefix)));
}

/** true se il documento `uri` è negli ultimi file (serve per riaprirlo o spostarlo). */
export function isFileInUse(uri: string, recents: RecentFile[]): boolean {
  return recents.some(r => recentUris(r).includes(uri));
}

/** Rilascia il permesso sulla cartella solo se nulla la usa più. */
export async function releaseFolderIfUnused(
  treeUri: string,
  settings: Settings,
): Promise<void> {
  try {
    if (!isFolderInUse(treeUri, settings, await loadRecents())) {
      await releaseAccess(treeUri);
    }
  } catch {
    // Best effort: un permesso non rilasciato non deve bloccare l'utente.
  }
}

/** Rilascia il permesso su un singolo file se non è negli ultimi file. */
export async function releaseFileIfUnused(uri: string): Promise<void> {
  try {
    if (!isFileInUse(uri, await loadRecents())) {
      await releaseAccess(uri);
    }
  } catch {
    // Best effort.
  }
}
