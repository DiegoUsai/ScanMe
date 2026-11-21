jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {DocumentDir: '/docs'}},
}));

import {parseSettings, DEFAULT_SETTINGS} from '../src/settings/settings';

describe('parseSettings', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a valid destination and format', () => {
    const s = parseSettings({
      defaultFormat: 'jpg',
      destination: {
        uri: 'content://com.google.android.apps.docs.storage/tree/abc',
        name: 'Scansioni',
        provider: 'Drive',
      },
    });
    expect(s.defaultFormat).toBe('jpg');
    expect(s.destination?.name).toBe('Scansioni');
    expect(s.destination?.provider).toBe('Drive');
  });

  it('drops an unknown format', () => {
    expect(parseSettings({defaultFormat: 'tiff'}).defaultFormat).toBe('pdf');
  });

  it('rejects a destination that is not a content:// URI', () => {
    expect(
      parseSettings({destination: {uri: 'file:///sdcard', name: 'x'}})
        .destination,
    ).toBeUndefined();
  });
});
