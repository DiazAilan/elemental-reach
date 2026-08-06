import type { Element } from '../models/power-card';

/**
 * Single-letter element shortcuts.
 * Animal uses N so A can mean Air.
 */
export const ELEMENT_LETTER_ALIASES: Readonly<Record<string, Element>> = {
  s: 'Sun',
  m: 'Moon',
  f: 'Fire',
  a: 'Air',
  w: 'Water',
  e: 'Earth',
  p: 'Plant',
  n: 'Animal',
};

const ALIAS_CHAR_PATTERN = /^[smfawepn]+$/i;

/**
 * If `token` is only element letter aliases (e.g. `p`, `ps`, `fen`),
 * return the corresponding elements (deduped). Otherwise null.
 * Full names like `plant` / `sun` intentionally do not match (invalid letters).
 */
export function resolveElementAliasPack(token: string): Element[] | null {
  const lower = token.toLowerCase();
  if (!lower || !ALIAS_CHAR_PATTERN.test(lower)) {
    return null;
  }
  const resolved = [...lower].map((ch) => ELEMENT_LETTER_ALIASES[ch]!);
  return [...new Set(resolved)];
}

export function cardHasAllElements(
  cardElements: readonly string[],
  required: readonly Element[],
): boolean {
  const lower = new Set(cardElements.map((el) => el.toLowerCase()));
  return required.every((el) => lower.has(el.toLowerCase()));
}

export function compareElementSets(
  cardElements: readonly string[],
  target: readonly Element[],
  op: '<' | '<=' | '==' | '>=' | '>',
): boolean {
  const have = new Set(cardElements.map((el) => el.toLowerCase()));
  const want = new Set(target.map((el) => el.toLowerCase()));
  const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
  const cardSubsetOfTarget = isSubset(have, want);
  const targetSubsetOfCard = isSubset(want, have);
  const equal = cardSubsetOfTarget && targetSubsetOfCard;

  switch (op) {
    case '==':
      return equal;
    case '>':
      return targetSubsetOfCard && have.size > want.size;
    case '>=':
      return targetSubsetOfCard;
    case '<':
      return cardSubsetOfTarget && have.size < want.size;
    case '<=':
      return cardSubsetOfTarget;
    default:
      return false;
  }
}
