import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Share from 'react-native-share';
import {t} from '../i18n';
import type {StringKey} from '../i18n';
import {
  defaultFileName,
  sanitizeFileName,
  saveToDevice,
  saveToGallery,
  copyToCache,
  cleanTempFiles,
} from '../utils/files';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

/** Messaggio con cui react-native-share rifiuta la promise quando l'utente chiude il foglio. */
const SHARE_DISMISSED_MESSAGE = 'User did not share';

/** Nome del file della pagina `index` (0-based): suffisso "_N" solo se le pagine sono più di una. */
function pageFileName(baseName: string, index: number, total: number): string {
  return total > 1 ? `${baseName}_${index + 1}` : baseName;
}

/** Formati di uscita offerti all'utente. */
type OutputFormat = 'pdf' | 'jpg' | 'gallery';

const FORMAT_LABEL: Record<OutputFormat, StringKey> = {
  pdf: 'formatPdf',
  jpg: 'formatJpg',
  gallery: 'formatGallery',
};

const FORMAT_HINT: Record<OutputFormat, StringKey> = {
  pdf: 'formatPdfHint',
  jpg: 'formatJpgHint',
  gallery: 'formatGalleryHint',
};

export default function PreviewScreen({route, navigation}: Props) {
  const {pages, pdfUri} = route.params;
  const [currentPage, setCurrentPage] = useState(0);
  const [fileName, setFileName] = useState(defaultFileName);
  const [saving, setSaving] = useState(false);
  // Il PDF è la scelta predefinita: un solo file con tutte le pagine.
  const [format, setFormat] = useState<OutputFormat>(pdfUri ? 'pdf' : 'jpg');
  const formats: OutputFormat[] = pdfUri
    ? ['pdf', 'jpg', 'gallery']
    : ['jpg', 'gallery'];
  // Il ref evita salvataggi doppi se l'utente tocca due volte prima del re-render.
  const savingRef = useRef(false);
  // Copie create in cache per la condivisione, da eliminare all'uscita.
  const shareCopies = useRef<string[]>([]);

  // Le scansioni restano nella cache dell'app finché non vengono rimosse:
  // uscendo dall'anteprima si cancellano pagine JPEG, PDF di ML Kit e copie
  // di condivisione, per non lasciare documenti personali sul dispositivo.
  useEffect(() => {
    const copies = shareCopies.current;
    return () => {
      cleanTempFiles([...pages, ...(pdfUri ? [pdfUri] : []), ...copies]);
    };
  }, [pages, pdfUri]);

  /**
   * Esegue un'operazione di salvataggio mostrando l'esito all'utente.
   * Centralizza guardia anti-doppio-tap, gestione errori e ritorno alla Home.
   */
  const runSave = useCallback(
    async (save: (baseName: string) => Promise<void>) => {
      if (savingRef.current) {
        return;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        await save(sanitizeFileName(fileName));
        Alert.alert(t('saved'));
        navigation.goBack();
      } catch {
        Alert.alert(t('error'), t('saveError'));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [fileName, navigation],
  );

  const handleSave = useCallback(() => {
    runSave(async baseName => {
      if (format === 'pdf' && pdfUri) {
        await saveToDevice(pdfUri, `${baseName}.pdf`, 'application/pdf');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const name = pageFileName(baseName, i, pages.length);
        if (format === 'gallery') {
          await saveToGallery(pages[i], name);
        } else {
          await saveToDevice(pages[i], `${name}.jpg`, 'image/jpeg');
        }
      }
    });
  }, [format, pages, pdfUri, runSave]);

  /**
   * Condivide il documento nel formato scelto senza salvarlo sul telefono:
   * le copie temporanee restano nella cache dell'app e vengono cancellate
   * all'uscita dall'anteprima.
   */
  const handleShare = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    const baseName = sanitizeFileName(fileName);
    const isPdf = format === 'pdf' && pdfUri !== undefined;
    try {
      const sources = isPdf
        ? [{uri: pdfUri, name: `${baseName}.pdf`}]
        : pages.map((uri, i) => ({
            uri,
            name: `${pageFileName(baseName, i, pages.length)}.jpg`,
          }));
      const urls: string[] = [];
      for (const source of sources) {
        const cachePath = await copyToCache(source.uri, source.name);
        shareCopies.current.push(cachePath);
        urls.push(`file://${cachePath}`);
      }
      await Share.open({
        urls,
        type: isPdf ? 'application/pdf' : 'image/jpeg',
        filenames: sources.map(source => source.name),
        failOnCancel: true,
      });
      Alert.alert(t('sharedNotSaved'), t('sharedNotSavedHint'), [
        {text: t('keepEditing'), style: 'cancel'},
        {text: t('done'), onPress: () => navigation.goBack()},
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined;
      if (message !== SHARE_DISMISSED_MESSAGE) {
        Alert.alert(t('error'), t('shareError'));
      }
    }
  }, [fileName, format, pages, pdfUri, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          hitSlop={12}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('preview')}</Text>
        <Text style={styles.pageCount}>
          {pages.length} {pages.length === 1 ? t('page') : t('pages')}
        </Text>
      </View>

      {/* Page preview */}
      <View style={styles.previewContainer}>
        <Image
          source={{uri: pages[currentPage]}}
          style={styles.previewImage}
          resizeMode="contain"
        />
      </View>

      {/* Page dots */}
      {pages.length > 1 && (
        <ScrollView
          horizontal
          style={styles.dotsContainer}
          contentContainerStyle={styles.dotsContent}
          showsHorizontalScrollIndicator={false}>
          {pages.map((_, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dot, i === currentPage && styles.dotActive]}
              onPress={() => setCurrentPage(i)}>
              <Text
                style={[
                  styles.dotText,
                  i === currentPage && styles.dotTextActive,
                ]}>
                {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* File name input */}
      <View style={styles.fileNameContainer}>
        <Text style={styles.label}>{t('fileName')}</Text>
        <TextInput
          style={styles.fileNameInput}
          value={fileName}
          onChangeText={setFileName}
          selectTextOnFocus
        />
      </View>

      {/* Formato di uscita */}
      <View style={styles.formatContainer}>
        <Text style={styles.label}>{t('exportFormat')}</Text>
        <View style={styles.segmented} accessibilityRole="radiogroup">
          {formats.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.segment, f === format && styles.segmentActive]}
              onPress={() => setFormat(f)}
              disabled={saving}
              accessibilityRole="radio"
              accessibilityState={{checked: f === format}}>
              <Text
                style={[
                  styles.segmentText,
                  f === format && styles.segmentTextActive,
                ]}>
                {t(FORMAT_LABEL[f])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.formatHint}>{t(FORMAT_HINT[format])}</Text>
      </View>

      {/* Azioni: salva oppure condividi senza salvare */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button">
          <Text style={styles.primaryButtonText}>{t('save')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, saving && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={saving}
          accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>
            {t('shareWithoutSaving')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {fontSize: 24, color: '#2563eb', paddingRight: 4},
  title: {fontSize: 20, fontWeight: '600', color: '#1a1a1a', flex: 1},
  pageCount: {fontSize: 14, color: '#888'},
  previewContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  dotsContainer: {maxHeight: 48},
  dotsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {backgroundColor: '#2563eb'},
  dotText: {fontSize: 14, color: '#666'},
  dotTextActive: {color: '#fff', fontWeight: '600'},
  fileNameContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {fontSize: 12, color: '#888', marginBottom: 4},
  fileNameInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  formatContainer: {paddingHorizontal: 16, paddingBottom: 12},
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentText: {fontSize: 14, color: '#666', fontWeight: '500'},
  segmentTextActive: {color: '#2563eb', fontWeight: '600'},
  formatHint: {fontSize: 12, color: '#888', marginTop: 6},
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  secondaryButton: {
    flex: 1,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {color: '#2563eb', fontSize: 16, fontWeight: '600'},
  buttonDisabled: {opacity: 0.5},
});
