import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Share from 'react-native-share';
import {t} from '../i18n';
import {defaultFileName, saveToDevice, saveToGallery, copyToCache} from '../utils/files';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export default function PreviewScreen({route, navigation}: Props) {
  const {pages, pdfUri} = route.params;
  const [currentPage, setCurrentPage] = useState(0);
  const [fileName, setFileName] = useState(defaultFileName);
  const [saving, setSaving] = useState(false);

  const handleSavePdf = useCallback(async () => {
    if (!pdfUri || saving) return;
    setSaving(true);
    try {
      await saveToDevice(pdfUri, `${fileName}.pdf`, 'application/pdf');
      Alert.alert(t('saved'));
      navigation.goBack();
    } catch {
      Alert.alert(t('error'), t('saveError'));
    } finally {
      setSaving(false);
    }
  }, [pdfUri, fileName, saving, navigation]);

  const handleSaveJpg = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (pages.length === 1) {
        await saveToDevice(pages[0], `${fileName}.jpg`, 'image/jpeg');
      } else {
        for (let i = 0; i < pages.length; i++) {
          await saveToDevice(
            pages[i],
            `${fileName}_${i + 1}.jpg`,
            'image/jpeg',
          );
        }
      }
      Alert.alert(t('saved'));
      navigation.goBack();
    } catch {
      Alert.alert(t('error'), t('saveError'));
    } finally {
      setSaving(false);
    }
  }, [pages, fileName, saving, navigation]);

  const handleSaveGallery = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const suffix = pages.length > 1 ? `_${i + 1}` : '';
        await saveToGallery(pages[i], `${fileName}${suffix}`);
      }
      Alert.alert(t('saved'));
      navigation.goBack();
    } catch {
      Alert.alert(t('error'), t('saveError'));
    } finally {
      setSaving(false);
    }
  }, [pages, fileName, saving, navigation]);

  const handleShare = useCallback(async () => {
    try {
      // Share PDF if available, otherwise share current page image
      const uri = pdfUri ?? pages[currentPage];
      const cachePath = await copyToCache(
        uri,
        pdfUri ? `${fileName}.pdf` : `${fileName}.jpg`,
      );
      await Share.open({
        url: `file://${cachePath}`,
        type: pdfUri ? 'application/pdf' : 'image/jpeg',
        filename: pdfUri ? `${fileName}.pdf` : `${fileName}.jpg`,
      });
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert(t('error'), e?.message);
      }
    }
  }, [pages, pdfUri, currentPage, fileName]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('preview')}</Text>
        <Text style={styles.pageCount}>
          {pages.length} {pages.length === 1 ? t('page') : t('pages')}
        </Text>
      </View>

      {/* Page preview */}
      <View style={styles.previewContainer}>
        <Image
          source={{uri: pages[currentPage]}}
          style={styles.previewImage}
          resizeMode="contain"
        />
      </View>

      {/* Page dots */}
      {pages.length > 1 && (
        <ScrollView
          horizontal
          style={styles.dotsContainer}
          contentContainerStyle={styles.dotsContent}
          showsHorizontalScrollIndicator={false}>
          {pages.map((_, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dot, i === currentPage && styles.dotActive]}
              onPress={() => setCurrentPage(i)}>
              <Text
                style={[
                  styles.dotText,
                  i === currentPage && styles.dotTextActive,
                ]}>
                {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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

      {/* Action buttons */}
      <ScrollView
        horizontal
        style={styles.actionsContainer}
        contentContainerStyle={styles.actionsContent}
        showsHorizontalScrollIndicator={false}>
        {pdfUri && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSavePdf}
            disabled={saving}>
            <Text style={styles.actionIcon}>📄</Text>
            <Text style={styles.actionLabel}>{t('savePdf')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSaveJpg}
          disabled={saving}>
          <Text style={styles.actionIcon}>🖼</Text>
          <Text style={styles.actionLabel}>{t('saveJpg')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSaveGallery}
          disabled={saving}>
          <Text style={styles.actionIcon}>📱</Text>
          <Text style={styles.actionLabel}>{t('saveToGallery')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
          disabled={saving}>
          <Text style={styles.actionIcon}>↗</Text>
          <Text style={styles.actionLabel}>{t('share')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
  pageCount: {fontSize: 14, color: '#888'},
  previewContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  dotsContainer: {maxHeight: 48},
  dotsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
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
  actionsContainer: {maxHeight: 88},
  actionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 100,
  },
  actionIcon: {fontSize: 24, marginBottom: 4},
  actionLabel: {fontSize: 12, color: '#1a1a1a', fontWeight: '500'},
});
