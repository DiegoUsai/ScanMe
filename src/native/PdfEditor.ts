import {NativeModules} from 'react-native';

export interface OpenedPdf {
  /** URI `content://` dell'originale. */
  uri: string;
  /** Nome del file, con estensione. */
  name: string;
  /** Copia nella cache dell'app su cui lavorano anteprima e composizione. */
  cachePath: string;
  pageCount: number;
  /** true se l'app può sovrascrivere l'originale. */
  writable: boolean;
}

/** Pagina del nuovo PDF: una pagina dell'originale o una nuova scansione. */
export type ComposePage =
  | {type: 'pdf'; index: number}
  | {type: 'image'; path: string};

export const PdfErrorCode = {
  Cancelled: 'PICK_CANCELLED',
  Protected: 'PDF_PROTECTED',
  PermissionDenied: 'PERMISSION_DENIED',
} as const;

const {PdfEditor} = NativeModules;

function unavailable(): Promise<never> {
  return Promise.reject(new Error('PDF editor not available'));
}

/** Fa scegliere un PDF qualsiasi con il selettore di sistema. */
export function pickPdf(): Promise<OpenedPdf> {
  return PdfEditor ? PdfEditor.pickPdf() : unavailable();
}

/** Riapre un PDF già noto (es. dagli ultimi file). */
export function loadPdf(uri: string): Promise<OpenedPdf> {
  return PdfEditor ? PdfEditor.loadDocument(uri) : unavailable();
}

export function renderThumbnails(
  cachePath: string,
  maxSize: number,
): Promise<string[]> {
  return PdfEditor
    ? PdfEditor.renderThumbnails(cachePath, maxSize)
    : unavailable();
}

/** Compone il nuovo PDF in `outPath` e restituisce il numero di pagine. */
export function composePdf(
  sourcePath: string | null,
  pages: ComposePage[],
  outPath: string,
): Promise<number> {
  return PdfEditor
    ? PdfEditor.compose(sourcePath, pages, outPath)
    : unavailable();
}

/** Sovrascrive l'originale: da chiamare solo dopo una conferma esplicita. */
export function overwritePdf(uri: string, path: string): Promise<string> {
  return PdfEditor ? PdfEditor.overwrite(uri, path) : unavailable();
}
