import {sanitizeFileName} from '../utils/files';
import type {FolderDestination} from '../native/StorageAccess';
import type {Project, Settings} from './settings';

/** Nome della sottocartella del progetto: lo stesso nome, ripulito dai caratteri non validi. */
export function projectFolderName(project: Project): string {
  return sanitizeFileName(project.name);
}

/**
 * Sottocartelle in cui finiscono i file del progetto, dentro la sua
 * destinazione. Una cartella scelta apposta per il progetto è già la cartella
 * del progetto: aggiungere anche il nome creerebbe due cartelle annidate
 * (es. Drive › Fatture › Fatture).
 */
export function projectSubFolders(project: Project | undefined): string[] {
  if (!project) {
    return [];
  }
  if (!project.phone && project.destination && project.ownFolder) {
    return [];
  }
  return [projectFolderName(project)];
}

/** Due progetti (o nessun progetto) mettono i file nello stesso posto. */
export function sameLocation(
  a: Project | undefined,
  b: Project | undefined,
  fallback: FolderDestination | undefined,
): boolean {
  return (
    sameDestination(
      resolveDestination(a, fallback),
      resolveDestination(b, fallback),
    ) && projectSubFolders(a).join('/') === projectSubFolders(b).join('/')
  );
}

/** Perché un nome di progetto non va bene; undefined se è valido. */
export type ProjectNameError = 'empty' | 'duplicate';

export function projectNameError(
  name: string,
  existing: Project[],
): ProjectNameError | undefined {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'empty';
  }
  if (existing.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'duplicate';
  }
  return undefined;
}

/** Nuovo progetto; restituisce undefined se il nome è vuoto o già usato. */
export function createProject(
  name: string,
  existing: Project[],
): Project | undefined {
  const trimmed = name.trim();
  if (projectNameError(trimmed, existing)) {
    return undefined;
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
  };
}

/**
 * Dove finisce un file: la destinazione del progetto se ne ha una, altrimenti
 * quella scelta per il salvataggio (o la predefinita). undefined = Download.
 */
export function resolveDestination(
  project: Project | undefined,
  fallback: FolderDestination | undefined,
): FolderDestination | undefined {
  if (project?.phone) {
    return undefined;
  }
  return project?.destination ?? fallback;
}

/** Due destinazioni coincidono (undefined = Download/ScanMe sul telefono). */
export function sameDestination(
  a: FolderDestination | undefined,
  b: FolderDestination | undefined,
): boolean {
  return (a?.uri ?? null) === (b?.uri ?? null);
}

export function findProject(
  settings: Settings,
  id: string | undefined,
): Project | undefined {
  return id ? settings.projects.find(p => p.id === id) : undefined;
}
