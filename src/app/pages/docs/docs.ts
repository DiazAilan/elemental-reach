import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Element } from '../../core/models/power-card';
import { ElementIcon } from '../../shared/element-icon';

@Component({
  selector: 'app-docs-page',
  imports: [RouterLink, ElementIcon],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
})
export class DocsPage {
  readonly elementLetters: { letter: string; element: Element }[] = [
    { letter: 'S', element: 'Sun' },
    { letter: 'M', element: 'Moon' },
    { letter: 'F', element: 'Fire' },
    { letter: 'A', element: 'Air' },
    { letter: 'W', element: 'Water' },
    { letter: 'E', element: 'Earth' },
    { letter: 'P', element: 'Plant' },
    { letter: 'N', element: 'Animal' },
  ];

  readonly examples = [
    { query: 'Gather Dahan', note: 'Free-text match across all fields' },
    { query: '"Dahan and" major', note: 'Exact phrase + type keyword' },
    { query: 'ps', note: 'Plant + Sun via letter shortcuts (packed)' },
    { query: 'e:fn', note: 'e: is short for elements: (Fire + Animal)' },
    { query: 'e>a', note: 'Has Air and at least one more element' },
    { query: 'e<=as', note: 'Only Air and/or Sun (subset)' },
    { query: 'e=asm', note: 'Exactly Air + Sun + Moon' },
    { query: 'e>=ps', note: 'Has at least Plant and Sun (maybe more)' },
    { query: 'p e', note: 'Plant + Earth as separate letters' },
    { query: 'elements:plant elements:earth', note: 'Full element names still work' },
    { query: 'description:"add 1 presence"', note: 'Search effect text only' },
    { query: 'range:sacred range:>=2', note: 'Sacred Site origin and range ≥ 2' },
    { query: 'cost:<5', note: 'Energy cost less than 5' },
    { query: 'target:!any', note: 'Exclude Any-land targets' },
    { query: 'speed:fast | speed:slow', note: 'OR between filters (spaces around |)' },
    { query: 'name:call|gift', note: 'OR within one field (no spaces)' },
    { query: '!major', note: 'Negate a term' },
    { query: '/fear.*dahan/', note: 'Regular expression' },
  ];
}
