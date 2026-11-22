import React, {useState, useCallback} from 'react';
import {
  View,
  FlatList,
  Image,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Share from 'react-native-share';
import {removeRecent, updateRecent} from '../recents/recents';
import {useRecents} from '../recents/useRecents';
import ProjectFilter from '../components/ProjectFilter';
import {moveRecent, needsMove, describeLocation} from '../recents/move';
import ActionSheet from '../components/ActionSheet';
import type {SheetOption} from '../components/ActionSheet';
import type {Project} from '../settings/settings';
import type {RecentFile} from '../recents/recents';
import {StorageErrorCode} from '../native/StorageAccess';
import {useSettings} from '../settings/SettingsContext';
import {pickPdf, loadPdf, PdfErrorCode} from '../native/PdfEditor';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {getErrorCode} from '../native/DocumentScanner';
import {t, LOCALE} from '../i18n';
import type {RootStackParamList} from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Files'>;

/** Tutti gli ultimi file salvati, filtrabili per progetto. */
export default function FilesScreen() {
  const navigation = useNavigation<Nav>();
  const {recents, setRecents, missing, open: handleOpen} = useRecents();
  const {settings} = useSettings();
  // Filtro per progetto: undefined = tutti i file.
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const activeFilter = settings.projects.some(p => p.id === filter)
    ? filter
    : undefined;
  const visibleRecents = activeFilter
    ? recents.filter(r => r.projectId === activeFilter)
    : recents;
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

  const [sheet, setSheet] = useState<{
    title: string;
    subtitle?: string;
    options: SheetOption[];
  } | null>(null);
  const [moving, setMoving] = useState(false);
  const projectName = (item: RecentFile) =>
    settings.projects.find(p => p.id === item.projectId)?.name;

  /** Sposta il file nella posizione del progetto scelto: è il progetto che comanda. */
  const moveTo = useCallback(
    async (item: RecentFile, target: Project | undefined) => {
      const from = settings.projects.find(p => p.id === item.projectId);
      if (!needsMove(item, from, target, settings)) {
        return;
      }
      setMoving(true);
      try {
        const {entry, originalRemoved} = await moveRecent(
          item,
          target,
          settings,
        );
        setRecents(await updateRecent(entry));
        if (!originalRemoved) {
          Alert.alert(t('movedCopyOnly'), t('movedCopyOnlyHint'));
        }
      } catch (error: unknown) {
        Alert.alert(
          t('error'),
          getErrorCode(error) === StorageErrorCode.PermissionDenied
            ? t('folderAccessLost')
            : t('moveError'),
        );
      } finally {
        setMoving(false);
      }
    },
    [settings, setRecents],
  );

  const chooseProject = useCallback(
    (item: RecentFile) => {
      setSheet({
        title: t('moveToProject'),
        subtitle: t('moveToProjectHint'),
        options: [undefined, ...settings.projects].map(p => ({
          label: p ? p.name : t('noProject'),
          detail: describeLocation(p, settings),
          selected: (p?.id ?? undefined) === (item.projectId ?? undefined),
          onPress: () => moveTo(item, p),
        })),
      });
    },
    [settings, moveTo],
  );

  const handleMore = useCallback(
    (item: RecentFile) => {
      const isMissing = missing.has(item.id);
      const isPdf = item.mimeType === 'application/pdf';
      const options: SheetOption[] = [];
      if (!isMissing) {
        options.push({
          label: t('moveToProject'),
          onPress: () => chooseProject(item),
        });
        if (isPdf) {
          options.push({
            label: t('editPages'),
            onPress: () => openEditor(item.uri),
          });
        }
        options.push({
          label: t('share'),
          onPress: () =>
            Share.open({url: item.uri, type: item.mimeType}).catch(
              () => undefined,
            ),
        });
      }
      options.push({
        label: t('removeFromList'),
        destructive: true,
        onPress: async () => setRecents(await removeRecent(item.id)),
      });
      setSheet({title: item.name, subtitle: item.destination, options});
    },
    [missing, openEditor, chooseProject, setRecents],
  );
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
        <Text style={styles.title}>{t('files')}</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('Projects')}
          accessibilityRole="button"
          accessibilityLabel={t('projects')}
          hitSlop={8}>
          <Text style={styles.headerButtonText}>📁 {t('projects')}</Text>
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
              {settings.projects.length > 0 && (
                <View style={styles.filter}>
                  <ProjectFilter
                    projects={settings.projects}
                    value={activeFilter}
                    onChange={setFilter}
                    onManage={() => navigation.navigate('Projects')}
                  />
                </View>
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
                {projectName(item) ? (
                  <View style={styles.projectBadge}>
                    <Text style={styles.projectBadgeText} numberOfLines={1}>
                      📁 {projectName(item)}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {new Date(item.savedAt).toLocaleDateString(LOCALE)} ·{' '}
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
      <ActionSheet
        visible={sheet !== null}
        title={sheet?.title}
        subtitle={sheet?.subtitle}
        options={sheet?.options ?? []}
        onClose={() => setSheet(null)}
      />
      {moving && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>{t('moving')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {fontSize: 24, color: '#2563eb', paddingRight: 4},
  title: {fontSize: 20, fontWeight: '600', color: '#1a1a1a', flex: 1},
  filter: {paddingTop: 12},
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    marginRight: 12,
  },
  headerButtonText: {color: '#2563eb', fontWeight: '600', fontSize: 14},
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  list: {flex: 1},
  emptyFilter: {textAlign: 'center', color: '#888', padding: 32},
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
  projectBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
  },
  projectBadgeText: {fontSize: 12, color: '#2563eb', fontWeight: '500'},
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  overlayText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  more: {fontSize: 22, color: '#888', paddingHorizontal: 4},
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
});
