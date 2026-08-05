#!/usr/bin/env node
/**
 * Imports power cards from SICK (oberien/spirit-island-card-katalog) into public/data/powers.json.
 *
 * Source: https://github.com/oberien/spirit-island-card-katalog (MIT/Apache-2.0)
 * Card text is owned by Greater Than Games, LLC.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/powers.json');
const CACHE_DIR = join(ROOT, 'scripts/.sick-cache');
const DB_URL =
  'https://raw.githubusercontent.com/oberien/spirit-island-card-katalog/master/src/db.ts';
const TYPES_URL =
  'https://raw.githubusercontent.com/oberien/spirit-island-card-katalog/master/src/types.ts';

async function fetchText(url, cacheName) {
  const cachePath = join(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const text = await res.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, text);
  return text;
}

function extractEnum(source, enumName) {
  const re = new RegExp(`export enum ${enumName} \\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find enum ${enumName}`);
  }
  const map = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^\s*(\w+)\s*=\s*"([^"]*)"/);
    if (m) {
      map[m[1]] = m[2];
    }
  }
  return map;
}

function slugifyName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatRange(range) {
  if (!range) {
    return null;
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

function resolveTarget(target, LandAny) {
  if (target == null) {
    return '';
  }
  if (target === LandAny) {
    return 'Any';
  }
  if (Array.isArray(target)) {
    if (
      target.length === LandAny.length &&
      target.every((v, i) => v === LandAny[i])
    ) {
      return 'Any';
    }
    return target.join(', ');
  }
  return String(target);
}

async function main() {
  console.log('Fetching SICK sources…');
  const [typesSrc, dbSrc] = await Promise.all([
    fetchText(TYPES_URL, 'types.ts'),
    fetchText(DB_URL, 'db.ts'),
  ]);

  const ProductSet = extractEnum(typesSrc, 'ProductSet');
  const Speed = extractEnum(typesSrc, 'Speed');
  const Elements = extractEnum(typesSrc, 'Elements');
  const Source = extractEnum(typesSrc, 'Source');
  const Land = extractEnum(typesSrc, 'Land');
  const TargetSpirit = extractEnum(typesSrc, 'TargetSpirit');
  const TargetProperty = extractEnum(typesSrc, 'TargetProperty');
  const PowerDeckType = extractEnum(typesSrc, 'PowerDeckType');
  const Unique = extractEnum(typesSrc, 'Unique');

  const LandAny = [
    Land.Ocean,
    Land.Jungle,
    Land.Wetland,
    Land.Mountain,
    Land.Sands,
    Land.Coastal,
  ];

  class Ranges {
    constructor(from, range, land, landProperty) {
      this.from = from;
      this.range = range;
      this.land = land;
      this.landProperty = landProperty;
    }
  }

  const cards = [];

  function PowerCard(set, type, name, cost, speed, range, target, elements, artist, description) {
    const rangeObj = range
      ? {
          from: range.from,
          range: range.range,
          ...(range.land ? { land: range.land } : {}),
          ...(range.landProperty ? { landProperty: range.landProperty } : {}),
        }
      : null;

    cards.push({
      set,
      type,
      name,
      cost,
      speed,
      range: rangeObj,
      target: resolveTarget(target, LandAny),
      elements: [...elements],
      artist,
      description,
    });
  }

  // Extract only PowerCard constructor calls from the CARDS array.
  const start = dbSrc.indexOf('export const CARDS');
  if (start < 0) {
    throw new Error('CARDS array not found in db.ts');
  }
  const body = dbSrc.slice(start);

  const calls = [];
  const marker = 'new PowerCard(';
  let idx = 0;
  while ((idx = body.indexOf(marker, idx)) !== -1) {
    let depth = 0;
    let i = idx + 'new '.length; // start at PowerCard(
    // find opening paren of PowerCard(
    i = body.indexOf('(', idx);
    const startParen = i;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          calls.push(body.slice(startParen + 1, i));
          idx = i + 1;
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error('Unbalanced PowerCard( at ' + idx);
    }
  }

  console.log(`Found ${calls.length} PowerCard constructors`);

  const sandbox = {
    ProductSet,
    Speed,
    Elements,
    Source,
    Land,
    LandAny,
    TargetSpirit,
    TargetProperty,
    PowerDeckType,
    Unique,
    Ranges,
    PowerCard,
    undefined,
  };

  const argNames = Object.keys(sandbox);
  const argValues = Object.values(sandbox);

  for (const args of calls) {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, `PowerCard(${args});`);
    fn(...argValues);
  }

  // Deduplicate by name (keep first)
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const id = slugifyName(card.name);
    if (seen.has(id)) {
      console.warn(`Duplicate id skipped: ${id}`);
      continue;
    }
    seen.add(id);
    unique.push(card);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(unique, null, 2) + '\n');
  console.log(`Wrote ${unique.length} powers → ${OUT}`);
  console.log('Sample:', unique[0]?.name, formatRange(unique[0]?.range));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
