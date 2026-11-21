import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {t} from '../i18n';
import type {StringKey} from '../i18n';
import type {OutputFormat} from '../settings/settings';

const FORMAT_LABEL: Record<OutputFormat, StringKey> = {
  pdf: 'formatPdf',
  jpg: 'formatJpg',
  gallery: 'formatGallery',
};

const FORMAT_HINT: Record<OutputFormat, StringKey> = {
  pdf: 'formatPdfHint',
  jpg: 'formatJpgHint',
  gallery: 'formatGalleryHint',
};

interface Props {
  formats: OutputFormat[];
  value: OutputFormat;
  onChange: (format: OutputFormat) => void;
  disabled?: boolean;
}

/** Selettore a segmenti PDF | JPG | Galleria, con una riga che spiega la scelta. */
export default function FormatSelector({
  formats,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <View>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {formats.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.segment, f === value && styles.segmentActive]}
            onPress={() => onChange(f)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{checked: f === value}}>
            <Text
              style={[
                styles.segmentText,
                f === value && styles.segmentTextActive,
              ]}>
              {t(FORMAT_LABEL[f])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>{t(FORMAT_HINT[value])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentText: {fontSize: 14, color: '#666', fontWeight: '500'},
  segmentTextActive: {color: '#2563eb', fontWeight: '600'},
  hint: {fontSize: 12, color: '#888', marginTop: 6},
});
