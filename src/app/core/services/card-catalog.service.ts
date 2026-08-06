import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PowerCard,
  buildSearchString,
  slugifyName,
  type CardKind,
  type Element,
  type InnateThreshold,
  type PowerRange,
  type Speed,
} from '../models/power-card';

interface RawPowerCard {
  set: string;
  type: string;
  name: string;
  cost: number | null;
  speed: Speed;
  range: PowerRange | null;
  target: string;
  elements: Element[];
  artist: string;
  description: string;
  kind?: CardKind;
  tags?: string[];
  spirit?: string | null;
  aspect?: string | null;
  thresholds?: InnateThreshold[];
}

@Injectable({ providedIn: 'root' })
export class CardCatalogService {
  private readonly http = inject(HttpClient);

  private readonly powersSignal = signal<PowerCard[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private loadPromise: Promise<void> | null = null;

  readonly powers = this.powersSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly count = computed(() => this.powersSignal().length);

  byId(id: string): PowerCard | undefined {
    return this.powersSignal().find((card) => card.id === id);
  }

  ensureLoaded(): Promise<void> {
    if (this.loadedSignal()) {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = firstValueFrom(this.http.get<RawPowerCard[]>('data/powers.json'))
      .then((raw) => {
        const cards = raw.map((card) => this.normalize(card));
        this.powersSignal.set(cards);
        this.loadedSignal.set(true);
        this.errorSignal.set(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load power cards';
        this.errorSignal.set(message);
        this.loadPromise = null;
        throw err;
      });

    return this.loadPromise;
  }

  private normalize(raw: RawPowerCard): PowerCard {
    const kind = raw.kind ?? inferKind(raw.type);
    const tags = raw.tags?.length ? raw.tags : [kind];
    const spirit =
      raw.spirit ??
      (String(raw.type).match(/^Unique Power:\s*(.+)$/)?.[1] ??
        String(raw.type).match(/^Innate Power:\s*(.+)$/)?.[1] ??
        null);
    const base = {
      set: raw.set,
      type: raw.type,
      name: raw.name,
      cost: raw.cost,
      speed: raw.speed,
      range: raw.range,
      target: raw.target,
      elements: raw.elements,
      artist: raw.artist ?? '',
      description: raw.description,
      kind,
      tags,
      spirit,
      aspect: raw.aspect ?? null,
      thresholds: raw.thresholds,
    };
    return {
      ...base,
      id: slugifyName(raw.name),
      searchString: buildSearchString(base),
    };
  }
}

function inferKind(type: string): CardKind {
  if (type.startsWith('Innate')) {
    return 'innate';
  }
  if (type.startsWith('Unique')) {
    return 'unique';
  }
  if (type.startsWith('Major')) {
    return 'major';
  }
  return 'minor';
}
