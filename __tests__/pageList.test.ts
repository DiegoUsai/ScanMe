import {
  fromPdf,
  fromScans,
  insertAt,
  removeAt,
  replaceAt,
  move,
  isModified,
  toComposeSpec,
} from '../src/pdf/pageList';

const pdf = () => fromPdf(['/t/0.jpg', '/t/1.jpg', '/t/2.jpg']);
const label = (p: ReturnType<typeof pdf>) =>
  toComposeSpec(p).map(s => (s.type === 'pdf' ? `p${s.index}` : s.path));

describe('pageList', () => {
  it('starts with the original pages, unmodified', () => {
    const pages = pdf();
    expect(label(pages)).toEqual(['p0', 'p1', 'p2']);
    expect(isModified(pages, 3)).toBe(false);
  });

  it('inserts scans at a chosen position', () => {
    const pages = insertAt(
      pdf(),
      1,
      fromScans(['file:///a.jpg', 'file:///b.jpg']),
    );
    expect(label(pages)).toEqual([
      'p0',
      'file:///a.jpg',
      'file:///b.jpg',
      'p1',
      'p2',
    ]);
    expect(isModified(pages, 3)).toBe(true);
  });

  it('appends when inserting past the end', () => {
    expect(label(insertAt(pdf(), 99, fromScans(['file:///a.jpg'])))).toEqual([
      'p0',
      'p1',
      'p2',
      'file:///a.jpg',
    ]);
  });

  it('removes and replaces a page', () => {
    expect(label(removeAt(pdf(), 0))).toEqual(['p1', 'p2']);
    expect(label(replaceAt(pdf(), 1, fromScans(['file:///n.jpg'])))).toEqual([
      'p0',
      'file:///n.jpg',
      'p2',
    ]);
  });

  it('moves a page and detects reordering', () => {
    const pages = move(pdf(), 0, 1);
    expect(label(pages)).toEqual(['p1', 'p0', 'p2']);
    expect(isModified(pages, 3)).toBe(true);
    expect(label(move(pdf(), 0, -1))).toEqual(['p0', 'p1', 'p2']);
  });
});
