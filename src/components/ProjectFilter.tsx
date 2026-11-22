import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import {t} from '../i18n';
import type {Project} from '../settings/settings';
import {fitChips, withSelectedVisible} from '../utils/chipRows';
import ActionSheet from './ActionSheet';

const GAP = 8;
const MAX_ROWS = 2;

interface Props {
  projects: Project[];
  /** id del progetto selezionato; undefined = tutti i file. */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  /** Apre la gestione dei progetti dal menu "Altri". */
  onManage?: () => void;
}

interface Chip {
  key: string;
  id: string | undefined;
  label: string;
}

/**
 * Filtri per progetto su al massimo due righe. Le etichette che non ci stanno
 * finiscono nel menu "⋯ Altri"; quella selezionata resta sempre visibile.
 *
 * Le larghezze si misurano disegnando una volta tutte le etichette in una riga
 * invisibile, poi si calcola quante entrano con `fitChips`.
 */
export default function ProjectFilter({
  projects,
  value,
  onChange,
  onManage,
}: Props) {
  const [rowWidth, setRowWidth] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [moreWidth, setMoreWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const chips: Chip[] = useMemo(
    () => [
      {key: 'all', id: undefined, label: t('allFiles')},
      ...projects.map(p => ({key: p.id, id: p.id, label: p.name})),
    ],
    [projects],
  );

  const measured =
    rowWidth > 0 && moreWidth > 0 && chips.every(c => widths[c.key] > 0);

  const {visible, hidden} = useMemo(() => {
    if (!measured) {
      return {visible: chips, hidden: [] as Chip[]};
    }
    const fit = (list: Chip[]) =>
      fitChips(
        list.map(c => widths[c.key]),
        rowWidth,
        GAP,
        moreWidth,
        MAX_ROWS,
      );
    const selectedIndex = chips.findIndex(c => c.id === value);
    const ordered = withSelectedVisible(chips, selectedIndex, fit(chips), 1);
    const count = Math.max(1, fit(ordered));
    return {visible: ordered.slice(0, count), hidden: ordered.slice(count)};
  }, [measured, chips, widths, rowWidth, moreWidth, value]);

  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  }, []);

  const measure = (key: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setWidths(prev => (prev[key] === w ? prev : {...prev, [key]: w}));
  };

  const renderChip = (chip: Chip) => {
    const selected = chip.id === value;
    return (
      <TouchableOpacity
        key={chip.key}
        style={[styles.chip, selected && styles.chipActive]}
        onPress={() => onChange(chip.id)}
        accessibilityRole="radio"
        accessibilityState={{checked: selected}}>
        <Text
          style={[styles.chipText, selected && styles.chipTextActive]}
          numberOfLines={1}>
          {chip.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {/* Riga invisibile per misurare le etichette alla loro larghezza naturale. */}
      <View style={styles.measure} pointerEvents="none" aria-hidden>
        {chips.map(chip => (
          <View key={chip.key} style={styles.chip} onLayout={measure(chip.key)}>
            {/* In grassetto, come quando è selezionata: è la larghezza massima. */}
            <Text style={[styles.chipText, styles.bold]} numberOfLines={1}>
              {chip.label}
            </Text>
          </View>
        ))}
        <View
          style={styles.chip}
          onLayout={e => setMoreWidth(Math.ceil(e.nativeEvent.layout.width))}>
          <Text style={[styles.chipText, styles.bold]}>
            ⋯ {t('moreProjects')} (99)
          </Text>
        </View>
      </View>

      <View style={styles.chips} onLayout={handleRowLayout}>
        {visible.map(renderChip)}
        {hidden.length > 0 && (
          <TouchableOpacity
            style={[styles.chip, styles.moreChip]}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${t('moreProjects')}: ${hidden.length}`}>
            <Text style={styles.moreText}>
              ⋯ {t('moreProjects')} ({hidden.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ActionSheet
        visible={menuOpen}
        title={t('allProjects')}
        options={[
          ...chips.map(chip => ({
            label: chip.label,
            selected: chip.id === value,
            onPress: () => onChange(chip.id),
          })),
          ...(onManage
            ? [{label: t('manageProjectsAction'), onPress: onManage}]
            : []),
        ]}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  measure: {
    position: 'absolute',
    opacity: 0,
    flexDirection: 'row',
    left: 0,
    top: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    marginHorizontal: 20,
    paddingBottom: 8,
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
  bold: {fontWeight: '600'},
  moreChip: {backgroundColor: '#eef2ff'},
  moreText: {fontSize: 14, color: '#2563eb', fontWeight: '600'},
});
