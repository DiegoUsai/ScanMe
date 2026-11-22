import {fitChips, withSelectedVisible} from '../src/utils/chipRows';

describe('fitChips', () => {
  it('mostra tutte le etichette se stanno in due righe', () => {
    // Righe da 300 con gap 8: [100, 100] e [100, 100].
    expect(fitChips([100, 100, 100, 100], 300, 8, 80)).toBe(4);
  });

  it('lascia posto ad "Altri" sulla seconda riga', () => {
    // Riga 1: 100 + 8 + 100. Riga 2: 100 + 8 + 100 + 8 + "Altri" 80 = 296.
    expect(fitChips([100, 100, 100, 100, 100, 100], 300, 8, 80)).toBe(4);
  });

  it('toglie un\'etichetta se "Altri" non ci sta', () => {
    // Riga 2: 140 + 8 + 140 = 288, ma con "Altri" servirebbe 376.
    expect(fitChips([140, 140, 140, 140, 140], 300, 8, 80)).toBe(3);
  });

  it('con una sola riga disponibile', () => {
    expect(fitChips([100, 100, 100], 250, 8, 60, 1)).toBe(1);
  });

  it('nessuna etichetta', () => {
    expect(fitChips([], 300, 8, 80)).toBe(0);
  });
});

describe('withSelectedVisible', () => {
  it('lascia l’ordine se la selezionata è già visibile', () => {
    expect(withSelectedVisible(['T', 'a', 'b', 'c'], 1, 2, 1)).toEqual([
      'T',
      'a',
      'b',
      'c',
    ]);
  });
  it('porta in testa la selezionata nascosta, dopo le fisse', () => {
    expect(withSelectedVisible(['T', 'a', 'b', 'c'], 3, 2, 1)).toEqual([
      'T',
      'c',
      'a',
      'b',
    ]);
  });
});
