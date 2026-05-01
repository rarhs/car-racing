export class GameState {
  constructor() { this.current = 'boot'; }
  is(name) { return this.current === name; }
  set(name) { this.current = name; }
}
