import {sanitizeFileName} from '../utils/files';
import type {FolderDestination} from '../native/StorageAccess';
import type {Project, Settings} from './settings';

/** Nome della sottocartella del progetto: lo stesso nome, ripulito dai caratteri non validi. */
export function projectFolderName(project: Project): string {
  return sanitizeFileName(project.name);
}

/** Nuovo progetto; restituisce undefined se il nome è vuoto o già usato. */
export function createProject(
  name: string,
  existing: Project[],
): Project | undefined {
  const trimmed = name.trim();
  if (
    trimmed === '' ||
    existing.some(p => p.name.toLowerCase() === trimmed.toLowerCase())
  ) {
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
