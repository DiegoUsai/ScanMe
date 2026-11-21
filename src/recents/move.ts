import {
  copyFileToCache,
  deleteSavedFile,
  describeFolder,
  hasAccess,
  saveToFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import {saveToDevice, cleanTempFiles} from '../utils/files';
import {
  projectFolderName,
  resolveDestination,
  sameDestination,
} from '../settings/projects';
import type {Project, Settings} from '../settings/settings';
import {t} from '../i18n';
import type {RecentFile} from './recents';

export interface MoveResult {
  entry: RecentFile;
  /** false se la copia è riuscita ma il file originale non si è potuto cancellare. */
  originalRemoved: boolean;
}

/** Estensione del file a partire dal tipo. */
function extension(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'pdf' : 'jpg';
}

/** Nome dei file di un salvataggio: "_N" solo se le pagine JPG sono più di una. */
export function movedFileNames(entry: RecentFile): string[] {
  const uris = entry.uris ?? [entry.uri];
  const ext = extension(entry.mimeType);
  return uris.map((_, i) =>
    uris.length > 1 ? `${entry.name}_${i + 1}.${ext}` : `${entry.name}.${ext}`,
  );
}

/** Etichetta della posizione di un progetto (o della predefinita), per l'interfaccia. */
export function describeLocation(
  project: Project | undefined,
  settings: Settings,
): string {
  const target = resolveDestination(project, settings.destination);
  const root = target ? describeFolder(target) : t('downloadFolder');
  return project ? `${root} › ${projectFolderName(project)}` : root;
}

/**
 * Sposta un file salvato nella posizione di un progetto (o, senza progetto,
 * nella destinazione predefinita): è il progetto che comanda dove sta il file.
 * Prima copia, poi cancella l'originale, così un errore a metà non perde nulla.
 */
export async function moveRecent(
  entry: RecentFile,
  project: Project | undefined,
  settings: Settings,
): Promise<MoveResult> {
  const target = resolveDestination(project, settings.destination);
  if (target && !(await hasAccess(target.uri))) {
    throw Object.assign(new Error('Folder access lost'), {
      code: StorageErrorCode.PermissionDenied,
    });
  }
  const subFolders = project ? [projectFolderName(project)] : [];
  const sources = entry.uris ?? [entry.uri];
  const names = movedFileNames(entry);
  const temp: string[] = [];
  const created: string[] = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      const local = await copyFileToCache(sources[i], names[i]);
      temp.push(local);
      created.push(
        target
          ? await saveToFolder(
              target,
              subFolders,
              names[i],
              entry.mimeType,
              local,
            )
          : await saveToDevice(local, names[i], entry.mimeType, subFolders[0]),
      );
    }
  } catch (error) {
    // Copia incompleta: si tolgono le copie già create e l'originale resta.
    await Promise.all(created.map(deleteSavedFile));
    throw error;
  } finally {
    await cleanTempFiles(temp);
  }
  const removed = await Promise.all(sources.map(deleteSavedFile));
  return {
    entry: {
      ...entry,
      uri: created[0],
      uris: created.length > 1 ? created : undefined,
      projectId: project?.id,
      destination: describeLocation(project, settings),
    },
    originalRemoved: removed.every(Boolean),
  };
}

/** true se spostare il file nel progetto cambia davvero la sua posizione. */
export function needsMove(
  entry: RecentFile,
  from: Project | undefined,
  to: Project | undefined,
  settings: Settings,
): boolean {
  if (from?.id === to?.id && entry.projectId === to?.id) {
    return false;
  }
  const sameFolder =
    (from ? projectFolderName(from) : '') === (to ? projectFolderName(to) : '');
  return !(
    sameFolder &&
    sameDestination(
      resolveDestination(from, settings.destination),
      resolveDestination(to, settings.destination),
    )
  );
}
