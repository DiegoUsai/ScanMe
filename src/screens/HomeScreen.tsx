import React, {useState, useCallback, useRef} from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useRecents} from '../recents/useRecents';
import TabBar from '../components/TabBar';
import {useSettings} from '../settings/SettingsContext';
import {pickPdf, PdfErrorCode} from '../native/PdfEditor';
import {scan, getErrorCode, ScanErrorCode} from '../native/DocumentScanner';
import {t, LOCALE} from '../i18n';
import type {RootStackParamList} from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

/** Quanti file recenti mostrare in home; gli altri sono nella schermata File. */
const HOME_RECENTS = 3;

/**
 * Home: la scansione è l'azione principale, la modifica di un PDF la seconda.
 * Gli ultimi file restano a portata di mano, l'elenco completo è in "File".
 */
export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [scanning, setScanning] = useState(false);
  const {recents, missing, open} = useRecents();
  const {settings} = useSettings();
  const projectName = (id?: string) =>
    settings.projects.find(p => p.id === id)?.name;

  /** Apre l'editor su un PDF scelto ora. */
  const openEditor = useCallback(async () => {
    try {
      navigation.navigate('EditPdf', {pdf: await pickPdf()});
    } catch (error: unknown) {
      const code = getErrorCode(error);
      if (code === PdfErrorCode.Cancelled) {
        return;
      }
      Alert.alert(
        t('error'),
        code === PdfErrorCode.Protected ? t('pdfProtected') : t('pdfOpenError'),
      );
    }
  }, [navigation]);

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
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{t('appName')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.scanCard}
          onPress={handleScan}
          activeOpacity={0.85}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel={t('scanDocument')}
          accessibilityState={{busy: scanning, disabled: scanning}}>
          {scanning ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Text style={styles.scanIcon}>⛶</Text>
              <Text style={styles.scanTitle}>{t('scan')}</Text>
              <Text style={styles.scanSubtitle}>{t('scanSubtitle')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editCard}
          onPress={openEditor}
          disabled={scanning}
          accessibilityRole="button">
          <Text style={styles.editIcon}>✎</Text>
          <Text style={styles.editText}>{t('editPdf')}</Text>
        </TouchableOpacity>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('lastFiles')}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Files')}
            accessibilityRole="button"
            hitSlop={12}>
            <Text style={styles.seeAll}>{t('seeAll')} ›</Text>
          </TouchableOpacity>
        </View>

        {recents.length === 0 ? (
          <Text style={styles.empty}>{t('noScans')}</Text>
        ) : (
          recents.slice(0, HOME_RECENTS).map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => open(item)}
              onLongPress={() => navigation.navigate('Files')}
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
                <Text
                  style={[
                    styles.rowMeta,
                    missing.has(item.id) && styles.rowMissing,
                  ]}
                  numberOfLines={1}>
                  {missing.has(item.id)
                    ? t('fileMissing')
                    : [
                        new Date(item.savedAt).toLocaleDateString(LOCALE),
                        projectName(item.projectId),
                        item.mimeType === 'application/pdf' ? 'PDF' : 'JPG',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      <TabBar current="Home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {fontSize: 28, fontWeight: '700', color: '#1a1a1a', flex: 1},
  content: {padding: 20, gap: 14},
  scanCard: {
    backgroundColor: '#2563eb',
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
    minHeight: 180,
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#2563eb',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  scanIcon: {fontSize: 48, color: '#fff'},
  scanTitle: {fontSize: 24, fontWeight: '700', color: '#fff'},
  scanSubtitle: {fontSize: 14, color: '#dbeafe'},
  editCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  editIcon: {fontSize: 22, color: '#1e40af'},
  editText: {fontSize: 16, fontWeight: '600', color: '#1e40af'},
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
  },
  seeAll: {fontSize: 14, fontWeight: '600', color: '#2563eb'},
  empty: {color: '#888', textAlign: 'center', paddingVertical: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#f7f7f8',
  },
  thumb: {width: 40, height: 54, borderRadius: 6, backgroundColor: '#e5e7eb'},
  thumbEmpty: {borderWidth: 1, borderColor: '#e0e0e0'},
  rowText: {flex: 1},
  rowName: {fontSize: 15, color: '#1a1a1a', fontWeight: '500'},
  rowMeta: {fontSize: 12, color: '#666', marginTop: 2},
  rowMissing: {color: '#c2410c'},
});
