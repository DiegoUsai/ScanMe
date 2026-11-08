import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {scan} from '../native/DocumentScanner';
import {t} from '../i18n';
import type {RootStackParamList} from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [scanning, setScanning] = useState(false);

  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const result = await scan(0);
      if (result.pages.length > 0) {
        navigation.navigate('Preview', {
          pages: result.pages,
          pdfUri: result.pdfUri,
        });
      }
    } catch (e: any) {
      if (e.code !== 'SCAN_CANCELLED') {
        Alert.alert(t('error'), t('scanError'));
      }
    } finally {
      setScanning(false);
    }
  }, [scanning, navigation]);

  return (
    <View style={styles.container}>
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
          disabled={scanning}>
          <Text style={styles.scanButtonText}>
            {scanning ? '...' : t('scan')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
