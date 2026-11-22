import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {t} from '../i18n';
import type {StringKey} from '../i18n';
import type {RootStackParamList} from '../App';

export type TabName = 'Home' | 'Files' | 'Settings';

const TABS: Array<{name: TabName; icon: string; label: StringKey}> = [
  {name: 'Home', icon: '⛶', label: 'scan'},
  {name: 'Files', icon: '🗂', label: 'filesAndProjects'},
  {name: 'Settings', icon: '⚙', label: 'settings'},
];

/**
 * Barra in basso con le tre sezioni principali. Usa lo stack esistente, senza
 * nuove dipendenze: la home resta sempre in fondo e sopra c'è al massimo una
 * sezione, così il tasto Indietro di Android riporta sempre alla home.
 */
export default function TabBar({current}: {current: TabName}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const go = (target: TabName) => {
    if (target === current) {
      return;
    }
    if (target === 'Home') {
      navigation.popTo('Home');
    } else if (current === 'Home') {
      navigation.navigate(target);
    } else {
      navigation.replace(target);
    }
  };

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map(tab => {
        const selected = tab.name === current;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => go(tab.name)}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            accessibilityLabel={t(tab.label)}>
            <Text style={[styles.icon, selected && styles.selected]}>
              {tab.icon}
            </Text>
            <Text
              style={[styles.label, selected && styles.selected]}
              numberOfLines={1}>
              {t(tab.label)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d4d4d8',
    backgroundColor: '#fff',
    paddingTop: 6,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 2,
  },
  icon: {fontSize: 22, color: '#555'},
  label: {fontSize: 12, color: '#555', fontWeight: '500'},
  selected: {color: '#2563eb', fontWeight: '700'},
});
