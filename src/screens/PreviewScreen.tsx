import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
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
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

/** Messaggio con cui react-native-share rifiuta la promise quando l'utente chiude il foglio. */
const SHARE_DISMISSED_MESSAGE = 'User did not share';

/** Nome del file della pagina `index` (0-based): suffisso "_N" solo se le pagine sono più di una. */
function pageFileName(baseName: string, index: number, total: number): string {
  return total > 1 ? `${baseName}_${index + 1}` : baseName;
}

export default function PreviewScreen({route, navigation}: Props) {
  const {pages, pdfUri} = route.params;
  const [currentPage, setCurrentPage] = useState(0);
  // Larghezza dell'area di anteprima: ogni pagina del carosello la occupa tutta.
  const [pageWidth, setPageWidth] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const [fileName, setFileName] = useState(defaultFileName);
  const [saving, setSaving] = useState(false);
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

  const handleSavePdf = useCallback(() => {
    if (!pdfUri) {
      return;
    }
    runSave(async baseName => {
      await saveToDevice(pdfUri, `${baseName}.pdf`, 'application/pdf');
    });
  }, [pdfUri, runSave]);

  const handleSaveJpg = useCallback(() => {
    runSave(async baseName => {
      for (let i = 0; i < pages.length; i++) {
        const name = pageFileName(baseName, i, pages.length);
        await saveToDevice(pages[i], `${name}.jpg`, 'image/jpeg');
      }
    });
  }, [pages, runSave]);

  const handleSaveGallery = useCallback(() => {
    runSave(async baseName => {
      for (let i = 0; i < pages.length; i++) {
        await saveToGallery(pages[i], pageFileName(baseName, i, pages.length));
      }
    });
  }, [pages, runSave]);

  const handleShare = useCallback(async () => {
    // Condivide il PDF se disponibile, altrimenti la pagina visualizzata.
    const isPdf = pdfUri !== undefined;
    const uri = pdfUri ?? pages[currentPage];
    const shareName = `${sanitizeFileName(fileName)}.${isPdf ? 'pdf' : 'jpg'}`;
    const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
    try {
      const cachePath = await copyToCache(uri, shareName);
      shareCopies.current.push(cachePath);
      await Share.open({
        url: `file://${cachePath}`,
        type: mimeType,
        filename: shareName,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined;
      if (message !== SHARE_DISMISSED_MESSAGE) {
        Alert.alert(t('error'), t('shareError'));
      }
    }
  }, [pages, pdfUri, currentPage, fileName]);

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
        <Text style={styles.pageCount}>
          {pages.length} {pages.length === 1 ? t('page') : t('pages')}
        </Text>
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

      {/* Action buttons */}
      <ScrollView
        horizontal
        style={styles.actionsContainer}
        contentContainerStyle={styles.actionsContent}
        showsHorizontalScrollIndicator={false}>
        {pdfUri && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSavePdf}
            disabled={saving}>
            <Text style={styles.actionIcon}>📄</Text>
            <Text style={styles.actionLabel}>{t('savePdf')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSaveJpg}
          disabled={saving}>
          <Text style={styles.actionIcon}>🖼</Text>
          <Text style={styles.actionLabel}>{t('saveJpg')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSaveGallery}
          disabled={saving}>
          <Text style={styles.actionIcon}>📱</Text>
          <Text style={styles.actionLabel}>{t('saveToGallery')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
          disabled={saving}>
          <Text style={styles.actionIcon}>↗</Text>
          <Text style={styles.actionLabel}>{t('share')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  actionsContainer: {maxHeight: 88},
  actionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 100,
  },
  actionIcon: {fontSize: 24, marginBottom: 4},
  actionLabel: {fontSize: 12, color: '#1a1a1a', fontWeight: '500'},
});
