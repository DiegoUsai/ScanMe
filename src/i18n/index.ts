import {NativeModules, Platform} from 'react-native';

const deviceLocale =
  Platform.OS === 'android'
    ? NativeModules.I18nManager?.localeIdentifier ?? 'en'
    : 'en';

const isItalian = deviceLocale.startsWith('it');

const strings = {
  it: {
    appName: 'ScanMe',
    scan: 'Scansiona',
    scanDocument: 'Scansiona documento',
    gallery: 'Galleria',
    noScans: 'Nessuna scansione.\nTocca il pulsante per iniziare.',
    preview: 'Anteprima',
    back: 'Indietro',
    pages: 'pagine',
    page: 'pagina',
    save: 'Salva',
    saveToDevice: 'Salva sul dispositivo',
    saveToGallery: 'Salva in galleria',
    share: 'Condividi',
    delete: 'Elimina',
    deleteConfirm: 'Eliminare questo documento?',
    cancel: 'Annulla',
    confirm: 'Conferma',
    fileName: 'Nome file',
    fileNameDefault: 'Scansione',
    savePdf: 'Salva come PDF',
    saveJpg: 'Salva come JPG',
    exportFormat: 'Formato di esportazione',
    quality: 'Qualità',
    qualityHigh: 'Alta',
    qualityMedium: 'Media',
    qualityLow: 'Bassa',
    saved: 'Salvato!',
    shared: 'Condiviso!',
    error: 'Errore',
    scanError: 'Errore durante la scansione',
    saveError: 'Errore durante il salvataggio',
    shareError: 'Errore durante la condivisione',
    scannerUnavailable: 'Scanner non disponibile su questo dispositivo',
    cameraPermission: 'Permesso fotocamera necessario',
    recentScans: 'Scansioni recenti',
    filters: 'Filtri',
    filterColor: 'Colore',
    filterGray: 'Grigio',
    filterBW: 'B/N',
  },
  en: {
    appName: 'ScanMe',
    scan: 'Scan',
    scanDocument: 'Scan document',
    gallery: 'Gallery',
    noScans: 'No scans yet.\nTap the button to start.',
    preview: 'Preview',
    back: 'Back',
    pages: 'pages',
    page: 'page',
    save: 'Save',
    saveToDevice: 'Save to device',
    saveToGallery: 'Save to gallery',
    share: 'Share',
    delete: 'Delete',
    deleteConfirm: 'Delete this document?',
    cancel: 'Cancel',
    confirm: 'Confirm',
    fileName: 'File name',
    fileNameDefault: 'Scan',
    savePdf: 'Save as PDF',
    saveJpg: 'Save as JPG',
    exportFormat: 'Export format',
    quality: 'Quality',
    qualityHigh: 'High',
    qualityMedium: 'Medium',
    qualityLow: 'Low',
    saved: 'Saved!',
    shared: 'Shared!',
    error: 'Error',
    scanError: 'Error during scanning',
    saveError: 'Error while saving',
    shareError: 'Error while sharing',
    scannerUnavailable: 'Scanner not available on this device',
    cameraPermission: 'Camera permission required',
    recentScans: 'Recent scans',
    filters: 'Filters',
    filterColor: 'Color',
    filterGray: 'Gray',
    filterBW: 'B/W',
  },
};

export type StringKey = keyof typeof strings.en;

export function t(key: StringKey): string {
  return isItalian ? strings.it[key] : strings.en[key];
}
