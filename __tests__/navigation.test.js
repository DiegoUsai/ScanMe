const fs = require('fs');
const path = require('path');

/**
 * Ogni schermata dichiarata in RootStackParamList deve essere registrata nel
 * navigator: altrimenti navigate() fallisce solo a runtime, sul telefono.
 */
describe('navigation', () => {
  it('registers every screen of RootStackParamList', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'App.tsx'),
      'utf8',
    );
    const typeBlock = source.match(
      /export type RootStackParamList = \{([\s\S]*?)\n\};/,
    );
    expect(typeBlock).not.toBeNull();
    const declared = [...typeBlock[1].matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
    const registered = [
      ...source.matchAll(/<Stack\.Screen\s+name="(\w+)"/g),
    ].map(m => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect(registered.sort()).toEqual(declared.sort());
  });
});
