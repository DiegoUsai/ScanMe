jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {DocumentDir: '/docs'}},
}));

import {parseRecents, pushRecent} from '../src/recents/recents';
import type {RecentFile} from '../src/recents/recents';

const file = (id: string): RecentFile => ({
  id,
  name: `Scansione ${id}`,
  uri: `content://x/${id}`,
  mimeType: 'application/pdf',
  pageCount: 1,
  savedAt: 0,
  destination: 'Drive › Scansioni',
});

describe('recents', () => {
  it('puts the newest file first', () => {
    const {list} = pushRecent([file('a'), file('b')], file('c'));
    expect(list.map(r => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops the oldest files beyond the limit', () => {
    const {list, dropped} = pushRecent([file('a'), file('b')], file('c'), 2);
    expect(list.map(r => r.id)).toEqual(['c', 'a']);
    expect(dropped.map(r => r.id)).toEqual(['b']);
  });

  it('ignores corrupt entries', () => {
    expect(parseRecents('x')).toEqual([]);
    expect(parseRecents([file('a'), {id: 'b'}, null])).toHaveLength(1);
  });
});
