import {visiblePageWindow} from '../src/utils/pageWindow';

/** Converte gli indici 0-based nei numeri di pagina mostrati all'utente. */
const labels = (current: number, total: number) =>
  visiblePageWindow(current, total).map(i => i + 1);

describe('visiblePageWindow', () => {
  it('shows every page when there are five or fewer', () => {
    expect(labels(0, 1)).toEqual([1]);
    expect(labels(2, 3)).toEqual([1, 2, 3]);
    expect(labels(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts at 1-5 on the first pages of a 9-page document', () => {
    expect(labels(0, 9)).toEqual([1, 2, 3, 4, 5]);
    expect(labels(2, 9)).toEqual([1, 2, 3, 4, 5]);
  });

  it('centres the current page (page 4 of 9 shows 2-6)', () => {
    expect(labels(3, 9)).toEqual([2, 3, 4, 5, 6]);
    expect(labels(5, 9)).toEqual([4, 5, 6, 7, 8]);
  });

  it('stops at the end (page 9 of 9 shows 5-9)', () => {
    expect(labels(8, 9)).toEqual([5, 6, 7, 8, 9]);
    expect(labels(7, 9)).toEqual([5, 6, 7, 8, 9]);
  });

  it('handles an empty document', () => {
    expect(visiblePageWindow(0, 0)).toEqual([]);
  });
});
