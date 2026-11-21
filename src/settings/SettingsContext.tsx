import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {DEFAULT_SETTINGS, loadSettings, saveSettings} from './settings';
import type {Settings} from './settings';

interface SettingsValue {
  settings: Settings;
  /** false finché il file delle impostazioni non è stato letto. */
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  update: async () => {},
});

export function SettingsProvider({children}: {children: React.ReactNode}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = {...settings, ...patch};
      setSettings(next);
      await saveSettings(next);
    },
    [settings],
  );

  const value = useMemo(
    () => ({settings, loaded, update}),
    [settings, loaded, update],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}
