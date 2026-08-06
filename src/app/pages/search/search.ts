import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, skip } from 'rxjs';
import { formatRange } from '../../core/models/power-card';
import { QueryService, type SortField } from '../../core/query/query.service';
import { CardCatalogService } from '../../core/services/card-catalog.service';
import { ElementIcon } from '../../shared/element-icon';

@Component({
  selector: 'app-search-page',
  imports: [FormsModule, RouterLink, ElementIcon],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class SearchPage {
  private readonly catalog = inject(CardCatalogService);
  private readonly queryService = inject(QueryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loaded = this.catalog.loaded;
  readonly error = this.catalog.error;
  readonly totalCount = this.catalog.count;
  readonly formatRange = formatRange;

  readonly queryInput = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  readonly activeQuery = signal(this.queryInput());
  readonly sortField = signal<SortField>('name');
  readonly ascending = signal(true);

  readonly results = computed(() => {
    if (!this.catalog.loaded()) {
      return [];
    }
    const filtered = this.queryService.search(this.catalog.powers(), this.activeQuery());
    return this.queryService.sort(filtered, this.sortField(), this.ascending());
  });

  readonly resultCount = computed(() => this.results().length);

  private readonly urlQuery = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('query') ?? '')),
    { initialValue: this.queryInput() },
  );

  constructor() {
    void this.catalog.ensureLoaded();

    // Keep input in sync when browser back/forward changes ?query=
    toObservable(this.urlQuery)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe((q) => {
        if (q !== this.queryInput()) {
          this.queryInput.set(q);
          this.activeQuery.set(q);
        }
      });

    // Debounce typing → filter + URL
    const delay = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 1000 : 300;
    toObservable(this.queryInput)
      .pipe(skip(1), debounceTime(delay), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.commitQuery(value));

    this.wireKeyboardShortcut();
  }

  onInput(value: string): void {
    this.queryInput.set(value);
  }

  onBlur(): void {
    this.commitQuery(this.queryInput());
  }

  setSort(field: SortField): void {
    if (this.sortField() === field) {
      this.ascending.update((v) => !v);
    } else {
      this.sortField.set(field);
      this.ascending.set(true);
    }
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) {
      return '';
    }
    return this.ascending() ? ' ↑' : ' ↓';
  }

  typeClass(card: { type: string; kind: string; aspect: string | null }): string {
    if (card.aspect) {
      return 'aspect';
    }
    if (card.kind === 'innate' || card.type.startsWith('Innate')) {
      return 'innate';
    }
    if (card.type.startsWith('Unique') || card.kind === 'unique') {
      return 'unique';
    }
    if (card.type.startsWith('Major') || card.kind === 'major') {
      return 'major';
    }
    return 'minor';
  }

  typeLabel(card: { type: string; aspect: string | null }): string {
    let label = card.type
      .replace('Unique Power: ', 'Unique · ')
      .replace('Innate Power: ', 'Innate · ');
    if (card.aspect) {
      label = `Aspect · ${card.aspect}`;
    }
    return label;
  }

  private commitQuery(value: string): void {
    this.activeQuery.set(value);
    const current = this.route.snapshot.queryParamMap.get('query') ?? '';
    if (current === value) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: value ? { query: value } : {},
      replaceUrl: true,
    });
  }

  private wireKeyboardShortcut(): void {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === 's' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        document.getElementById('power-search')?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keypress', handler);
    this.destroyRef.onDestroy(() => document.removeEventListener('keypress', handler));
  }
}
