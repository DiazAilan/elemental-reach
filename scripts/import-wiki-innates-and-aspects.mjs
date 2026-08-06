#!/usr/bin/env node
/**
 * Import innate powers + Aspect Unique power cards from the Spirit Island Wiki.
 * Merges into public/data/powers.json (keeps existing SICK power cards).
 *
 * Source: https://spiritislandwiki.com/ (fan wiki; game text © Greater Than Games)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/powers.json');
const CACHE = join(ROOT, 'scripts/.wiki-cache');
const API = 'https://spiritislandwiki.com/api.php';

const ELEMENT_KEYS = {
  s: 'Sun',
  m: 'Moon',
  f: 'Fire',
  a: 'Air',
  w: 'Water',
  e: 'Earth',
  p: 'Plant',
  n: 'Animal',
};

function slugifyName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('format', 'json');
  const key = [...url.searchParams.entries()].map(([k, v]) => `${k}=${v}`).join('&');
  const cachePath = join(CACHE, Buffer.from(key).toString('base64url').slice(0, 180) + '.json');
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wiki API ${res.status} for ${url}`);
  }
  const data = await res.json();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(data));
  // be nice to the wiki
  await new Promise((r) => setTimeout(r, 150));
  return data;
}

async function getWikitext(title) {
  const data = await api({
    action: 'parse',
    page: title,
    prop: 'wikitext',
  });
  return data?.parse?.wikitext?.['*'] ?? null;
}

async function listCategory(cmtitle) {
  const titles = [];
  let cont = {};
  do {
    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle,
      cmlimit: '100',
      ...cont,
    });
    for (const m of data.query.categorymembers) {
      if (!m.title.startsWith('Category:')) {
        titles.push(m.title);
      }
    }
    cont = data.continue ?? {};
  } while (cont.cmcontinue);
  return titles;
}

function cleanWikiText(s) {
  if (!s) return '';
  let t = s;
  t = t.replace(/\{\{invader\|([^}|]+)(?:\|[^}]*)?\}\}/gi, (_, x) => titleCase(x));
  t = t.replace(/\{\{element\|([^}|]+)(?:\|[^}]*)?\}\}/gi, (_, x) => titleCase(x));
  t = t.replace(/\{\{(?:fast|slow)\}\}/gi, '');
  t = t.replace(/\{\{[^}]+\}\}/g, '');
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
  t = t.replace(/'''|''/g, '');
  t = t.replace(/<br\s*\/?>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/&nbsp;/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseThresholds(body) {
  const thresholds = [];
  const re = /\{\{Threshold\|([^}]*)\}\}/gi;
  let m;
  while ((m = re.exec(body))) {
    const inner = m[1];
    const parts = inner.split('|').map((p) => p.trim()).filter(Boolean);
    const elements = {};
    let text = '';
    for (const part of parts) {
      const eq = part.match(/^([a-z])\s*=\s*(\d+)$/i);
      if (eq) {
        const el = ELEMENT_KEYS[eq[1].toLowerCase()];
        if (el) {
          elements[el] = Number(eq[2]);
        }
      } else {
        text = part;
      }
    }
    thresholds.push({
      elements,
      text: cleanWikiText(text),
    });
  }
  return thresholds;
}

function parseInnateBlocks(wikitext) {
  const blocks = [];
  let idx = 0;
  while (true) {
    const start = wikitext.indexOf('{{Innate|', idx);
    if (start < 0) {
      break;
    }
    const open = start + 2; // after {{
    let depth = 1;
    let i = open;
    while (i < wikitext.length - 1 && depth > 0) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
        depth++;
        i += 2;
        continue;
      }
      if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
        depth--;
        i += 2;
        continue;
      }
      i++;
    }
    if (depth === 0) {
      // content between {{Innate| and closing }}
      const inner = wikitext.slice(start + '{{Innate|'.length, i - 2);
      blocks.push(inner);
      idx = i;
    } else {
      break;
    }
  }
  return blocks;
}

function parseInnateArgs(body) {
  // Named args before the title (first bare |Title| line after named args)
  const turn = body.match(/\|\s*turn\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  const rangeRaw = body.match(/\|\s*range\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  const option = body.match(/\|\s*option\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  const target = body.match(/\|\s*target\s*=\s*([^\n|]+)/i)?.[1]?.trim();

  // Title is first positional after named params: line like " |THUNDERING DESTRUCTION"
  const titleMatch = body.match(/\n\s*\|\s*([A-Z][^|\n{]+)\s*\n/);
  const name = titleMatch?.[1]?.trim();

  const thresholds = parseThresholds(body);
  const description = thresholds
    .map((th) => {
      const el = Object.entries(th.elements)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      return el ? `(${el}) ${th.text}` : th.text;
    })
    .join(' / ');

  const speed = turn?.toLowerCase() === 'fast' ? 'Fast' : turn?.toLowerCase() === 'slow' ? 'Slow' : 'Fast';

  let range = null;
  if (rangeRaw && /^\d+$/.test(rangeRaw)) {
    range = {
      from: option?.toLowerCase().includes('sacred') ? 'SacredSite' : 'Presence',
      range: Number(rangeRaw),
    };
  }

  const targetLabel = cleanWikiText(
    (target || 'any')
      .replace(/anyspirit/i, 'Any Spirit')
      .replace(/anyspirit/i, 'Any Spirit')
      .replace(/^any$/i, 'Any')
      .replace(/another/i, 'Another Spirit'),
  );

  // Elements: union of threshold requirements
  const elements = [];
  for (const th of thresholds) {
    for (const el of Object.keys(th.elements)) {
      if (!elements.includes(el)) {
        elements.push(el);
      }
    }
  }

  return {
    name,
    speed,
    range,
    target: targetLabel || 'Any',
    elements,
    description: description || cleanWikiText(body),
    thresholds,
  };
}

function parseAspectArticle(wikitext) {
  // Single-line fields
  const getLine = (key) =>
    wikitext.match(new RegExp(`\\|\\s*${escapeRegExp(key)}\\s*=\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ??
    null;
  // Multi-line fields (value until next |field= or template end)
  const getBlock = (key) => {
    const m = wikitext.match(
      new RegExp(
        `\\|\\s*${escapeRegExp(key)}\\s*=\\s*([\\s\\S]*?)(?=\\n\\|\\s*[\\w ]+=|\\n\\}\\})`,
        'i',
      ),
    );
    return m?.[1]?.trim() ?? null;
  };

  const aspect = getLine('name');
  const set = cleanWikiText(getLine('set') || '');
  const spirit = cleanWikiText(getLine('spirit') || '');
  const innateName = cleanWikiText(
    getLine('rowInnate Name') ||
      getLine('rowInnateName') ||
      getLine('rowInnate Power Name') ||
      getLine('Innate Power Name') ||
      '',
  );
  const speedRaw = getLine('rowSpeed') || '';
  const rangeRaw = getLine('rowRange') || '';
  const targetRaw = getLine('rowTarget') || '';
  const thresholdsRaw = getBlock('rowInnate Thresholds') || getBlock('Innate Thresholds') || '';

  // Aspect unique power cards embedded on the page
  const uniques = [];
  const powerRe = /\{\{PowerCardArticle([\s\S]*?)\n\}\}/g;
  let pm;
  while ((pm = powerRe.exec(wikitext))) {
    const block = pm[1];
    const cardtype = block.match(/\|\s*cardtype\s*=\s*([^\n]+)/i)?.[1]?.trim() || '';
    if (!/aspect\s*unique/i.test(cardtype)) {
      continue;
    }
    uniques.push(parsePowerCardArticle(block, aspect, spirit, set));
  }

  let innate = null;
  if (innateName && thresholdsRaw) {
    const thresholds = parseAspectThresholdText(thresholdsRaw);
    const elements = [];
    for (const th of thresholds) {
      for (const el of Object.keys(th.elements)) {
        if (!elements.includes(el)) elements.push(el);
      }
    }
    const speed = /fast/i.test(speedRaw) ? 'Fast' : /slow/i.test(speedRaw) ? 'Slow' : 'Fast';
    let range = null;
    const rangeNum = rangeRaw?.match(/\d+/);
    if (rangeNum) {
      range = { from: 'Presence', range: Number(rangeNum[0]) };
    }
    innate = {
      set: set || 'Unknown',
      type: `Innate Power: ${spirit}`,
      name: innateName,
      cost: null,
      speed,
      range,
      target: cleanWikiText(targetRaw || 'Any') || 'Any',
      elements,
      artist: '',
      description: thresholds.map((th) => {
        const el = Object.entries(th.elements).map(([k, v]) => `${v} ${k}`).join(', ');
        return el ? `(${el}) ${th.text}` : th.text;
      }).join(' / '),
      thresholds,
      spirit,
      aspect,
      kind: 'innate',
      tags: ['innate', 'aspect'],
    };
  }

  return { uniques, innate };
}

function parseAspectThresholdText(raw) {
  // Format: '''2''' {{element|sun}} '''5''' {{element|fire}} — 2 Sun, 5 Fire<br/>Effect...
  // Thresholds separated by <br/><br/> and/or blank lines.
  const normalized = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n');
  let chunks = normalized.split(/<br\s*\/?>\s*<br\s*\/?>/i);
  if (chunks.length === 1) {
    chunks = normalized.split(/\n\s*\n+/);
  }
  // Fallback: split before each '''N''' threshold header (keep delimiter)
  if (chunks.length === 1) {
    chunks = normalized.split(/(?='''\d+''')/).filter(Boolean);
  }
  const thresholds = [];
  for (const chunk of chunks) {
    const cleaned = chunk.trim();
    if (!cleaned) continue;
    const elements = {};
    const elRe = /'''(\d+)'''\s*\{\{element\|(\w+)\}\}/gi;
    let em;
    while ((em = elRe.exec(cleaned))) {
      const el = titleCase(em[2]);
      if (Object.values(ELEMENT_KEYS).includes(el)) {
        elements[el] = Number(em[1]);
      }
    }
    // text after em dash or last <br/>
    let text = cleaned;
    const dash = cleaned.split(/—|–/);
    if (dash.length > 1) {
      // take last segment after element listing
      text = dash.slice(1).join('—');
      // drop leading "2 Sun, 5 Fire" style if present
      text = text.replace(/^\s*\d+\s+\w+(?:,\s*\d+\s+\w+)*\s*/i, '');
      text = text.replace(/^\s*\d+\s+\w+(?:\s+\d+\s+\w+)*\s*/i, '');
    }
    text = cleanWikiText(text);
    if (Object.keys(elements).length || text) {
      thresholds.push({ elements, text });
    }
  }
  return thresholds;
}

function parsePowerCardArticle(block, aspect, spirit, setFallback) {
  const get = (key) => block.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n]+)`, 'i'))?.[1]?.trim();
  const name = cleanWikiText(get('name') || '');
  const set = cleanWikiText(get('set') || setFallback || '');
  const unique = cleanWikiText(get('unique') || spirit || '');
  const cost = Number(get('cost') ?? 0);
  const speed = /fast/i.test(get('speed') || '') ? 'Fast' : 'Slow';
  const elements = (get('elements') || '')
    .split(',')
    .map((e) => titleCase(e.trim()))
    .filter((e) => Object.values(ELEMENT_KEYS).includes(e));
  const rangeRaw = get('range') || '';
  let range = null;
  const fromSacred = /sacred/i.test(rangeRaw);
  const nums = [...rangeRaw.matchAll(/\d+/g)].map((x) => Number(x[0]));
  if (nums.length === 1) {
    range = { from: fromSacred ? 'SacredSite' : 'Presence', range: nums[0] };
  } else if (nums.length > 1) {
    range = { from: fromSacred ? 'SacredSite' : 'Presence', range: nums };
  }
  const target = cleanWikiText(get('target') || 'Any') || 'Any';
  const description = cleanWikiText(get('text_en') || get('text') || '');
  const artist = cleanWikiText(get('artist') || '');

  return {
    set,
    type: `Unique Power: ${unique}`,
    name,
    cost,
    speed,
    range,
    target,
    elements,
    artist,
    description,
    spirit: unique,
    aspect,
    kind: 'unique',
    tags: ['unique', 'aspect'],
  };
}

async function importSpiritInnates(spiritTitle) {
  const wt = await getWikitext(spiritTitle);
  if (!wt) return [];
  const out = [];
  for (const body of parseInnateBlocks(wt)) {
    const parsed = parseInnateArgs(body);
    if (!parsed.name) continue;
    // Infer set from spirit page if present
    const set = cleanWikiText(wt.match(/\|\s*set\s*=\s*([^\n]+)/i)?.[1] || '') || 'Unknown';
    out.push({
      set,
      type: `Innate Power: ${spiritTitle}`,
      name: titleCaseWords(parsed.name),
      cost: null,
      speed: parsed.speed,
      range: parsed.range,
      target: parsed.target,
      elements: parsed.elements,
      artist: '',
      description: parsed.description,
      thresholds: parsed.thresholds,
      spirit: spiritTitle,
      aspect: null,
      kind: 'innate',
      tags: ['innate'],
    });
  }
  return out;
}

function titleCaseWords(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function main() {
  console.log('Loading existing powers.json…');
  const existing = JSON.parse(readFileSync(OUT, 'utf8'));

  // Strip previously imported wiki extras so re-runs are idempotent
  const basePowers = existing.filter(
    (c) => !(Array.isArray(c.tags) && (c.tags.includes('innate') || c.tags.includes('aspect'))),
  );
  // Also ensure base powers have kind/tags defaults
  for (const c of basePowers) {
    if (!c.kind) {
      if (String(c.type).startsWith('Unique')) c.kind = 'unique';
      else if (String(c.type).startsWith('Major')) c.kind = 'major';
      else c.kind = 'minor';
    }
    if (!c.tags) {
      c.tags = [c.kind];
    }
    if (c.aspect === undefined) c.aspect = null;
    if (c.spirit === undefined) {
      const m = String(c.type).match(/^Unique Power:\s*(.+)$/);
      c.spirit = m ? m[1] : null;
    }
    if (c.cost === undefined) c.cost = 0;
  }

  console.log('Fetching spirits…');
  const spirits = await listCategory('Category:Spirits');
  console.log(`  ${spirits.length} spirits`);

  const extras = [];
  for (const spirit of spirits) {
    process.stdout.write(`  innates: ${spirit}…`);
    try {
      const innates = await importSpiritInnates(spirit);
      console.log(` ${innates.length}`);
      extras.push(...innates);
    } catch (err) {
      console.log(` ERR ${err.message}`);
    }
  }

  console.log('Fetching aspects…');
  // Aspect pages from List of Aspect Cards via search category if exists
  let aspects = [];
  try {
    aspects = await listCategory('Category:Aspects');
  } catch {
    aspects = [];
  }
  if (aspects.length === 0) {
    // fallback known list from wiki table
    aspects = [
      'Pandemonium', 'Wind', 'Sunshine', 'Madness', 'Reach', 'Resilience', 'Immense', 'Travel',
      'Amorphous', 'Foreboding', 'Might', 'Regrowth', 'Tangles', 'Enticing', 'Violence',
      'Transforming', 'Spreading Hostility', 'Sparking', 'Lair', 'Deeps', 'Haven', 'Locus',
      'Dark Fire', 'Encircle', 'Unconstrained', 'Intensify', 'Mentor', 'Stranded',
      'Tactician', 'Warrior', 'Nourishing',
    ];
  }
  console.log(`  ${aspects.length} aspects`);

  for (const aspect of aspects) {
    process.stdout.write(`  aspect: ${aspect}…`);
    try {
      const wt = await getWikitext(aspect);
      if (!wt || wt.startsWith('#REDIRECT')) {
        console.log(' skip');
        continue;
      }
      const { uniques, innate } = parseAspectArticle(wt);
      console.log(` unique=${uniques.length} innate=${innate ? 1 : 0}`);
      extras.push(...uniques);
      if (innate) extras.push(innate);
    } catch (err) {
      console.log(` ERR ${err.message}`);
    }
  }

  // Deduplicate by slug id; prefer first (base powers first)
  const merged = [];
  const seen = new Set();
  for (const card of [...basePowers, ...extras]) {
    const id = slugifyName(card.name);
    if (seen.has(id)) {
      // allow aspect innate with same name as spirit innate? rename
      if (card.aspect) {
        const alt = slugifyName(`${card.name} ${card.aspect}`);
        if (!seen.has(alt)) {
          seen.add(alt);
          merged.push({ ...card, name: `${card.name} (${card.aspect})` });
        }
      }
      continue;
    }
    seen.add(id);
    merged.push(card);
  }

  writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
  const innateCount = merged.filter((c) => c.kind === 'innate').length;
  const aspectUnique = merged.filter((c) => c.tags?.includes('aspect') && c.kind === 'unique').length;
  const aspectInnate = merged.filter((c) => c.tags?.includes('aspect') && c.kind === 'innate').length;
  console.log(`Wrote ${merged.length} cards → ${OUT}`);
  console.log(`  innates: ${innateCount} (aspect innates: ${aspectInnate})`);
  console.log(`  aspect uniques: ${aspectUnique}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
