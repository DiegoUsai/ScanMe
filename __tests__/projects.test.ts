jest.mock('react-native-blob-util', () => ({
  fs: {dirs: {CacheDir: '/cache', DocumentDir: '/docs'}},
}));

import {
  createProject,
  projectFolderName,
  projectNameError,
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

  it('explains why a name is refused', () => {
    const existing = [{id: '1', name: 'Casa'}];
    expect(projectNameError('  ', existing)).toBe('empty');
    expect(projectNameError(' CASA ', existing)).toBe('duplicate');
    expect(projectNameError('Ufficio', existing)).toBeUndefined();
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

describe('projectSubFolders', () => {
  const {projectSubFolders, sameLocation} = require('../src/settings/projects');
  it('una cartella scelta per il progetto non aggiunge sottocartelle', () => {
    expect(
      projectSubFolders({
        id: '1',
        name: 'Fatture',
        destination: drive,
        ownFolder: true,
      }),
    ).toEqual([]);
  });
  it('i progetti vecchi con cartella tengono la sottocartella', () => {
    expect(
      projectSubFolders({id: '1', name: 'Fatture', destination: drive}),
    ).toEqual(['Fatture']);
  });
  it('predefinita e telefono usano la sottocartella', () => {
    expect(projectSubFolders({id: '1', name: 'Casa'})).toEqual(['Casa']);
    expect(
      projectSubFolders({
        id: '1',
        name: 'Casa',
        phone: true,
        destination: drive,
        ownFolder: true,
      }),
    ).toEqual(['Casa']);
    expect(projectSubFolders(undefined)).toEqual([]);
  });
  it('riscegliere la stessa cartella cambia posizione se sparisce la sottocartella', () => {
    const legacy = {id: '1', name: 'F', destination: drive};
    expect(sameLocation(legacy, {...legacy, ownFolder: true}, phone)).toBe(
      false,
    );
    expect(sameLocation(legacy, legacy, phone)).toBe(true);
  });
  it('legge ownFolder dalle impostazioni', () => {
    const s = parseSettings({
      projects: [{id: '1', name: 'A', destination: drive, ownFolder: true}],
    });
    expect(s.projects[0].ownFolder).toBe(true);
  });
});
