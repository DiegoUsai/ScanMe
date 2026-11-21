import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {t} from '../i18n';
import {scan, getErrorCode, ScanErrorCode} from '../native/DocumentScanner';
import {
  renderThumbnails,
  composePdf,
  overwritePdf,
  PdfErrorCode,
} from '../native/PdfEditor';
import {
  fromPdf,
  fromScans,
  insertAt,
  removeAt,
  replaceAt,
  move,
  isModified,
  toComposeSpec,
} from '../pdf/pageList';
import type {EditorPage} from '../pdf/pageList';
import {useSettings} from '../settings/SettingsContext';
import {
  saveToFolder,
  hasAccess,
  describeFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import {saveToDevice, sanitizeFileName, cleanTempFiles} from '../utils/files';
import {addRecent} from '../recents/recents';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'EditPdf'>;

const THUMB_SIZE = 360;
type ScanAction = 'before' | 'after' | 'replace' | 'end';

export default function EditPdfScreen({route, navigation}: Props) {
  const {pdf} = route.params;
  const {settings} = useSettings();
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const savedRef = useRef(false);
  // Tutti i file temporanei creati qui, da cancellare all'uscita.
  const tempFiles = useRef<string[]>([pdf.cachePath]);
  const baseName = sanitizeFileName(pdf.name.replace(/\.pdf$/i, ''));
  const modified = isModified(pages, pdf.pageCount);

  useEffect(() => {
    renderThumbnails(pdf.cachePath, THUMB_SIZE)
      .then(thumbs => {
        tempFiles.current.push(...thumbs);
        setPages(fromPdf(thumbs));
      })
      .catch(() => Alert.alert(t('error'), t('pdfOpenError')))
      .finally(() => setLoading(false));
    const files = tempFiles.current;
    return () => {
      cleanTempFiles(files);
    };
  }, [pdf.cachePath]);

  // Uscendo con modifiche non salvate si chiede conferma.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', e => {
        if (!modified || savedRef.current) {
          return;
        }
        e.preventDefault();
        Alert.alert(t('discardChanges'), t('discardChangesHint'), [
          {text: t('keepEditing'), style: 'cancel'},
          {
            text: t('discard'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]);
      }),
    [navigation, modified],
  );

  /** Lancia lo scanner e mette le nuove pagine nella posizione richiesta. */
  const scanInto = useCallback(
    async (action: ScanAction) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await scan();
        tempFiles.current.push(
          ...result.pages,
          ...(result.pdfUri ? [result.pdfUri] : []),
        );
        if (result.pages.length === 0) {
          return;
        }
        const added = fromScans(result.pages);
        setPages(current => {
          const at = selected ?? current.length;
          switch (action) {
            case 'before':
              return insertAt(current, at, added);
            case 'after':
              return insertAt(current, at + 1, added);
            case 'replace':
              return replaceAt(current, at, added);
            default:
              return insertAt(current, current.length, added);
          }
        });
        setSelected(undefined);
      } catch (error: unknown) {
        if (getErrorCode(error) !== ScanErrorCode.Cancelled) {
          Alert.alert(t('error'), t('scanError'));
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [selected],
  );

  const handleRemove = useCallback(() => {
    if (selected === undefined) {
      return;
    }
    if (pages.length <= 1) {
      Alert.alert(t('cannotRemoveLastPage'));
      return;
    }
    setPages(current => removeAt(current, selected));
    setSelected(undefined);
  }, [selected, pages.length]);

  const handleMove = useCallback(
    (delta: -1 | 1) => {
      if (selected === undefined) {
        return;
      }
      const to = selected + delta;
      if (to < 0 || to >= pages.length) {
        return;
      }
      setPages(current => move(current, selected, delta));
      setSelected(to);
    },
    [selected, pages.length],
  );

  /** Compone il nuovo PDF nella cache e restituisce il percorso. */
  const compose = useCallback(async () => {
    const out = `${
      ReactNativeBlobUtil.fs.dirs.CacheDir
    }/pdf-edit/out-${Date.now()}.pdf`;
    tempFiles.current.push(out);
    await composePdf(pdf.cachePath, toComposeSpec(pages), out);
    return out;
  }, [pdf.cachePath, pages]);

  const finish = useCallback(
    async (uri: string, name: string, where: string) => {
      savedRef.current = true;
      try {
        const first = pages[0]?.preview;
        if (first) {
          await addRecent(
            {
              name,
              uri,
              mimeType: 'application/pdf',
              pageCount: pages.length,
              destination: where,
            },
            first,
          );
        }
      } catch {
        // L'elenco degli ultimi file è un di più.
      }
      Alert.alert(t('saved'));
      navigation.goBack();
    },
    [pages, navigation],
  );

  const run = useCallback(async (task: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } catch (error: unknown) {
      const code = getErrorCode(error);
      Alert.alert(
        t('error'),
        code === PdfErrorCode.Protected
          ? t('pdfProtected')
          : code === StorageErrorCode.PermissionDenied
          ? t('folderAccessLost')
          : t('saveError'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Salva come nuovo file nella destinazione predefinita: l'originale resta intatto. */
  const saveAsNew = useCallback(
    () =>
      run(async () => {
        const out = await compose();
        const name = `${baseName} (${t('editedSuffix')})`;
        const dest = settings.destination;
        if (dest && !(await hasAccess(dest.uri))) {
          throw Object.assign(new Error('Folder access lost'), {
            code: StorageErrorCode.PermissionDenied,
          });
        }
        const uri = dest
          ? await saveToFolder(dest, [], `${name}.pdf`, 'application/pdf', out)
          : await saveToDevice(out, `${name}.pdf`, 'application/pdf');
        await finish(
          uri,
          name,
          dest ? describeFolder(dest) : t('downloadFolder'),
        );
      }),
    [run, compose, baseName, settings.destination, finish],
  );

  const replaceOriginal = useCallback(
    () =>
      run(async () => {
        const out = await compose();
        const uri = await overwritePdf(pdf.uri, out);
        await finish(uri, baseName, t('originalFile'));
      }),
    [run, compose, pdf.uri, baseName, finish],
  );

  const handleSave = useCallback(() => {
    if (!pdf.writable) {
      // Il provider non permette di scrivere sull'originale: si crea una copia.
      saveAsNew();
      return;
    }
    Alert.alert(t('saveEditedPdf'), t('saveEditedPdfHint'), [
      {text: t('cancel'), style: 'cancel'},
      {
        text: t('replaceOriginal'),
        onPress: () =>
          Alert.alert(t('replaceOriginal'), t('replaceOriginalConfirm'), [
            {text: t('cancel'), style: 'cancel'},
            {
              text: t('replace'),
              style: 'destructive',
              onPress: replaceOriginal,
            },
          ]),
      },
      {text: t('saveAsNewFile'), onPress: saveAsNew},
    ]);
  }, [pdf.writable, saveAsNew, replaceOriginal]);

  const hasSelection = selected !== undefined;

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
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {pdf.name}
          </Text>
          <Text style={styles.subtitle}>
            {pages.length} {pages.length === 1 ? t('page') : t('pages')}
            {modified ? ` · ${t('modified')}` : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#2563eb" />
      ) : (
        <FlatList
          data={pages}
          keyExtractor={p => p.key}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={
            <Text style={styles.hint}>{t('editPdfHint')}</Text>
          }
          renderItem={({item, index}) => (
            <TouchableOpacity
              style={[styles.cell, index === selected && styles.cellSelected]}
              onPress={() =>
                setSelected(current => (current === index ? undefined : index))
              }
              accessibilityRole="button"
              accessibilityState={{selected: index === selected}}
              accessibilityLabel={`${t('page')} ${index + 1}`}>
              <Image
                source={{uri: item.preview}}
                style={styles.thumb}
                resizeMode="contain"
              />
              <View
                style={[
                  styles.badge,
                  item.source.type === 'image' && styles.badgeNew,
                ]}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Azioni sulla pagina selezionata, oppure aggiunta in fondo */}
      <View style={styles.toolbar}>
        {hasSelection ? (
          <>
            <Tool
              label={t('insertBefore')}
              onPress={() => scanInto('before')}
              disabled={busy}
            />
            <Tool
              label={t('insertAfter')}
              onPress={() => scanInto('after')}
              disabled={busy}
            />
            <Tool
              label={t('replacePage')}
              onPress={() => scanInto('replace')}
              disabled={busy}
            />
            <Tool
              label={t('removePage')}
              onPress={handleRemove}
              disabled={busy}
              danger
            />
            <Tool
              label="◀"
              onPress={() => handleMove(-1)}
              disabled={busy || selected === 0}
            />
            <Tool
              label="▶"
              onPress={() => handleMove(1)}
              disabled={busy || selected === pages.length - 1}
            />
          </>
        ) : (
          <Tool
            label={t('addScanAtEnd')}
            onPress={() => scanInto('end')}
            disabled={busy || loading}
          />
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, (!modified || busy) && styles.disabled]}
          onPress={handleSave}
          disabled={!modified || busy}
          accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{t('save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Tool({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button">
      <Text style={[styles.toolText, danger && styles.toolDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
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
  headerText: {flex: 1},
  title: {fontSize: 18, fontWeight: '600', color: '#1a1a1a'},
  subtitle: {fontSize: 13, color: '#888'},
  loader: {flex: 1},
  hint: {fontSize: 12, color: '#888', paddingBottom: 8},
  grid: {padding: 12},
  gridRow: {gap: 8, marginBottom: 8},
  cell: {
    flex: 1 / 3,
    aspectRatio: 0.72,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
  },
  cellSelected: {borderColor: '#2563eb'},
  thumb: {width: '100%', height: '100%'},
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  badgeNew: {backgroundColor: '#16a34a'},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    justifyContent: 'center',
  },
  tool: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolText: {color: '#2563eb', fontWeight: '600', fontSize: 14},
  toolDanger: {color: '#dc2626'},
  disabled: {opacity: 0.4},
  footer: {padding: 16, paddingBottom: 24},
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
