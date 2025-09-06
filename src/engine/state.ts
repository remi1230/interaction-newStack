const MAX = 20000;

export const state = {
  count: 0,
  pos: new Float32Array(MAX * 2),
  vel: new Float32Array(MAX * 2),
};

export function spawn(x: number, y: number, vx = 0, vy = 0) {
  if (state.count >= MAX) return;
  const i = state.count++;
  state.pos[2 * i] = x; state.pos[2 * i + 1] = y;
  state.vel[2 * i] = vx; state.vel[2 * i + 1] = vy;
}