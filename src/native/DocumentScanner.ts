import {NativeModules} from 'react-native';

interface ScanResult {
  pages: string[];
  pdfUri?: string;
  pageCount?: number;
}

const {DocumentScanner} = NativeModules;

export function scan(pageLimit: number = 0): Promise<ScanResult> {
  return DocumentScanner.scan(pageLimit);
}
