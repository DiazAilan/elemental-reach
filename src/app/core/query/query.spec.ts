import { describe, expect, it } from 'vitest';
import {
  PowerCard,
  buildSearchString,
  slugifyName,
} from '../models/power-card';
import { filterCards, matchesFilter } from './evaluator';
import { lex } from './lexer';
import { parseFilters } from './parser';
import { QueryService } from './query.service';

function card(partial: Partial<PowerCard> & Pick<PowerCard, 'name'>): PowerCard {
  const base = {
    set: partial.set ?? 'Basegame',
    type: partial.type ?? 'Minor Power',
    name: partial.name,
    cost: partial.cost ?? 1,
    speed: partial.speed ?? ('Slow' as const),
    range: partial.range ?? { from: 'Presence' as const, range: 1 },
    target: partial.target ?? 'Any',
    elements: partial.elements ?? (['Plant', 'Earth'] as PowerCard['elements']),
    artist: partial.artist ?? 'Test Artist',
    description: partial.description ?? 'Add 1 Presence.',
  };
  return {
    ...base,
    id: slugifyName(base.name),
    searchString: buildSearchString(base),
  };
}

const sample: PowerCard[] = [
  card({
    name: 'Gift of Proliferation',
    type: 'Unique Power: A Spread of Rampant Green',
    cost: 1,
    speed: 'Fast',
    range: null,
    target: 'Another Spirit',
    elements: ['Moon', 'Plant'],
    description: 'Target Spirit may Add 1 Presence.',
  }),
  card({
    name: 'Savage Mawbeasts',
    type: 'Minor Power',
    cost: 0,
    elements: ['Fire', 'Animal'],
    description: '1 Fear. Destroy 1 Explorer.',
    range: { from: 'SacredSite', range: 1 },
  }),
  card({
    name: 'Tsunami',
    type: 'Major Power',
    cost: 6,
    speed: 'Slow',
    elements: ['Water'],
    description: '6 Damage. Destroy all Dahan.',
    range: { from: 'Presence', range: 2 },
    target: 'Coastal',
  }),
  card({
    name: 'Call to Tend',
    type: 'Minor Power',
    cost: 1,
    elements: ['Water', 'Plant', 'Earth'],
    description: 'Gather up to 2 Dahan. If there are now at least 2 Dahan, Add 1 Dahan.',
  }),
];

describe('lexer', () => {
  it('tokenizes field filters and phrases', () => {
    const tokens = lex('elements:plant cost:<5 "dahan and"');
    expect(tokens.map((t) => t.kind)).toEqual([
      'word',
      'colon',
      'word',
      'whitespace',
      'word',
      'colon',
      'comparison',
      'int',
      'whitespace',
      'dqstring',
    ]);
  });
});

describe('parser + evaluator', () => {
  it('matches free-text words', () => {
    const ast = parseFilters('dahan');
    expect(ast).not.toBeNull();
    const hits = filterCards(sample, ast);
    expect(hits.map((c) => c.name)).toContain('Call to Tend');
    expect(hits.map((c) => c.name)).toContain('Tsunami');
  });

  it('matches quoted phrases and type words', () => {
    const ast = parseFilters('"add 1 presence"');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Gift of Proliferation']);
  });

  it('matches element filters (AND via whitespace)', () => {
    const ast = parseFilters('elements:plant elements:earth');
    const hits = filterCards(sample, ast);
    expect(hits.map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('matches numeric cost comparisons', () => {
    const ast = parseFilters('cost:<5');
    const hits = filterCards(sample, ast);
    expect(hits.every((c) => c.cost < 5)).toBe(true);
    expect(hits.map((c) => c.name)).not.toContain('Tsunami');
  });

  it('matches range:sacred', () => {
    const ast = parseFilters('range:sacred');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Savage Mawbeasts']);
  });

  it('supports target:!any', () => {
    const ast = parseFilters('target:!any');
    const hits = filterCards(sample, ast);
    expect(hits.every((c) => !c.target.toLowerCase().includes('any'))).toBe(true);
    expect(hits.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Gift of Proliferation', 'Tsunami']),
    );
  });

  it('supports OR with pipe', () => {
    const ast = parseFilters('name:tsunami|savage');
    const hits = filterCards(sample, ast);
    expect(hits.map((c) => c.name).sort()).toEqual(['Savage Mawbeasts', 'Tsunami']);
  });

  it('supports OR across filters with spaced pipe', () => {
    const ast = parseFilters('name:tsunami | name:gift');
    const hits = filterCards(sample, ast);
    expect(hits.map((c) => c.name).sort()).toEqual(['Gift of Proliferation', 'Tsunami']);
  });

  it('supports major keyword via free text', () => {
    const ast = parseFilters('major');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Tsunami']);
  });

  it('returns all cards for empty parse', () => {
    expect(filterCards(sample, null)).toHaveLength(sample.length);
  });
});

describe('QueryService', () => {
  const service = new QueryService();

  it('searches case-insensitively like SICK', () => {
    const hits = service.search(sample, 'Elements:Plant Elements:Earth Cost:<3');
    expect(hits.map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('sorts by cost', () => {
    const sorted = service.sort(sample, 'cost', true);
    expect(sorted.map((c) => c.cost)).toEqual([0, 1, 1, 6]);
  });
});

describe('matchesFilter edge', () => {
  it('handles invalid regex safely', () => {
    const ast = parseFilters('/(/');
    expect(ast?.kind).toBe('regex');
    expect(matchesFilter(sample[0]!, ast!)).toBe(false);
  });
});
