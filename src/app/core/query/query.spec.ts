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

  it('matches element letter aliases as free text', () => {
    const ast = parseFilters('p e');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('matches packed element letters (AND)', () => {
    const ast = parseFilters('fn');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Savage Mawbeasts']);
  });

  it('maps N to Animal and A to Air', () => {
    const withAir = card({
      name: 'Lightning Test',
      elements: ['Fire', 'Air'],
      description: 'Zap.',
    });
    const cards = [...sample, withAir];
    expect(filterCards(cards, parseFilters('a')).map((c) => c.name)).toEqual(['Lightning Test']);
    expect(filterCards(cards, parseFilters('n')).map((c) => c.name)).toEqual(['Savage Mawbeasts']);
  });

  it('supports element letters on elements: field', () => {
    const ast = parseFilters('elements:pe');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('still matches full element names', () => {
    const ast = parseFilters('elements:plant elements:earth');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('does not treat words like major as letter packs', () => {
    const ast = parseFilters('major');
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Tsunami']);
  });

  it('returns all cards for empty parse', () => {
    expect(filterCards(sample, null)).toHaveLength(sample.length);
  });

  it('maps e: to elements:', () => {
    const ast = parseFilters('e:pe');
    expect(ast?.kind).toBe('propfilter');
    if (ast?.kind === 'propfilter') {
      expect(ast.property).toBe('elements');
    }
    expect(filterCards(sample, ast).map((c) => c.name)).toEqual(['Call to Tend']);
  });

  it('e>a requires Air plus another element', () => {
    const withAirOnly = card({ name: 'Air Only', elements: ['Air'], description: 'Breezy.' });
    const withAirMore = card({
      name: 'Air Fire',
      elements: ['Air', 'Fire'],
      description: 'Hot wind.',
    });
    const cards = [...sample, withAirOnly, withAirMore];
    expect(filterCards(cards, parseFilters('e>a')).map((c) => c.name)).toEqual(['Air Fire']);
  });

  it('e<=as is subset of Air/Sun', () => {
    const air = card({ name: 'Just Air', elements: ['Air'], description: 'x' });
    const sun = card({ name: 'Just Sun', elements: ['Sun'], description: 'x' });
    const both = card({ name: 'Air Sun', elements: ['Air', 'Sun'], description: 'x' });
    const extra = card({ name: 'Air Plant', elements: ['Air', 'Plant'], description: 'x' });
    const cards = [air, sun, both, extra];
    expect(filterCards(cards, parseFilters('e<=as')).map((c) => c.name).sort()).toEqual([
      'Air Sun',
      'Just Air',
      'Just Sun',
    ]);
  });

  it('e=asm is exact set equality', () => {
    const exact = card({
      name: 'Exact ASM',
      elements: ['Air', 'Sun', 'Moon'],
      description: 'x',
    });
    const more = card({
      name: 'ASM Fire',
      elements: ['Air', 'Sun', 'Moon', 'Fire'],
      description: 'x',
    });
    const cards = [...sample, exact, more];
    expect(filterCards(cards, parseFilters('e=asm')).map((c) => c.name)).toEqual(['Exact ASM']);
  });

  it('e>=ps is superset (at least Plant and Sun)', () => {
    const exactly = card({ name: 'PS', elements: ['Plant', 'Sun'], description: 'x' });
    const more = card({ name: 'PSE', elements: ['Plant', 'Sun', 'Earth'], description: 'x' });
    const missing = card({ name: 'P only', elements: ['Plant'], description: 'x' });
    const cards = [exactly, more, missing];
    expect(filterCards(cards, parseFilters('e>=ps')).map((c) => c.name).sort()).toEqual([
      'PS',
      'PSE',
    ]);
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
