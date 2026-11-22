import React, {useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {t} from '../i18n';
import {useSettings} from '../settings/SettingsContext';
import FormatSelector from '../components/FormatSelector';
import {
  pickFolder,
  describeFolder,
  StorageErrorCode,
} from '../native/StorageAccess';
import {getErrorCode} from '../native/DocumentScanner';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({navigation}: Props) {
  const {settings, update} = useSettings();

  const handlePickFolder = useCallback(async () => {
    try {
      // Il permesso sulla cartella precedente non viene rilasciato: i file
      // già salvati lì devono restare apribili dagli ultimi file.
      await update({destination: await pickFolder()});
    } catch (error: unknown) {
      if (getErrorCode(error) !== StorageErrorCode.Cancelled) {
        Alert.alert(t('error'), t('folderPickError'));
      }
    }
  }, [update]);

  const handleUseDownload = useCallback(async () => {
    await update({destination: undefined});
  }, [update]);

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
        <Text style={styles.title}>{t('settings')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('defaultDestination')}</Text>
        <View style={styles.card}>
          <Text style={styles.value} numberOfLines={2}>
            {settings.destination
              ? describeFolder(settings.destination)
              : t('downloadFolder')}
          </Text>
          <Text style={styles.hint}>{t('defaultDestinationHint')}</Text>
          <Text style={styles.hint}>{t('folderPickerHint')}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.button}
              onPress={handlePickFolder}
              accessibilityRole="button">
              <Text style={styles.buttonText}>{t('chooseFolder')}</Text>
            </TouchableOpacity>
            {settings.destination && (
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={handleUseDownload}
                accessibilityRole="button">
                <Text style={styles.buttonSecondaryText}>
                  {t('useDownloadFolder')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('projects')}</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Projects')}
          accessibilityRole="button">
          <Text style={styles.value}>
            {settings.projects.length === 0
              ? t('noProjects')
              : settings.projects.map(p => p.name).join(', ')}
          </Text>
          <Text style={styles.hint}>{t('manageProjects')}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{t('defaultFormat')}</Text>
        <View style={styles.card}>
          <FormatSelector
            formats={['pdf', 'jpg', 'gallery']}
            value={settings.defaultFormat}
            onChange={f => update({defaultFormat: f})}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('captureMode')}</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>{t('captureModeHint')}</Text>
        </View>
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
  content: {padding: 16, paddingBottom: 40},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {backgroundColor: '#f7f7f8', borderRadius: 12, padding: 16, gap: 8},
  value: {fontSize: 16, color: '#1a1a1a', fontWeight: '500'},
  hint: {fontSize: 13, color: '#777', lineHeight: 18},
  buttons: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {color: '#fff', fontWeight: '600'},
  buttonSecondary: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonSecondaryText: {color: '#2563eb', fontWeight: '600'},
});
