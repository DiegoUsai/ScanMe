jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {CacheDir: '/cache', DocumentDir: '/docs'}},
}));

import {
  createProject,
  projectFolderName,
  resolveDestination,
} from '../src/settings/projects';
import {parseSettings} from '../src/settings/settings';

const drive = {uri: 'content://drive/tree/1', name: 'Scansioni'};
const phone = {uri: 'content://ext/tree/2', name: 'Documenti'};

describe('projects', () => {
  it('creates a project with a trimmed name', () => {
    expect(createProject('  Documenti personali ', [])?.name).toBe(
      'Documenti personali',
    );
  });

  it('refuses empty or duplicate names', () => {
    const existing = [{id: '1', name: 'Casa'}];
    expect(createProject('   ', existing)).toBeUndefined();
    expect(createProject('casa', existing)).toBeUndefined();
  });

  it('uses a safe folder name', () => {
    expect(projectFolderName({id: '1', name: 'Fatture 2026/27'})).toBe(
      'Fatture 2026_27',
    );
  });

  it('prefers the project destination over the default', () => {
    expect(
      resolveDestination({id: '1', name: 'A', destination: drive}, phone),
    ).toBe(drive);
    expect(resolveDestination({id: '1', name: 'A'}, phone)).toBe(phone);
    expect(resolveDestination(undefined, undefined)).toBeUndefined();
  });

  it('parses saved projects and drops invalid ones', () => {
    const s = parseSettings({
      projects: [{id: '1', name: 'Casa', destination: drive}, {id: '2'}, null],
    });
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].destination?.name).toBe('Scansioni');
  });
});
