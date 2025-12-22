import { Route } from '@angular/router';
import { HomeComponent } from './components/home.component';
import { LobbyComponent } from './components/lobby.component';
import { GameComponent } from './components/game.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'lobby/:id',
    component: LobbyComponent
  },
  {
    path: 'game/:id',
    component: GameComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
