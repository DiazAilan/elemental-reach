import {
  PowerCard,
  formatRange,
  rangeNumericValue,
  type CardProperty,
} from '../models/power-card';
import {
  cardHasAllElements,
  compareElementSets,
  resolveElementAliasPack,
} from './element-aliases';
import type { ComparisonType } from './lexer';
import type { Filter, NumFilter, PropFilter } from './parser';

export function matchesFilter(card: PowerCard, filter: Filter): boolean {
  switch (filter.kind) {
    case 'text': {
      const aliases = resolveElementAliasPack(filter.text);
      if (aliases) {
        return cardHasAllElements(card.elements, aliases);
      }
      return card.searchString.includes(filter.text.toLowerCase());
    }
    case 'regex':
      try {
        return card.searchString.search(filter.regex === '' ? /(?:)/ : new RegExp(filter.regex)) !== -1;
      } catch {
        return false;
      }
    case 'not':
      return !matchesFilter(card, filter.filter);
    case 'and':
      return matchesFilter(card, filter.a) && matchesFilter(card, filter.b);
    case 'or':
      return matchesFilter(card, filter.a) || matchesFilter(card, filter.b);
    case 'propfilter':
      return matchesPropFilter(card, filter);
    case 'elementset':
      return compareElementSets(card.elements, filter.elements, filter.op);
    default:
      return assertNever(filter);
  }
}

export function filterCards(cards: PowerCard[], filter: Filter | null): PowerCard[] {
  if (filter == null) {
    return cards;
  }
  return cards.filter((card) => matchesFilter(card, filter));
}

function matchesPropFilter(card: PowerCard, filter: PropFilter): boolean {
  const property = filter.property as CardProperty;
  const valueFilter = filter.filter;

  if (valueFilter.kind === 'numfilter') {
    const numeric = getNumericProperty(card, property);
    if (numeric == null) {
      return false;
    }
    return compareNumber(numeric, valueFilter);
  }

  if (valueFilter.kind === 'text' && property === 'elements') {
    const aliases = resolveElementAliasPack(valueFilter.text);
    if (aliases) {
      return cardHasAllElements(card.elements, aliases);
    }
  }

  if (valueFilter.kind === 'text' && property === 'tags') {
    return card.tags.some((t) => t.toLowerCase().includes(valueFilter.text.toLowerCase()));
  }

  const text = getTextProperty(card, property);
  if (text == null) {
    return false;
  }
  const normalized = (text === 'Any' ? 'Any' : text).toString().replace(/&/g, 'and').toLowerCase();

  if (valueFilter.kind === 'text') {
    return normalized.includes(valueFilter.text.toLowerCase());
  }

  try {
    return normalized.search(valueFilter.regex === '' ? /(?:)/ : new RegExp(valueFilter.regex)) !== -1;
  } catch {
    return false;
  }
}

function getNumericProperty(card: PowerCard, property: string): number | null {
  switch (property) {
    case 'cost':
      return card.cost;
    case 'range':
      return rangeNumericValue(card.range);
    default:
      return null;
  }
}

function getTextProperty(card: PowerCard, property: string): string | null {
  switch (property) {
    case 'set':
      return card.set;
    case 'type':
      return card.type;
    case 'name':
      return card.name;
    case 'cost':
      return card.cost == null ? null : String(card.cost);
    case 'speed':
      return card.speed;
    case 'range':
      return card.range ? formatRange(card.range) : null;
    case 'target':
      return card.target;
    case 'elements':
      return card.elements.join(',');
    case 'artist':
      return card.artist;
    case 'description':
      return card.description;
    case 'kind':
      return card.kind;
    case 'tags':
      return card.tags.join(',');
    case 'spirit':
      return card.spirit;
    case 'aspect':
      return card.aspect;
    default:
      return null;
  }
}

function compareNumber(value: number, filter: NumFilter): boolean {
  return compare(value, filter.typ, filter.number);
}

function compare(value: number, typ: ComparisonType, other: number): boolean {
  switch (typ) {
    case '<':
      return value < other;
    case '<=':
      return value <= other;
    case '==':
      return value === other;
    case '>=':
      return value >= other;
    case '>':
      return value > other;
    default:
      return assertNever(typ);
  }
}

function assertNever(x: never): never {
  throw new Error('Unexpected Object: ' + JSON.stringify(x));
}
