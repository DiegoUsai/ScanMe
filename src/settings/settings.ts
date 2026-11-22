import ReactNativeBlobUtil from 'react-native-blob-util';
import type {FolderDestination} from '../native/StorageAccess';

/** Formati di uscita offerti all'utente. */
export type OutputFormat = 'pdf' | 'jpg' | 'gallery';

/**
 * Un progetto raggruppa le scansioni: al salvataggio diventa una sottocartella
 * con il suo nome dentro la sua destinazione.
 */
export interface Project {
  id: string;
  name: string;
  /** Destinazione del progetto; assente = destinazione predefinita. */
  destination?: FolderDestination;
  /** true = sul telefono (Download/ScanMe), qualunque sia la predefinita. */
  phone?: boolean;
  /**
   * true = `destination` è già la cartella del progetto: i file ci vanno
   * dentro direttamente, senza creare una sottocartella con il nome del
   * progetto. Assente nei progetti creati prima di questa modifica, che
   * continuano a usare la sottocartella per non spostare i file già salvati.
   */
  ownFolder?: boolean;
}

export interface Settings {
  /** Cartella predefinita; assente = Download/ScanMe tramite MediaStore. */
  destination?: FolderDestination;
  /** Formato proposto nell'anteprima. */
  defaultFormat: OutputFormat;
  projects: Project[];
}

export const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'pdf',
  projects: [],
};

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
  const settings: Settings = {...DEFAULT_SETTINGS, projects: []};
  if (
    typeof data.defaultFormat === 'string' &&
    FORMATS.includes(data.defaultFormat as OutputFormat)
  ) {
    settings.defaultFormat = data.defaultFormat as OutputFormat;
  }
  settings.destination = parseDestination(data.destination);
  settings.projects = Array.isArray(data.projects)
    ? data.projects.flatMap((p: unknown) => {
        const project = p as Record<string, unknown> | null;
        if (
          !project ||
          typeof project.id !== 'string' ||
          typeof project.name !== 'string' ||
          project.name.trim() === ''
        ) {
          return [];
        }
        return [
          {
            id: project.id,
            name: project.name,
            destination: parseDestination(project.destination),
            phone: project.phone === true ? true : undefined,
            ownFolder: project.ownFolder === true ? true : undefined,
          },
        ];
      })
    : [];
  return settings;
}

function parseDestination(raw: unknown): FolderDestination | undefined {
  const dest = raw as Record<string, unknown> | undefined | null;
  if (
    dest &&
    typeof dest.uri === 'string' &&
    dest.uri.startsWith('content://') &&
    typeof dest.name === 'string'
  ) {
    return {
      uri: dest.uri,
      name: dest.name,
      provider: typeof dest.provider === 'string' ? dest.provider : undefined,
    };
  }
  return undefined;
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
