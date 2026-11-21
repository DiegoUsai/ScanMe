import ReactNativeBlobUtil from 'react-native-blob-util';
import {createThumbnail} from '../native/StorageAccess';

/** Un documento salvato da ScanMe, mostrato tra gli ultimi file in home. */
export interface RecentFile {
  id: string;
  /** Nome scelto dall'utente, senza estensione. */
  name: string;
  /** URI `content://` del file (per JPG su più pagine: la prima pagina). */
  uri: string;
  mimeType: string;
  pageCount: number;
  /** Data del salvataggio in millisecondi. */
  savedAt: number;
  /** Dove è stato salvato, come lo mostra l'interfaccia. */
  destination: string;
  /** Progetto a cui appartiene, se scelto al salvataggio. */
  projectId?: string;
  /** Percorso della miniatura nella memoria privata dell'app. */
  thumbnail?: string;
}

/** Quanti file tenere nell'elenco: i più vecchi escono con le loro miniature. */
export const MAX_RECENTS = 50;
const THUMBNAIL_SIZE = 240;

function dir(): string {
  return ReactNativeBlobUtil.fs.dirs.DocumentDir;
}
function indexPath(): string {
  return `${dir()}/recents.json`;
}
function thumbnailPath(id: string): string {
  return `${dir()}/thumbnails/${id}.jpg`;
}

/** Valida l'indice letto dal disco, scartando le voci incomplete. */
export function parseRecents(raw: unknown): RecentFile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (r): r is RecentFile =>
      typeof r === 'object' &&
      r !== null &&
      typeof r.id === 'string' &&
      typeof r.name === 'string' &&
      typeof r.uri === 'string' &&
      typeof r.mimeType === 'string' &&
      typeof r.pageCount === 'number' &&
      typeof r.savedAt === 'number' &&
      typeof r.destination === 'string',
  );
}

/**
 * Inserisce `entry` in testa e taglia a `max` voci.
 * Restituisce il nuovo elenco e le voci uscite, di cui cancellare la miniatura.
 */
export function pushRecent(
  list: RecentFile[],
  entry: RecentFile,
  max: number = MAX_RECENTS,
): {list: RecentFile[]; dropped: RecentFile[]} {
  const next = [entry, ...list.filter(r => r.id !== entry.id)];
  return {list: next.slice(0, max), dropped: next.slice(max)};
}

export async function loadRecents(): Promise<RecentFile[]> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(indexPath()))) {
      return [];
    }
    return parseRecents(
      JSON.parse(await ReactNativeBlobUtil.fs.readFile(indexPath(), 'utf8')),
    );
  } catch {
    return [];
  }
}

async function writeRecents(list: RecentFile[]): Promise<void> {
  await ReactNativeBlobUtil.fs.writeFile(
    indexPath(),
    JSON.stringify(list),
    'utf8',
  );
}

async function deleteThumbnail(entry: RecentFile): Promise<void> {
  if (!entry.thumbnail) {
    return;
  }
  try {
    if (await ReactNativeBlobUtil.fs.exists(entry.thumbnail)) {
      await ReactNativeBlobUtil.fs.unlink(entry.thumbnail);
    }
  } catch {
    // Best effort.
  }
}

/**
 * Registra un file appena salvato. La miniatura nasce dalla prima pagina
 * scansionata; se non si riesce a crearla il file entra comunque nell'elenco.
 */
export async function addRecent(
  entry: Omit<RecentFile, 'id' | 'savedAt' | 'thumbnail'>,
  firstPage: string,
): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let thumbnail: string | undefined;
  try {
    thumbnail = await createThumbnail(
      firstPage,
      thumbnailPath(id),
      THUMBNAIL_SIZE,
    );
  } catch {
    thumbnail = undefined;
  }
  const current = await loadRecents();
  const {list, dropped} = pushRecent(current, {
    ...entry,
    id,
    savedAt: Date.now(),
    thumbnail,
  });
  await writeRecents(list);
  await Promise.all(dropped.map(deleteThumbnail));
}

/** Toglie un file dall'elenco (il file salvato non viene toccato). */
export async function removeRecent(id: string): Promise<RecentFile[]> {
  const current = await loadRecents();
  const entry = current.find(r => r.id === id);
  const list = current.filter(r => r.id !== id);
  await writeRecents(list);
  if (entry) {
    await deleteThumbnail(entry);
  }
  return list;
}
