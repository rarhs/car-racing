export type StateName = 'boot' | 'loading' | 'countdown' | 'race' | 'results';

export class GameState {
  current: StateName = 'boot';
  is(name: StateName): boolean { return this.current === name; }
  set(name: StateName): void { this.current = name; }
}
