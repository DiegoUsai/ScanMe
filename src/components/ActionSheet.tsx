import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {t} from '../i18n';

export interface SheetOption {
  label: string;
  /** Riga secondaria sotto l'etichetta (es. la posizione di un progetto). */
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  /** Evidenzia l'opzione corrente (es. il progetto in cui sta già il file). */
  selected?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: SheetOption[];
  onClose: () => void;
}

/**
 * Menu dal basso. Sostituisce Alert.alert, che su Android mostra al massimo
 * tre pulsanti: qui le opzioni possono essere quante servono.
 */
export default function ActionSheet({
  visible,
  title,
  subtitle,
  options,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        <ScrollView style={styles.list}>
          {options.map(option => (
            <TouchableOpacity
              key={option.label}
              style={styles.option}
              onPress={() => {
                onClose();
                option.onPress();
              }}
              accessibilityRole="button"
              accessibilityState={{selected: option.selected}}>
              <Text
                style={[
                  styles.optionText,
                  option.destructive && styles.destructive,
                  option.selected && styles.selected,
                ]}>
                {option.selected ? '✓ ' : ''}
                {option.label}
              </Text>
              {option.detail ? (
                <Text style={styles.detail} numberOfLines={1}>
                  {option.detail}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.cancel}
          onPress={onClose}
          accessibilityRole="button">
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.35)'},
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 20,
    marginTop: 2,
  },
  list: {marginTop: 8},
  option: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  optionText: {fontSize: 16, color: '#1a1a1a'},
  destructive: {color: '#dc2626'},
  selected: {color: '#2563eb', fontWeight: '600'},
  detail: {fontSize: 12, color: '#888', marginTop: 2},
  cancel: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  cancelText: {fontSize: 16, color: '#2563eb', fontWeight: '600'},
});
