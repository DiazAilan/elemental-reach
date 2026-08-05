import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-docs-page',
  imports: [RouterLink],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
})
export class DocsPage {
  readonly examples = [
    { query: 'Gather Dahan', note: 'Free-text match across all fields' },
    { query: '"Dahan and" major', note: 'Exact phrase + type keyword' },
    { query: 'elements:plant elements:earth', note: 'Must include both elements' },
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
