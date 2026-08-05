import { Injectable } from '@angular/core';
import { PowerCard, formatRange, rangeNumericValue } from '../models/power-card';
import { filterCards } from './evaluator';
import { parseFilters } from './parser';

export type SortField = 'type' | 'name' | 'cost' | 'speed' | 'range' | 'target' | 'artist';

@Injectable({ providedIn: 'root' })
export class QueryService {
  search(cards: PowerCard[], query: string): PowerCard[] {
    const normalized = query.toLowerCase().replace(/&/g, 'and');
    if (!normalized.trim()) {
      return cards;
    }
    const ast = parseFilters(normalized);
    return filterCards(cards, ast);
  }

  sort(cards: PowerCard[], field: SortField, ascending: boolean): PowerCard[] {
    const sorted = [...cards].sort((a, b) => compareCards(a, b, field));
    return ascending ? sorted : sorted.reverse();
  }
}

function compareCards(a: PowerCard, b: PowerCard, field: SortField): number {
  switch (field) {
    case 'cost':
      return a.cost - b.cost || a.name.localeCompare(b.name);
    case 'range': {
      const ar = rangeNumericValue(a.range);
      const br = rangeNumericValue(b.range);
      if (ar == null && br == null) {
        return a.name.localeCompare(b.name);
      }
      if (ar == null) {
        return 1;
      }
      if (br == null) {
        return -1;
      }
      return ar - br || a.name.localeCompare(b.name);
    }
    case 'speed':
      return a.speed.localeCompare(b.speed) || a.name.localeCompare(b.name);
    case 'type':
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    case 'target':
      return a.target.localeCompare(b.target) || a.name.localeCompare(b.name);
    case 'artist':
      return a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name);
    case 'name':
    default:
      return a.name.localeCompare(b.name);
  }
}

export function cardRangeLabel(card: PowerCard): string {
  return formatRange(card.range);
}
