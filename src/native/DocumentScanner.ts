import {NativeModules} from 'react-native';

export interface ScanResult {
  /** URI `file://` delle singole pagine in JPEG. */
  pages: string[];
  /** URI del PDF multipagina generato dallo scanner, se disponibile. */
  pdfUri?: string;
  pageCount?: number;
}

/** Codici di errore restituiti dal modulo nativo (vedi DocumentScannerModule.kt). */
export const ScanErrorCode = {
  Cancelled: 'SCAN_CANCELLED',
  InProgress: 'SCAN_IN_PROGRESS',
  NoActivity: 'NO_ACTIVITY',
  InitError: 'SCAN_INIT_ERROR',
  Unavailable: 'SCANNER_UNAVAILABLE',
} as const;

const {DocumentScanner} = NativeModules;

/** Restituisce il codice di un errore nativo, se presente. */
export function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const {code} = error as {code: unknown};
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Avvia lo scanner di documenti (ML Kit su Android).
 * @param pageLimit numero massimo di pagine; 0 = nessun limite.
 */
export function scan(pageLimit: number = 0): Promise<ScanResult> {
  if (!DocumentScanner) {
    // Il modulo esiste solo su Android: evita un TypeError su iOS o nei test.
    const error = Object.assign(new Error('Document scanner not available'), {
      code: ScanErrorCode.Unavailable,
    });
    return Promise.reject(error);
  }
  return DocumentScanner.scan(pageLimit);
}
