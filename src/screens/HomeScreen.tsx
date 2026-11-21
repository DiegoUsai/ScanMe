import React, {useState, useCallback, useRef} from 'react';
import {
  View,
  FlatList,
  Image,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import Share from 'react-native-share';
import {loadRecents, removeRecent} from '../recents/recents';
import type {RecentFile} from '../recents/recents';
import {fileExists, openFile} from '../native/StorageAccess';
import {useSettings} from '../settings/SettingsContext';
import {pickPdf, loadPdf, PdfErrorCode} from '../native/PdfEditor';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {scan, getErrorCode, ScanErrorCode} from '../native/DocumentScanner';
import {t} from '../i18n';
import type {RootStackParamList} from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [scanning, setScanning] = useState(false);
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const {settings} = useSettings();
  // Filtro per progetto: undefined = tutti i file.
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const activeFilter = settings.projects.some(p => p.id === filter)
    ? filter
    : undefined;
  const visibleRecents = activeFilter
    ? recents.filter(r => r.projectId === activeFilter)
    : recents;
  // id dei file che non esistono più nella destinazione (cancellati o spostati).
  const [missing, setMissing] = useState<Set<string>>(new Set());

  // Ricarica l'elenco ogni volta che si torna in home (es. dopo un salvataggio).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRecents().then(async list => {
        if (!active) {
          return;
        }
        setRecents(list);
        const checks = await Promise.all(list.map(r => fileExists(r.uri)));
        if (active) {
          setMissing(new Set(list.filter((_, i) => !checks[i]).map(r => r.id)));
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const handleOpen = useCallback(
    async (item: RecentFile) => {
      if (missing.has(item.id)) {
        Alert.alert(t('fileMissing'), t('fileMissingHint'));
        return;
      }
      try {
        await openFile(item.uri, item.mimeType);
      } catch {
        Alert.alert(t('error'), t('openError'));
      }
    },
    [missing],
  );

  /** Apre l'editor su un PDF scelto ora o già presente negli ultimi file. */
  const openEditor = useCallback(
    async (uri?: string) => {
      try {
        const pdf = uri ? await loadPdf(uri) : await pickPdf();
        navigation.navigate('EditPdf', {pdf});
      } catch (error: unknown) {
        const code = getErrorCode(error);
        if (code === PdfErrorCode.Cancelled) {
          return;
        }
        Alert.alert(
          t('error'),
          code === PdfErrorCode.Protected
            ? t('pdfProtected')
            : t('pdfOpenError'),
        );
      }
    },
    [navigation],
  );

  const handleMore = useCallback(
    (item: RecentFile) => {
      // Android mostra al massimo tre pulsanti: niente "Annulla", si chiude
      // toccando fuori dalla finestra.
      const isPdf = item.mimeType === 'application/pdf';
      Alert.alert(
        item.name,
        item.destination,
        [
          ...(isPdf && !missing.has(item.id)
            ? [{text: t('editPages'), onPress: () => openEditor(item.uri)}]
            : [{text: t('cancel'), style: 'cancel' as const}]),
          {
            text: t('removeFromList'),
            onPress: async () => setRecents(await removeRecent(item.id)),
          },
          ...(missing.has(item.id)
            ? []
            : [
                {
                  text: t('share'),
                  onPress: () =>
                    Share.open({url: item.uri, type: item.mimeType}).catch(
                      () => undefined,
                    ),
                },
              ]),
        ],
        {cancelable: true},
      );
    },
    [missing, openEditor],
  );
  // Il ref blocca i doppi tap prima che lo stato `scanning` venga aggiornato.
  const scanningRef = useRef(false);

  const handleScan = useCallback(async () => {
    if (scanningRef.current) {
      return;
    }
    scanningRef.current = true;
    setScanning(true);
    try {
      const result = await scan();
      if (result.pages.length > 0) {
        navigation.navigate('Preview', {
          pages: result.pages,
          pageSizes: result.pageSizes,
          pdfUri: result.pdfUri,
          projectId: activeFilter,
        });
      }
    } catch (error: unknown) {
      const code = getErrorCode(error);
      if (code === ScanErrorCode.Unavailable) {
        Alert.alert(t('error'), t('scannerUnavailable'));
      } else if (code !== ScanErrorCode.Cancelled) {
        Alert.alert(t('error'), t('scanError'));
      }
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [navigation, activeFilter]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{t('appName')}</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('Projects')}
          accessibilityRole="button"
          accessibilityLabel={t('projects')}
          hitSlop={8}>
          <Text style={styles.headerButtonText}>📁 {t('projects')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings')}
          hitSlop={12}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>
      {recents.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.emptyText}>{t('noScans')}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={visibleRecents}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>{t('recentScans')}</Text>
              {settings.projects.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}>
                  {[undefined, ...settings.projects].map(p => {
                    const selected = p?.id === activeFilter;
                    return (
                      <TouchableOpacity
                        key={p?.id ?? 'all'}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => setFilter(p?.id)}
                        accessibilityRole="radio"
                        accessibilityState={{checked: selected}}>
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextActive,
                          ]}>
                          {p ? p.name : t('allFiles')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyFilter}>{t('noScansInProject')}</Text>
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleOpen(item)}
              onLongPress={() => handleMore(item)}
              accessibilityRole="button"
              accessibilityHint={t('recentHint')}>
              {item.thumbnail ? (
                <Image
                  source={{uri: `file://${item.thumbnail}`}}
                  style={styles.thumb}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {new Date(item.savedAt).toLocaleDateString()} ·{' '}
                  {item.pageCount}{' '}
                  {item.pageCount === 1 ? t('page') : t('pages')} ·{' '}
                  {item.mimeType === 'application/pdf' ? 'PDF' : 'JPG'}
                </Text>
                <Text
                  style={[
                    styles.rowMeta,
                    missing.has(item.id) && styles.rowMissing,
                  ]}
                  numberOfLines={1}>
                  {missing.has(item.id) ? t('fileMissing') : item.destination}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleMore(item)}
                accessibilityRole="button"
                accessibilityLabel={t('moreActions')}
                hitSlop={12}>
                <Text style={styles.more}>⋮</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditor()}
          disabled={scanning}
          accessibilityRole="button">
          <Text style={styles.editButtonText}>{t('editPdf')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleScan}
          activeOpacity={0.8}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel={t('scanDocument')}
          accessibilityState={{busy: scanning, disabled: scanning}}>
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.scanButtonText}>{t('scan')}</Text>
          )}
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
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: {fontSize: 28, fontWeight: '700', color: '#1a1a1a', flex: 1},
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    marginRight: 12,
  },
  headerButtonText: {color: '#2563eb', fontWeight: '600', fontSize: 14},
  settingsIcon: {fontSize: 26, color: '#555'},
  body: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  list: {flex: 1},
  chips: {gap: 8, paddingHorizontal: 20, paddingBottom: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  chipActive: {backgroundColor: '#2563eb'},
  chipText: {fontSize: 14, color: '#444'},
  chipTextActive: {color: '#fff', fontWeight: '600'},
  emptyFilter: {textAlign: 'center', color: '#888', padding: 32},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  thumb: {width: 48, height: 64, borderRadius: 6, backgroundColor: '#f0f0f0'},
  thumbEmpty: {borderWidth: 1, borderColor: '#e0e0e0'},
  rowText: {flex: 1},
  rowName: {fontSize: 16, color: '#1a1a1a', fontWeight: '500'},
  rowMeta: {fontSize: 12, color: '#888', marginTop: 2},
  rowMissing: {color: '#c2410c'},
  more: {fontSize: 22, color: '#888', paddingHorizontal: 4},
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  editButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 12,
  },
  editButtonText: {color: '#2563eb', fontSize: 16, fontWeight: '600'},
  scanButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 32,
    elevation: 4,
    shadowColor: '#2563eb',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
