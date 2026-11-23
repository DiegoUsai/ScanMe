import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
  ToastAndroid,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {t} from '../i18n';
import {useSettings} from '../settings/SettingsContext';
import {
  createProject,
  projectNameError,
  sameLocation,
} from '../settings/projects';
import type {Project, Settings} from '../settings/settings';
import type {FolderDestination} from '../native/StorageAccess';
import {loadRecents, updateRecent} from '../recents/recents';
import {moveRecent, describeLocation} from '../recents/move';
import ActionSheet from '../components/ActionSheet';
import type {SheetOption} from '../components/ActionSheet';
import {
  pickFolder,
  describeFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import {getErrorCode} from '../native/DocumentScanner';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;

/** Per quanto resta evidenziato un progetto appena creato. */
const HIGHLIGHT_MS = 2500;

/** Messaggio breve di conferma (toast su Android). */
function notify(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

/** Dove salvare i file di un progetto. */
type Location =
  | {kind: 'default'}
  | {kind: 'phone'}
  | {kind: 'folder'; folder: FolderDestination};

function locationOf(project: Project): Location {
  if (project.phone) {
    return {kind: 'phone'};
  }
  return project.destination
    ? {kind: 'folder', folder: project.destination}
    : {kind: 'default'};
}

function withLocation(project: Project, location: Location): Project {
  return {
    ...project,
    phone: location.kind === 'phone' ? true : undefined,
    destination: location.kind === 'folder' ? location.folder : undefined,
    // La cartella scelta qui è già quella del progetto: niente sottocartella.
    ownFolder: location.kind === 'folder' ? true : undefined,
  };
}

export default function ProjectsScreen({navigation}: Props) {
  const {settings, update} = useSettings();
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState<Location>({kind: 'default'});
  const [sheet, setSheet] = useState<Project | null>(null);
  const [moving, setMoving] = useState(false);
  const [adding, setAdding] = useState(false);
  /** Progetto appena creato, evidenziato per qualche secondo. */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Project>>(null);

  useEffect(() => {
    if (!highlightId) {
      return;
    }
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const saveProjects = useCallback(
    (projects: Project[]) => update({projects}),
    [update],
  );

  /** Fa scegliere una cartella o un cloud; undefined se l'utente annulla. */
  const askFolder = useCallback(async (): Promise<
    FolderDestination | undefined
  > => {
    try {
      return await pickFolder();
    } catch (error: unknown) {
      if (getErrorCode(error) !== StorageErrorCode.Cancelled) {
        Alert.alert(t('error'), t('folderPickError'));
      }
      return undefined;
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (adding) {
      return;
    }
    const nameError = projectNameError(newName, settings.projects);
    const project = nameError
      ? undefined
      : createProject(newName, settings.projects);
    if (!project) {
      Alert.alert(
        nameError === 'duplicate'
          ? t('projectNameDuplicate')
          : t('projectNameEmpty'),
      );
      return;
    }
    setAdding(true);
    try {
      await saveProjects([
        ...settings.projects,
        withLocation(project, newLocation),
      ]);
    } catch {
      // Il nome resta nel campo: l'utente può riprovare senza riscriverlo.
      Alert.alert(t('error'), t('projectSaveError'));
      return;
    } finally {
      setAdding(false);
    }
    setNewName('');
    setNewLocation({kind: 'default'});
    Keyboard.dismiss();
    setHighlightId(project.id);
    notify(`${t('projectCreated')}: ${project.name}`);
    // Il nuovo progetto è in fondo alla lista: lo porta in vista.
    setTimeout(() => listRef.current?.scrollToEnd({animated: true}), 100);
  }, [adding, newName, newLocation, settings.projects, saveProjects]);

  const chooseNewFolder = useCallback(async () => {
    const folder = await askFolder();
    if (folder) {
      setNewLocation({kind: 'folder', folder});
    }
  }, [askFolder]);

  /** Sposta i file già salvati del progetto nella sua nuova posizione. */
  const migrate = useCallback(
    async (project: Project, nextSettings: Settings) => {
      setMoving(true);
      let failed = 0;
      try {
        const files = (await loadRecents()).filter(
          r => r.projectId === project.id,
        );
        for (const file of files) {
          try {
            const {entry} = await moveRecent(file, project, nextSettings);
            await updateRecent(entry);
          } catch {
            failed++;
          }
        }
      } finally {
        setMoving(false);
      }
      if (failed > 0) {
        Alert.alert(t('error'), `${t('moveError')} (${failed})`);
      }
    },
    [],
  );

  const changeLocation = useCallback(
    async (project: Project, location: Location) => {
      const before = settings;
      const changed = withLocation(project, location);
      const projects = settings.projects.map(p =>
        p.id === project.id ? changed : p,
      );
      await saveProjects(projects);
      const moved = !sameLocation(project, changed, before.destination);
      const hasFiles = (await loadRecents()).some(
        r => r.projectId === project.id,
      );
      if (moved && hasFiles) {
        Alert.alert(t('migrateFiles'), t('migrateFilesHint'), [
          {text: t('migrateNo'), style: 'cancel'},
          {
            text: t('migrateYes'),
            onPress: () => migrate(changed, {...before, projects}),
          },
        ]);
      }
    },
    [settings, saveProjects, migrate],
  );

  const sheetOptions = (project: Project): SheetOption[] => {
    const current = locationOf(project).kind;
    return [
      {
        label: t('locationDefault'),
        detail: settings.destination
          ? describeFolder(settings.destination)
          : t('downloadFolder'),
        selected: current === 'default',
        onPress: () => changeLocation(project, {kind: 'default'}),
      },
      {
        label: t('locationPhone'),
        detail: t('downloadFolder'),
        selected: current === 'phone',
        onPress: () => changeLocation(project, {kind: 'phone'}),
      },
      {
        label: t('locationFolder'),
        detail: project.destination
          ? describeFolder(project.destination)
          : undefined,
        selected: current === 'folder',
        onPress: async () => {
          const folder = await askFolder();
          if (folder) {
            await changeLocation(project, {kind: 'folder', folder});
          }
        },
      },
      {
        label: t('deleteProject'),
        destructive: true,
        onPress: () =>
          Alert.alert(t('deleteProject'), t('deleteProjectHint'), [
            {text: t('cancel'), style: 'cancel'},
            {
              text: t('confirm'),
              style: 'destructive',
              onPress: () =>
                saveProjects(
                  settings.projects.filter(p => p.id !== project.id),
                ),
            },
          ]),
      },
    ];
  };

  /** Percorso completo in cui finiranno i file del progetto. */
  const describe = (project: Project): string =>
    describeLocation(project, settings);

  const locationChips: Array<{key: Location['kind']; label: string}> = [
    {key: 'default', label: t('locationDefault')},
    {key: 'phone', label: t('locationPhone')},
    {
      key: 'folder',
      label:
        newLocation.kind === 'folder'
          ? describeFolder(newLocation.folder)
          : t('locationFolder'),
    },
  ];

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
        <Text style={styles.title}>{t('projects')}</Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('newProjectPlaceholder')}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={[
            styles.addButton,
            (adding || newName.trim() === '') && styles.addButtonDisabled,
          ]}
          onPress={handleAdd}
          disabled={adding}
          accessibilityRole="button"
          accessibilityState={{disabled: adding || newName.trim() === ''}}>
          {adding ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>{t('add')}</Text>
          )}
        </TouchableOpacity>
      </View>
      <Text style={styles.locationLabel}>{t('projectLocation')}</Text>
      <View style={styles.chips}>
        {locationChips.map(chip => {
          const selected = newLocation.kind === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() =>
                chip.key === 'folder'
                  ? chooseNewFolder()
                  : setNewLocation({kind: chip.key} as Location)
              }
              accessibilityRole="radio"
              accessibilityState={{checked: selected}}>
              <Text
                style={[styles.chipText, selected && styles.chipTextActive]}
                numberOfLines={1}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {newLocation.kind === 'folder' ? t('ownFolderHint') : t('projectsHint')}
      </Text>
      <Text style={styles.hint}>{t('folderPickerHint')}</Text>

      <FlatList
        ref={listRef}
        data={settings.projects}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('noProjects')}</Text>}
        renderItem={({item}) => (
          <View style={[styles.row, item.id === highlightId && styles.rowNew]}>
            <TouchableOpacity
              style={styles.rowText}
              onPress={() => setSheet(item)}
              accessibilityRole="button"
              accessibilityHint={t('chooseFolder')}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {describe(item)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSheet(item)}
              accessibilityRole="button"
              accessibilityLabel={t('moreActions')}
              hitSlop={12}>
              <Text style={styles.more}>⋮</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <ActionSheet
        visible={sheet !== null}
        title={sheet?.name}
        subtitle={sheet ? describe(sheet) : undefined}
        options={sheet ? sheetOptions(sheet) : []}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {fontSize: 24, color: '#2563eb', paddingRight: 4},
  title: {fontSize: 20, fontWeight: '600', color: '#1a1a1a', flex: 1},
  addRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonDisabled: {opacity: 0.5},
  addButtonText: {color: '#fff', fontWeight: '600'},
  locationLabel: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
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
    maxWidth: '100%',
  },
  chipActive: {backgroundColor: '#2563eb'},
  chipText: {fontSize: 14, color: '#444'},
  chipTextActive: {color: '#fff', fontWeight: '600'},
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
  hint: {fontSize: 12, color: '#888', paddingHorizontal: 16, paddingTop: 6},
  list: {paddingVertical: 8},
  empty: {textAlign: 'center', color: '#888', padding: 32},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowNew: {backgroundColor: '#dbeafe'},
  rowText: {flex: 1},
  rowName: {fontSize: 16, color: '#1a1a1a', fontWeight: '500'},
  rowMeta: {fontSize: 12, color: '#888', marginTop: 2},
  more: {fontSize: 22, color: '#888', paddingHorizontal: 4},
});
