import ReactNativeBlobUtil from 'react-native-blob-util';
import type {FolderDestination} from '../native/StorageAccess';

/** Formati di uscita offerti all'utente. */
export type OutputFormat = 'pdf' | 'jpg' | 'gallery';

export interface Settings {
  /** Cartella predefinita; assente = Download/ScanMe tramite MediaStore. */
  destination?: FolderDestination;
  /** Formato proposto nell'anteprima. */
  defaultFormat: OutputFormat;
}

export const DEFAULT_SETTINGS: Settings = {defaultFormat: 'pdf'};

const FORMATS: readonly OutputFormat[] = ['pdf', 'jpg', 'gallery'];

/** File JSON nella memoria privata dell'app: non serve nessun permesso. */
function settingsPath(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/settings.json`;
}

/**
 * Valida i dati letti dal disco: un file corrotto o di una versione futura
 * non deve bloccare l'app, quindi ogni campo non valido torna al default.
 */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) {
    return {...DEFAULT_SETTINGS};
  }
  const data = raw as Record<string, unknown>;
  const settings: Settings = {...DEFAULT_SETTINGS};
  if (
    typeof data.defaultFormat === 'string' &&
    FORMATS.includes(data.defaultFormat as OutputFormat)
  ) {
    settings.defaultFormat = data.defaultFormat as OutputFormat;
  }
  const dest = data.destination as Record<string, unknown> | undefined;
  if (
    dest &&
    typeof dest.uri === 'string' &&
    dest.uri.startsWith('content://') &&
    typeof dest.name === 'string'
  ) {
    settings.destination = {
      uri: dest.uri,
      name: dest.name,
      provider: typeof dest.provider === 'string' ? dest.provider : undefined,
    };
  }
  return settings;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const path = settingsPath();
    if (!(await ReactNativeBlobUtil.fs.exists(path))) {
      return {...DEFAULT_SETTINGS};
    }
    return parseSettings(
      JSON.parse(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')),
    );
  } catch {
    return {...DEFAULT_SETTINGS};
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ReactNativeBlobUtil.fs.writeFile(
    settingsPath(),
    JSON.stringify(settings),
    'utf8',
  );
}
