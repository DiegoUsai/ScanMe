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
import {addRecent} from '../recents/recents';
import {
  findProject,
  projectFolderName,
  projectSubFolders,
  resolveDestination,
} from '../settings/projects';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

/** Messaggio con cui react-native-share rifiuta la promise quando l'utente chiude il foglio. */
const SHARE_DISMISSED_MESSAGE = 'User did not share';

/** Nome del file della pagina `index` (0-based): suffisso "_N" solo se le pagine sono più di una. */
function pageFileName(baseName: string, index: number, total: number): string {
  return total > 1 ? `${baseName}_${index + 1}` : baseName;
}

export default function PreviewScreen({route, navigation}: Props) {
  const {pages, pageSizes, pdfUri, projectId: initialProjectId} = route.params;
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
  // Progetto del salvataggio: se la home è filtrata su un progetto, parte da quello.
  const [projectId, setProjectId] = useState<string | undefined>(
    findProject(settings, initialProjectId)?.id,
  );
  const project = findProject(settings, projectId);
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
      let savedUri: string;
      let allUris: string[] = [];
      let mimeType = 'image/jpeg';
      let where: string;
      // Con un progetto i file vanno nella sua posizione: una sottocartella
      // con il suo nome, oppure direttamente la cartella scelta per il progetto.
      // In galleria si usa sempre la sottocartella (Pictures/ScanMe/<nome>).
      const gallerySub = project ? projectFolderName(project) : undefined;
      const subFolders = projectSubFolders(project);
      const target = project
        ? resolveDestination(project, settings.destination)
        : destination;
      if (format === 'gallery') {
        const uris: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          uris.push(
            await saveToGallery(
              pages[i],
              pageFileName(baseName, i, pages.length),
              gallerySub,
            ),
          );
        }
        savedUri = uris[0];
        allUris = uris;
        where = t('galleryFolder');
        if (gallerySub) {
          where = `${where} › ${gallerySub}`;
        }
      } else {
        if (target && !(await hasAccess(target.uri))) {
          throw Object.assign(new Error('Folder access lost'), {
            code: StorageErrorCode.PermissionDenied,
          });
        }
        // Salva un file nella cartella scelta (SAF) o, senza cartella, in Download/ScanMe.
        const write = (source: string, name: string, mime: string) =>
          target
            ? saveToFolder(target, subFolders, name, mime, source)
            : saveToDevice(source, name, mime, subFolders[0]);
        where = [
          target ? describeFolder(target) : t('downloadFolder'),
          ...subFolders,
        ].join(' › ');
        if (format === 'pdf' && pdfUri) {
          mimeType = 'application/pdf';
          savedUri = await write(pdfUri, `${baseName}.pdf`, mimeType);
        } else {
          const uris: string[] = [];
          for (let i = 0; i < pages.length; i++) {
            const name = pageFileName(baseName, i, pages.length);
            uris.push(await write(pages[i], `${name}.jpg`, mimeType));
          }
          savedUri = uris[0];
          allUris = uris;
        }
      }
      // Il file salvato sta nella cartella scelta qui: il permesso va tenuto,
      // altrimenti non si potrebbe più aprirlo dagli ultimi file.
      oneOffFolder.current = undefined;
      // L'elenco degli ultimi file è un di più: se fallisce, il salvataggio resta valido.
      try {
        await addRecent(
          {
            name: baseName,
            uri: savedUri,
            uris: allUris.length > 1 ? allUris : undefined,
            mimeType,
            pageCount: pages.length,
            destination: where,
            projectId: project?.id,
          },
          pages[0],
        );
      } catch {
        // Ignorato.
      }
    });
  }, [
    destination,
    format,
    pages,
    pdfUri,
    project,
    settings.destination,
    runSave,
  ]);

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

  const destinationLabel = (() => {
    if (format === 'gallery') {
      const sub = project ? ` › ${projectFolderName(project)}` : '';
      return `${t('galleryFolder')}${sub}`;
    }
    const target = project
      ? resolveDestination(project, settings.destination)
      : destination;
    return [
      target ? describeFolder(target) : t('downloadFolder'),
      ...projectSubFolders(project),
    ].join(' › ');
  })();

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

      {/* Progetto: sempre visibile, con la scorciatoia per crearne uno */}
      <View style={styles.projectContainer}>
        <Text style={[styles.label, styles.projectLabel]}>{t('project')}</Text>
        <View style={styles.chips}>
          {[undefined, ...settings.projects].map(p => {
            const selected = p?.id === projectId;
            return (
              <TouchableOpacity
                key={p?.id ?? 'none'}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setProjectId(p?.id)}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{checked: selected}}>
                <Text
                  style={[styles.chipText, selected && styles.chipTextActive]}>
                  {p ? p.name : t('noProject')}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.chip, styles.chipAdd]}
            onPress={() => navigation.navigate('Projects')}
            disabled={saving}
            accessibilityRole="button">
            <Text style={styles.chipAddText}>{t('newProject')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Destinazione: la Galleria ha una posizione fissa, un progetto la sua */}
      <View style={styles.destinationRow}>
        <View style={styles.destinationText}>
          <Text style={styles.label}>{t('whereToSave')}</Text>
          <Text style={styles.destinationName} numberOfLines={1}>
            {destinationLabel}
          </Text>
        </View>
        {format !== 'gallery' && !project && (
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
  projectContainer: {paddingBottom: 12},
  projectLabel: {paddingHorizontal: 16},
  // A capo invece dello scorrimento: così si vedono tutti i progetti.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  chipActive: {backgroundColor: '#2563eb'},
  chipAdd: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
  },
  chipAddText: {fontSize: 14, color: '#2563eb', fontWeight: '600'},
  chipText: {fontSize: 14, color: '#444'},
  chipTextActive: {color: '#fff', fontWeight: '600'},
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
