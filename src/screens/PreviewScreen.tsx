import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Share from 'react-native-share';
import {t} from '../i18n';
import {
  defaultFileName,
  sanitizeFileName,
  saveToDevice,
  saveToGallery,
  copyToCache,
  cleanTempFiles,
} from '../utils/files';
import {visiblePageWindow} from '../utils/pageWindow';
import FormatSelector from '../components/FormatSelector';
import {useSettings} from '../settings/SettingsContext';
import type {OutputFormat} from '../settings/settings';
import {
  pickFolder,
  hasAccess,
  releaseAccess,
  saveToFolder,
  describeFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import type {FolderDestination} from '../native/StorageAccess';
import {getErrorCode} from '../native/DocumentScanner';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

/** Messaggio con cui react-native-share rifiuta la promise quando l'utente chiude il foglio. */
const SHARE_DISMISSED_MESSAGE = 'User did not share';

/** Nome del file della pagina `index` (0-based): suffisso "_N" solo se le pagine sono più di una. */
function pageFileName(baseName: string, index: number, total: number): string {
  return total > 1 ? `${baseName}_${index + 1}` : baseName;
}

export default function PreviewScreen({route, navigation}: Props) {
  const {pages, pageSizes, pdfUri} = route.params;
  const [currentPage, setCurrentPage] = useState(0);
  const size = pageSizes?.[currentPage];
  // Larghezza dell'area di anteprima: ogni pagina del carosello la occupa tutta.
  const [pageWidth, setPageWidth] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const [fileName, setFileName] = useState(defaultFileName);
  const [saving, setSaving] = useState(false);
  const {settings} = useSettings();
  // Formato iniziale dalle impostazioni; senza PDF di ML Kit si ripiega su JPG.
  const [format, setFormat] = useState<OutputFormat>(
    settings.defaultFormat === 'pdf' && !pdfUri
      ? 'jpg'
      : settings.defaultFormat,
  );
  // Destinazione di questo salvataggio: parte da quella predefinita e si può
  // cambiare qui senza toccare le impostazioni. undefined = Download/ScanMe.
  const [destination, setDestination] = useState<FolderDestination | undefined>(
    settings.destination,
  );
  const formats: OutputFormat[] = pdfUri
    ? ['pdf', 'jpg', 'gallery']
    : ['jpg', 'gallery'];
  // Il ref evita salvataggi doppi se l'utente tocca due volte prima del re-render.
  const savingRef = useRef(false);
  // Cartella scelta solo per questo salvataggio: il suo permesso persistente
  // va rilasciato all'uscita, altrimenti si accumulano (Android ne tiene al
  // massimo 512 per app).
  const oneOffFolder = useRef<string | undefined>(undefined);
  const defaultFolderUri = settings.destination?.uri;
  useEffect(
    () => () => {
      const uri = oneOffFolder.current;
      if (uri && uri !== defaultFolderUri) {
        releaseAccess(uri);
      }
    },
    [defaultFolderUri],
  );
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
      } catch (error: unknown) {
        Alert.alert(
          t('error'),
          getErrorCode(error) === StorageErrorCode.PermissionDenied
            ? t('folderAccessLost')
            : t('saveError'),
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [fileName, navigation],
  );

  const handleSave = useCallback(() => {
    runSave(async baseName => {
      if (format === 'gallery') {
        for (let i = 0; i < pages.length; i++) {
          await saveToGallery(
            pages[i],
            pageFileName(baseName, i, pages.length),
          );
        }
        return;
      }
      if (destination && !(await hasAccess(destination.uri))) {
        throw Object.assign(new Error('Folder access lost'), {
          code: StorageErrorCode.PermissionDenied,
        });
      }
      // Salva un file nella cartella scelta (SAF) o, senza cartella, in Download/ScanMe.
      const write = (source: string, name: string, mime: string) =>
        destination
          ? saveToFolder(destination, [], name, mime, source)
          : saveToDevice(source, name, mime);
      if (format === 'pdf' && pdfUri) {
        await write(pdfUri, `${baseName}.pdf`, 'application/pdf');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const name = pageFileName(baseName, i, pages.length);
        await write(pages[i], `${name}.jpg`, 'image/jpeg');
      }
    });
  }, [destination, format, pages, pdfUri, runSave]);

  /** Cambia la destinazione solo per questo salvataggio. */
  const handleChangeDestination = useCallback(() => {
    Alert.alert(t('whereToSave'), undefined, [
      {text: t('cancel'), style: 'cancel'},
      {
        text: t('downloadFolder'),
        onPress: () => setDestination(undefined),
      },
      {
        text: t('chooseFolder'),
        onPress: async () => {
          try {
            const folder = await pickFolder();
            const previous = oneOffFolder.current;
            if (
              previous &&
              previous !== folder.uri &&
              previous !== defaultFolderUri
            ) {
              releaseAccess(previous);
            }
            oneOffFolder.current = folder.uri;
            setDestination(folder);
          } catch (error: unknown) {
            if (getErrorCode(error) !== StorageErrorCode.Cancelled) {
              Alert.alert(t('error'), t('folderPickError'));
            }
          }
        },
      },
    ]);
  }, [defaultFolderUri]);

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

  const handlePreviewLayout = useCallback((e: LayoutChangeEvent) => {
    setPageWidth(e.nativeEvent.layout.width);
  }, []);

  // Aggiorna la pagina corrente quando lo swipe si ferma su una nuova pagina.
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) {
        return;
      }
      const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      setCurrentPage(Math.min(Math.max(index, 0), pages.length - 1));
    },
    [pageWidth, pages.length],
  );

  const goToPage = useCallback((index: number) => {
    setCurrentPage(index);
    listRef.current?.scrollToIndex({index, animated: true});
  }, []);

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
        <View style={styles.headerInfo}>
          <Text style={styles.pageCount}>
            {pages.length} {pages.length === 1 ? t('page') : t('pages')}
          </Text>
          {size?.width && size?.height ? (
            <Text style={styles.pageSize}>
              {size.width} × {size.height} px
            </Text>
          ) : null}
        </View>
      </View>

      {/* Anteprima: carosello orizzontale, una pagina per schermata */}
      <View style={styles.previewContainer} onLayout={handlePreviewLayout}>
        {pageWidth > 0 && (
          <FlatList
            ref={listRef}
            data={pages}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
            getItemLayout={(_, index) => ({
              length: pageWidth,
              offset: pageWidth * index,
              index,
            })}
            // Ogni pagina è un'immagine a piena risoluzione: se ne tengono in
            // memoria poche alla volta per non esaurire la RAM con molte pagine.
            initialNumToRender={1}
            windowSize={3}
            maxToRenderPerBatch={2}
            removeClippedSubviews
            renderItem={({item, index}) => (
              <Image
                source={{uri: item}}
                style={[styles.previewImage, {width: pageWidth}]}
                resizeMode="contain"
                // Con il valore predefinito ("auto") Android ricampiona l'immagine
                // a una risoluzione più bassa prima di mostrarla, e l'anteprima
                // sembra sgranata anche quando il file è nitido.
                resizeMethod="scale"
                accessibilityLabel={`${t('page')} ${index + 1} / ${
                  pages.length
                }`}
              />
            )}
          />
        )}
      </View>

      {/* Indicatore pagine: al massimo 5, centrate sulla pagina corrente */}
      {pages.length > 1 && (
        <View style={styles.dotsContent}>
          {visiblePageWindow(currentPage, pages.length).map(i => (
            <TouchableOpacity
              key={i}
              style={[styles.dot, i === currentPage && styles.dotActive]}
              onPress={() => goToPage(i)}
              accessibilityRole="button"
              accessibilityState={{selected: i === currentPage}}
              accessibilityLabel={`${t('page')} ${i + 1}`}>
              <Text
                style={[
                  styles.dotText,
                  i === currentPage && styles.dotTextActive,
                ]}>
                {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
        <FormatSelector
          formats={formats}
          value={format}
          onChange={setFormat}
          disabled={saving}
        />
      </View>

      {/* Destinazione: la Galleria ha una posizione fissa */}
      <View style={styles.destinationRow}>
        <View style={styles.destinationText}>
          <Text style={styles.label}>{t('whereToSave')}</Text>
          <Text style={styles.destinationName} numberOfLines={1}>
            {format === 'gallery'
              ? t('galleryFolder')
              : destination
              ? describeFolder(destination)
              : t('downloadFolder')}
          </Text>
        </View>
        {format !== 'gallery' && (
          <TouchableOpacity
            onPress={handleChangeDestination}
            disabled={saving}
            accessibilityRole="button"
            hitSlop={8}>
            <Text style={styles.changeLink}>{t('change')}</Text>
          </TouchableOpacity>
        )}
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
  headerInfo: {alignItems: 'flex-end'},
  pageCount: {fontSize: 14, color: '#888'},
  pageSize: {fontSize: 11, color: '#aaa'},
  previewContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
  },
  dotsContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    height: 48,
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
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  destinationText: {flex: 1},
  destinationName: {fontSize: 15, color: '#1a1a1a'},
  changeLink: {fontSize: 15, color: '#2563eb', fontWeight: '600'},
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
