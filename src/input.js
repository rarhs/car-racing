const keys = new Set();
const justPressed = new Set();

const keyMap = {
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

export const input = {
  isDown(action) { return keys.has(action); },
  wasPressed(action) {
    const v = justPressed.has(action);
    return v;
  },
  endFrame() { justPressed.clear(); },
};
