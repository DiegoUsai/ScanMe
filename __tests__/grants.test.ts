jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: {CacheDir: '/cache', DocumentDir: '/docs', DownloadDir: '/dl'},
  },
}));

import {isFileInUse, isFolderInUse} from '../src/settings/grants';
import type {Settings} from '../src/settings/settings';
import type {RecentFile} from '../src/recents/recents';

const tree = 'content://com.google.android.apps.docs.storage/tree/abc';
const other = 'content://com.google.android.apps.docs.storage/tree/xyz';

const base: Settings = {defaultFormat: 'pdf', projects: []};

function recent(uri: string, uris?: string[]): RecentFile {
  return {
    id: uri,
    name: 'Doc',
    uri,
    uris,
    mimeType: 'application/pdf',
    pageCount: 1,
    savedAt: 0,
    destination: 'Drive',
  };
}

describe('isFolderInUse', () => {
  it('libera se nulla la usa', () => {
    expect(isFolderInUse(tree, base, [])).toBe(false);
  });
  it('in uso se è la destinazione predefinita', () => {
    const s = {...base, destination: {uri: tree, name: 'Scan'}};
    expect(isFolderInUse(tree, s, [])).toBe(true);
  });
  it('in uso se è la cartella di un progetto', () => {
    const s = {
      ...base,
      projects: [{id: 'p', name: 'P', destination: {uri: tree, name: 'P'}}],
    };
    expect(isFolderInUse(tree, s, [])).toBe(true);
  });
  it('in uso se contiene file salvati', () => {
    expect(
      isFolderInUse(tree, base, [recent(`${tree}/document/abc%2Ffile.pdf`)]),
    ).toBe(true);
  });
  it('controlla anche le pagine JPG successive alla prima', () => {
    const r = recent('content://media/external/1', [
      'content://media/external/1',
      `${tree}/document/abc%2Fp2.jpg`,
    ]);
    expect(isFolderInUse(tree, base, [r])).toBe(true);
  });
  it('non confonde cartelle con prefisso simile', () => {
    expect(isFolderInUse(tree, base, [recent(`${tree}def/document/x`)])).toBe(
      false,
    );
    expect(isFolderInUse(tree, base, [recent(`${other}/document/x`)])).toBe(
      false,
    );
  });
});

describe('isFileInUse', () => {
  it('true solo se il file è negli ultimi file', () => {
    const uri = 'content://downloads/document/42';
    expect(isFileInUse(uri, [recent(uri)])).toBe(true);
    expect(isFileInUse(uri, [recent('content://downloads/document/43')])).toBe(
      false,
    );
  });
});
