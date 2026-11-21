import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {t} from '../i18n';
import {useSettings} from '../settings/SettingsContext';
import {createProject, projectFolderName} from '../settings/projects';
import type {Project} from '../settings/settings';
import {
  pickFolder,
  describeFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import {getErrorCode} from '../native/DocumentScanner';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;

export default function ProjectsScreen({navigation}: Props) {
  const {settings, update} = useSettings();
  const [newName, setNewName] = useState('');

  const saveProjects = useCallback(
    (projects: Project[]) => update({projects}),
    [update],
  );

  const handleAdd = useCallback(async () => {
    const project = createProject(newName, settings.projects);
    if (!project) {
      Alert.alert(t('projectNameInvalid'));
      return;
    }
    await saveProjects([...settings.projects, project]);
    setNewName('');
  }, [newName, settings.projects, saveProjects]);

  const setDestination = useCallback(
    async (project: Project) => {
      try {
        const folder = await pickFolder();
        await saveProjects(
          settings.projects.map(p =>
            p.id === project.id ? {...p, destination: folder} : p,
          ),
        );
      } catch (error: unknown) {
        if (getErrorCode(error) !== StorageErrorCode.Cancelled) {
          Alert.alert(t('error'), t('folderPickError'));
        }
      }
    },
    [settings.projects, saveProjects],
  );

  // Su Android un Alert mostra al massimo tre pulsanti: la scelta della
  // cartella sta sul tocco della riga, le altre azioni sul menu ⋮.
  const handleActions = useCallback(
    (project: Project) => {
      Alert.alert(project.name, undefined, [
        {text: t('cancel'), style: 'cancel'},
        {
          text: t('deleteProject'),
          style: 'destructive',
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
        ...(project.destination
          ? [
              {
                text: t('useDefaultDestination'),
                onPress: () =>
                  saveProjects(
                    settings.projects.map(p =>
                      p.id === project.id ? {...p, destination: undefined} : p,
                    ),
                  ),
              },
            ]
          : []),
      ]);
    },
    [settings.projects, saveProjects],
  );

  /** Percorso completo in cui finiranno i file del progetto. */
  const describe = (project: Project): string => {
    const base = project.destination ?? settings.destination;
    const root = base ? describeFolder(base) : t('downloadFolder');
    return `${root} › ${projectFolderName(project)}`;
  };

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
          style={styles.addButton}
          onPress={handleAdd}
          accessibilityRole="button">
          <Text style={styles.addButtonText}>{t('add')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>{t('projectsHint')}</Text>

      <FlatList
        data={settings.projects}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('noProjects')}</Text>}
        renderItem={({item}) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.rowText}
              onPress={() => setDestination(item)}
              accessibilityRole="button"
              accessibilityHint={t('chooseFolder')}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {describe(item)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleActions(item)}
              accessibilityRole="button"
              accessibilityLabel={t('moreActions')}
              hitSlop={12}>
              <Text style={styles.more}>⋮</Text>
            </TouchableOpacity>
          </View>
        )}
      />
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
  addRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8},
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
  addButtonText: {color: '#fff', fontWeight: '600'},
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
  rowText: {flex: 1},
  rowName: {fontSize: 16, color: '#1a1a1a', fontWeight: '500'},
  rowMeta: {fontSize: 12, color: '#888', marginTop: 2},
  more: {fontSize: 22, color: '#888', paddingHorizontal: 4},
});
