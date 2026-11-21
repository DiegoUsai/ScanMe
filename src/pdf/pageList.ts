import type {ComposePage} from '../native/PdfEditor';

/** Una pagina nell'editor, con la miniatura da mostrare. */
export interface EditorPage {
  /** Chiave stabile per la lista. */
  key: string;
  /** Pagina originale (indice 0-based) o nuova scansione (percorso JPEG). */
  source: ComposePage;
  /** Immagine da mostrare: miniatura della pagina PDF o la scansione stessa. */
  preview: string;
}

let counter = 0;
const nextKey = () => `p${++counter}`;

/** Pagine iniziali dalle miniature del PDF aperto. */
export function fromPdf(thumbnails: string[]): EditorPage[] {
  return thumbnails.map((thumb, index) => ({
    key: nextKey(),
    source: {type: 'pdf', index},
    preview: `file://${thumb}`,
  }));
}

/** Pagine nuove dalle scansioni (URI `file://` di ML Kit). */
export function fromScans(scans: string[]): EditorPage[] {
  return scans.map(uri => ({
    key: nextKey(),
    source: {type: 'image', path: uri},
    preview: uri,
  }));
}

/** Inserisce `added` prima della posizione `at` (0 = in testa, length = in fondo). */
export function insertAt(
  pages: EditorPage[],
  at: number,
  added: EditorPage[],
): EditorPage[] {
  const i = Math.min(Math.max(at, 0), pages.length);
  return [...pages.slice(0, i), ...added, ...pages.slice(i)];
}

export function removeAt(pages: EditorPage[], at: number): EditorPage[] {
  return pages.filter((_, i) => i !== at);
}

/** Sostituisce la pagina `at` con una o più scansioni. */
export function replaceAt(
  pages: EditorPage[],
  at: number,
  added: EditorPage[],
): EditorPage[] {
  return insertAt(removeAt(pages, at), at, added);
}

/** Sposta una pagina di una posizione (-1 indietro, +1 avanti). */
export function move(
  pages: EditorPage[],
  at: number,
  delta: -1 | 1,
): EditorPage[] {
  const to = at + delta;
  if (to < 0 || to >= pages.length) {
    return pages;
  }
  const next = [...pages];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** true se il documento è cambiato rispetto all'originale con `originalCount` pagine. */
export function isModified(
  pages: EditorPage[],
  originalCount: number,
): boolean {
  return (
    pages.length !== originalCount ||
    pages.some((p, i) => p.source.type !== 'pdf' || p.source.index !== i)
  );
}

export function toComposeSpec(pages: EditorPage[]): ComposePage[] {
  return pages.map(p => p.source);
}
