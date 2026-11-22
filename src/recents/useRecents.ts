import {useCallback, useState} from 'react';
import {Alert} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {loadRecents} from './recents';
import type {RecentFile} from './recents';
import {fileExists, openFile} from '../native/StorageAccess';
import {t} from '../i18n';

/**
 * Ultimi file salvati, ricaricati ogni volta che la schermata torna in primo
 * piano (es. dopo un salvataggio), con l'elenco di quelli non più trovati.
 */
export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>([]);
  // id dei file che non esistono più nella destinazione (cancellati o spostati).
  const [missing, setMissing] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRecents().then(async list => {
        if (!active) {
          return;
        }
        setRecents(list);
        const checks = await Promise.all(list.map(r => fileExists(r.uri)));
        if (active) {
          setMissing(new Set(list.filter((_, i) => !checks[i]).map(r => r.id)));
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const open = useCallback(
    async (item: RecentFile) => {
      if (missing.has(item.id)) {
        Alert.alert(t('fileMissing'), t('fileMissingHint'));
        return;
      }
      try {
        await openFile(item.uri, item.mimeType);
      } catch {
        Alert.alert(t('error'), t('openError'));
      }
    },
    [missing],
  );

  return {recents, setRecents, missing, open};
}
