import { Component, input } from '@angular/core';
import type { Element } from '../core/models/power-card';

const ELEMENT_ICON: Record<Element, string> = {
  Sun: 'elements/sun.png',
  Moon: 'elements/moon.png',
  Fire: 'elements/fire.png',
  Air: 'elements/air.png',
  Water: 'elements/water.png',
  Earth: 'elements/earth.png',
  Plant: 'elements/plant.png',
  Animal: 'elements/animal.png',
};

@Component({
  selector: 'app-element-icon',
  template: `
    <img
      class="element-icon"
      [class.large]="size() === 'lg'"
      [src]="src"
      [alt]="element()"
      [attr.title]="element()"
      [attr.aria-label]="element()"
      loading="lazy"
      decoding="async"
      draggable="false"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
      vertical-align: middle;
    }

    .element-icon {
      width: 1.55rem;
      height: 1.55rem;
      object-fit: contain;
      display: block;
    }

    .element-icon.large {
      width: 2.1rem;
      height: 2.1rem;
    }
  `,
})
export class ElementIcon {
  readonly element = input.required<Element>();
  readonly size = input<'sm' | 'lg'>('sm');

  get src(): string {
    return ELEMENT_ICON[this.element()];
  }
}
