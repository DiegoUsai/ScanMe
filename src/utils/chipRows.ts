/**
 * Quante etichette (chip) entrano in `maxRows` righe, lasciando posto in
 * fondo all'etichetta "⋯ Altri" quando non entrano tutte.
 *
 * Riproduce l'andata a capo di un contenitore flex con `flexWrap: 'wrap'` e
 * `gap`: ogni etichetta va sulla riga corrente se ci sta, altrimenti sulla
 * successiva.
 */
export function fitChips(
  widths: number[],
  rowWidth: number,
  gap: number,
  moreWidth: number,
  maxRows = 2,
): number {
  const countFitting = (reserveLast: number): number => {
    let row = 1;
    let used = 0;
    for (let i = 0; i < widths.length; i++) {
      const isLastAllowedRow = row === maxRows;
      const need = (used > 0 ? gap : 0) + widths[i];
      // Sull'ultima riga bisogna lasciare spazio anche per "Altri".
      const reserve = isLastAllowedRow ? reserveLast : 0;
      if (used + need + reserve <= rowWidth || used === 0) {
        if (used === 0 && widths[i] + reserve > rowWidth && isLastAllowedRow) {
          return i;
        }
        used += need;
        continue;
      }
      if (row === maxRows) {
        return i;
      }
      row++;
      used = 0;
      i--;
    }
    return widths.length;
  };
  // Prima si prova senza "Altri": se ci stanno tutte non serve.
  if (countFitting(0) === widths.length) {
    return widths.length;
  }
  return countFitting(gap + moreWidth);
}

/**
 * Ordine delle etichette da mostrare: se quella selezionata finirebbe nel
 * menu "Altri", la si porta in testa (dopo le fisse) così resta visibile.
 */
export function withSelectedVisible<T>(
  items: T[],
  selectedIndex: number,
  visibleCount: number,
  fixed = 0,
): T[] {
  if (selectedIndex < visibleCount || selectedIndex >= items.length) {
    return items;
  }
  const copy = items.slice();
  const [selected] = copy.splice(selectedIndex, 1);
  copy.splice(fixed, 0, selected);
  return copy;
}
