jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {CacheDir: '/cache', DownloadDir: '/dl', PictureDir: '/pic'}},
}));

import {sanitizeFileName} from '../src/utils/files';

describe('sanitizeFileName', () => {
  it('keeps a normal name', () => {
    expect(sanitizeFileName('Scansione 2026-11-21 10-30')).toBe(
      'Scansione 2026-11-21 10-30',
    );
  });

  it('blocks path traversal', () => {
    const out = sanitizeFileName('../../data/evil');
    expect(out).not.toContain('/');
    expect(out.startsWith('.')).toBe(false);
  });

  it('removes reserved and control characters', () => {
    expect(sanitizeFileName('a\\b:c*d?e"f<g>h|i\u0000j')).toBe(
      'a_b_c_d_e_f_g_h_i_j',
    );
  });

  it('falls back to a default name when empty', () => {
    expect(sanitizeFileName(' .. ').length).toBeGreaterThan(0);
  });

  it('caps the length', () => {
    expect(sanitizeFileName('x'.repeat(500)).length).toBe(100);
  });
});
