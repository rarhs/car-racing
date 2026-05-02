export type Action =
  | 'accel' | 'brake' | 'left' | 'right' | 'drift' | 'item' | 'restart' | 'pause';

export interface KartInput {
  isDown(action: Action): boolean;
  wasPressed(action: Action): boolean;
}

const keys = new Set<Action>();
const justPressed = new Set<Action>();

const keyMap: Record<string, Action> = {
  KeyW: 'accel', ArrowUp: 'accel',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left',  ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'drift',
  KeyE: 'item',  ShiftLeft: 'item', ShiftRight: 'item',
  KeyR: 'restart',
  Escape: 'pause',
};

window.addEventListener('keydown', (e) => {
  const action = keyMap[e.code];
  if (!action) return;
  if (!keys.has(action)) justPressed.add(action);
  keys.add(action);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  const action = keyMap[e.code];
  if (!action) return;
  keys.delete(action);
});

export const input: KartInput & { endFrame(): void } = {
  isDown(action) { return keys.has(action); },
  wasPressed(action) { return justPressed.has(action); },
  endFrame() { justPressed.clear(); },
};
