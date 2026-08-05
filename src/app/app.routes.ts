import { Routes } from '@angular/router';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/search/search').then((m) => m.SearchPage),
      },
      {
        path: 'card/:slug',
        loadComponent: () =>
          import('./pages/card-detail/card-detail').then((m) => m.CardDetailPage),
      },
      {
        path: 'docs',
        loadComponent: () => import('./pages/docs/docs').then((m) => m.DocsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
