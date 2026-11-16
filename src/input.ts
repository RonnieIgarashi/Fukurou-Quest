// キーボード入力。押しっぱなし（held）と、押した瞬間（pressed）を分けて持つ。
// 将来スマホ対応するときは、画面上のボタンから press()/release() を呼べばよい。

export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'cancel' | 'menu' | 'run';

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyZ: 'ok',
  Enter: 'ok',
  Space: 'ok',
  KeyX: 'cancel',
  Backspace: 'cancel',
  Escape: 'menu',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

const held = new Set<Action>();
const pressed = new Set<Action>();

export function press(a: Action): void {
  if (!held.has(a)) pressed.add(a);
  held.add(a);
}

export function release(a: Action): void {
  held.delete(a);
}

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!e.repeat) press(a);
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code];
    if (a) release(a);
  });
  window.addEventListener('blur', () => held.clear());
}

export const isHeld = (a: Action) => held.has(a);
export const wasPressed = (...as: Action[]) => as.some((a) => pressed.has(a));

/** フレームの終わりに呼ぶ */
export function endFrame(): void {
  pressed.clear();
}

/** 画面が切り替わったときに、押しっぱなしの影響を消す */
export function clearInput(): void {
  pressed.clear();
}
