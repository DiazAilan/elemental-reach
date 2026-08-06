import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { formatRange } from '../../core/models/power-card';
import { CardCatalogService } from '../../core/services/card-catalog.service';
import { ElementIcon } from '../../shared/element-icon';

@Component({
  selector: 'app-card-detail-page',
  imports: [RouterLink, ElementIcon],
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetailPage {
  private readonly catalog = inject(CardCatalogService);
  private readonly route = inject(ActivatedRoute);

  readonly formatRange = formatRange;
  readonly loaded = this.catalog.loaded;
  readonly error = this.catalog.error;

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('slug') ?? '' },
  );

  readonly card = computed(() => {
    const id = this.slug();
    if (!id || !this.catalog.loaded()) {
      return undefined;
    }
    return this.catalog.byId(id);
  });

  constructor() {
    void this.catalog.ensureLoaded();
  }
}
