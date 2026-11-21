/**
 * Calcola quali numeri di pagina mostrare nell'indicatore sotto l'anteprima.
 *
 * Con poche pagine le mostra tutte. Con molte mostra una finestra di `size`
 * pagine centrata su quella corrente, che si ferma ai bordi: con 9 pagine e
 * finestra 5, sulla pagina 1 si vede 1-2-3-4-5, sulla 4 si vede 2-3-4-5-6,
 * sulla 9 si vede 5-6-7-8-9.
 *
 * @param current indice della pagina corrente (0-based)
 * @param total numero totale di pagine
 * @param size ampiezza della finestra (dispari, così la corrente sta al centro)
 * @returns gli indici (0-based) da mostrare, in ordine
 */
export function visiblePageWindow(
  current: number,
  total: number,
  size: number = 5,
): number[] {
  if (total <= 0) {
    return [];
  }
  const count = Math.min(size, total);
  const half = Math.floor(count / 2);
  const start = Math.min(Math.max(current - half, 0), total - count);
  return Array.from({length: count}, (_, i) => start + i);
}
