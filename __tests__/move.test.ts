jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {CacheDir: '/cache', DocumentDir: '/docs', DownloadDir: '/dl'}},
}));

import {movedFileNames, needsMove} from '../src/recents/move';
import {resolveDestination} from '../src/settings/projects';
import type {Project, Settings} from '../src/settings/settings';
import type {RecentFile} from '../src/recents/recents';

const drive = {uri: 'content://drive/tree/1', name: 'Drive'};
const settings: Settings = {
  destination: drive,
  defaultFormat: 'pdf',
  projects: [],
};
const entry: RecentFile = {
  id: '1',
  name: 'Fattura',
  uri: 'content://x/1',
  mimeType: 'application/pdf',
  pageCount: 1,
  savedAt: 0,
  destination: 'Drive',
};

describe('resolveDestination', () => {
  it('ignora la predefinita se il progetto è sul telefono', () => {
    const p: Project = {id: 'a', name: 'A', phone: true};
    expect(resolveDestination(p, drive)).toBeUndefined();
  });
  it('usa la predefinita se il progetto non ha posizione', () => {
    expect(resolveDestination({id: 'a', name: 'A'}, drive)).toBe(drive);
  });
});

describe('movedFileNames', () => {
  it('un solo file', () => {
    expect(movedFileNames(entry)).toEqual(['Fattura.pdf']);
  });
  it('più immagini numerate', () => {
    const jpg = {
      ...entry,
      mimeType: 'image/jpeg',
      uris: ['a', 'b'],
    } as RecentFile;
    expect(movedFileNames(jpg)).toEqual(['Fattura_1.jpg', 'Fattura_2.jpg']);
  });
});

describe('needsMove', () => {
  const a: Project = {id: 'a', name: 'Casa'};
  const phone: Project = {id: 'a', name: 'Casa', phone: true};
  it('nessuno spostamento se il progetto è lo stesso', () => {
    expect(needsMove({...entry, projectId: 'a'}, a, a, settings)).toBe(false);
  });
  it('spostamento verso un altro progetto', () => {
    expect(needsMove(entry, undefined, a, settings)).toBe(true);
  });
  it('spostamento se il progetto passa sul telefono', () => {
    expect(needsMove(entry, a, phone, settings)).toBe(true);
  });
});
