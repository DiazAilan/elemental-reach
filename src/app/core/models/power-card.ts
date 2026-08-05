export type Speed = 'Fast' | 'Slow';

export type Element =
  | 'Sun'
  | 'Moon'
  | 'Fire'
  | 'Air'
  | 'Water'
  | 'Earth'
  | 'Plant'
  | 'Animal';

export type Source = 'Presence' | 'SacredSite';

export interface PowerRange {
  from: Source;
  /** Single range or dual-range values (e.g. 1 & 2). */
  range: number | number[];
  land?: string[];
  landProperty?: string;
}

export interface PowerCard {
  /** Stable id derived from the card name. */
  id: string;
  set: string;
  /** e.g. "Minor Power", "Major Power", or "Unique Power: Lightning's Swift Strike" */
  type: string;
  name: string;
  cost: number;
  speed: Speed;
  range: PowerRange | null;
  /** Display string; "Any" for any land. */
  target: string;
  elements: Element[];
  artist: string;
  description: string;
  /** Lowercased searchable blob, precomputed at load. */
  searchString: string;
}

/** Card properties that may appear in `field:value` filters (SICK-compatible). */
export const CARD_PROPERTIES = [
  'set',
  'type',
  'name',
  'cost',
  'speed',
  'range',
  'target',
  'elements',
  'artist',
  'description',
] as const;

export type CardProperty = (typeof CARD_PROPERTIES)[number];

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatRange(range: PowerRange | null): string {
  if (!range) {
    return '—';
  }
  const rangeValue = Array.isArray(range.range) ? range.range.join(' & ') : String(range.range);
  let label = `${range.from}: ${rangeValue}`;
  if (range.land?.length) {
    label = `${range.from} on ${range.land.join(', ')}: ${rangeValue}`;
  }
  if (range.landProperty) {
    label = `${range.from} with ${range.landProperty}: ${rangeValue}`;
  }
  return label;
}

export function rangeNumericValue(range: PowerRange | null): number | null {
  if (!range) {
    return null;
  }
  return Array.isArray(range.range) ? Math.max(...range.range) : range.range;
}

export function buildSearchString(card: Omit<PowerCard, 'searchString' | 'id'>): string {
  const parts: string[] = [
    card.set.replace(/&/g, 'and'),
    card.type,
    String(card.cost),
    card.name,
    card.speed,
  ];

  if (card.range) {
    parts.push(formatRange(card.range).replace(/&/g, 'and'));
  }

  parts.push(card.target === 'Any' ? 'Any' : card.target);
  parts.push(card.elements.join(','));
  parts.push(card.description);
  parts.push(card.artist);

  return parts.join(' ').toLowerCase();
}
