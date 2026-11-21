import React, {useState, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {scan, getErrorCode, ScanErrorCode} from '../native/DocumentScanner';
import {t} from '../i18n';
import type {RootStackParamList} from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [scanning, setScanning] = useState(false);
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
      <View style={styles.body}>
        <Text style={styles.emptyText}>{t('noScans')}</Text>
      </View>
      <View style={styles.footer}>
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
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: {fontSize: 28, fontWeight: '700', color: '#1a1a1a'},
  body: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
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
