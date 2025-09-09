// src/engine/pixiEngine.ts
import { Application, Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import { state, spawn } from "./state";
import { addModifier, clearModifiers, steer, modifiers } from "./modifiers";
import type { Modifier } from "./modifiers";
import { useParams } from "../store/params";

export type AddModifierAtArgs = {
  x: number; y: number; radius: number; strength: number; rotation: number;
  kind?: "auto" | "attractor" | "rotator";
};

const ROT_EPS = 1e-6;

/* ---------- OKLCH -> sRGB ---------- */
function oklchToHex(L: number, C: number, hDeg: number): number {
  const h = (((hDeg % 360) + 360) % 360) * Math.PI / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const toSRGB = (c: number) => c <= 0 ? 0 : c >= 1 ? 1 : (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  r = toSRGB(r); g = toSRGB(g); b2 = toSRGB(b2);
  const R = Math.max(0, Math.min(255, Math.round(r * 255)));
  const G = Math.max(0, Math.min(255, Math.round(g * 255)));
  const B = Math.max(0, Math.min(255, Math.round(b2 * 255)));
  return (R << 16) | (G << 8) | B;
}

type Vec2 = { x: number; y: number };

// ======= Reuse-once option objects to avoid per-frame allocations =======
const STROKE_OPTS: { color: number; alpha: number; width: number; cap: "round" } = {
  color: 0xffffff, alpha: 1, width: 1, cap: "round",
};
const MOD_FILL = { color: 0x00ff88, alpha: 0.9 };
const DEBUG_FILL = { color: 0xff00ff, alpha: 1 };
const DOT_FILL = { color: 0xffffff, alpha: 1 };

// ======= Modifiers budget (trim when exceeded) =======
const getMaxModifiers = () => useParams.getState().maxModifiers ?? 256;
function trimModifiers() {
  const max = getMaxModifiers();
  if (modifiers.length > max) {
    // Retire les plus anciens (FIFO)
    modifiers.splice(0, modifiers.length - max);
  }
}

export async function createPixiEngine(hostEl: HTMLElement) {
  const p = useParams.getState();

  const app = new Application();
  await app.init({ background: p.bgColor, antialias: false, resizeTo: hostEl });
  hostEl.appendChild(app.canvas as HTMLCanvasElement);

  // --- Pointer handler (nommé) + trim des modifiers à chaque ajout
  const handlePointerDown = (e: PointerEvent) => {
    const st = useParams.getState();
    const mode = st.placing; // false | "attractor" | "rotator"
    if (!mode) return;
    const rect = app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (mode === "attractor") addModifier({ type: "attractor", x, y, r: st.modRadius, str: st.modStrength });
    else if (mode === "rotator") addModifier({ type: "rotator", x, y, r: st.modRadius, rot: st.modRotation });
    trimModifiers();
  };
  app.canvas.addEventListener("pointerdown", handlePointerDown, { passive: true });

  // --- Ping-pong trail ---
  let ping = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  let pong = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  const trail = new Sprite(ping);
  trail.position.set(0, 0); trail.anchor.set(0, 0);
  app.stage.addChild(trail);

  // --- Buffers last-drawn ---
  let lastX = new Float32Array(state.count);
  let lastY = new Float32Array(state.count);
  for (let i = 0; i < state.count; i++) {
    lastX[i] = state.pos[2 * i];
    lastY[i] = state.pos[2 * i + 1];
  }

  // --- Overlays ---
  const debugDots = new Graphics(); app.stage.addChild(debugDots);
  const modsG = new Graphics();     app.stage.addChild(modsG);
  const SHOW_DEBUG = false, SHOW_MODS = true;

  // --- Tools ---
  const pen = new Graphics();

  // --- Spawn ---
  for (let i = 0; i < p.nb; i++) {
    spawn(Math.random() * app.renderer.width, Math.random() * app.renderer.height, 0, 0);
  }

  // --- Jitter ---
  const JITTER_MEAN_S = 0.8;
  const expWait = (mean: number) => -Math.log(1 - Math.random()) * mean;
  let nextJitterAt = new Float64Array(state.count);
  let skipDraw = new Uint8Array(state.count);
  {
    const t0 = performance.now() / 1000;
    for (let i = 0; i < state.count; i++) nextJitterAt[i] = t0 + expWait(JITTER_MEAN_S);
    skipDraw.fill(0);
  }
  const growArraysFor = (to: number) => {
    if (lastX.length < to) {
      const nx = new Float32Array(to), ny = new Float32Array(to);
      nx.set(lastX); ny.set(lastY); lastX = nx; lastY = ny;
    }
    if (nextJitterAt.length < to) { const r = new Float64Array(to); r.set(nextJitterAt); nextJitterAt = r; }
    if (skipDraw.length   < to)   { const r = new Uint8Array(to);   r.set(skipDraw);     skipDraw = r; }
  };
  const addJitterForNewAgents = (from: number, to: number) => {
    const t0 = performance.now() / 1000;
    growArraysFor(to);
    for (let i = from; i < to; i++) {
      nextJitterAt[i] = t0 + expWait(JITTER_MEAN_S);
      skipDraw[i] = 0;
      lastX[i] = state.pos[2 * i];
      lastY[i] = state.pos[2 * i + 1];
    }
  };

  // === SHRINK support (quand nb diminue) ===
  function shrinkAgents(to: number) {
    // Bornes
    to = Math.max(0, Math.min(to, state.count));
    if (to === state.count) return;

    // Shrink buffers du "state" (pos, vel) et maj count
    if (to === 0) {
      state.pos = new Float32Array(0);
      state.vel = new Float32Array(0);
    } else {
      state.pos = state.pos.slice(0, 2 * to);
      state.vel = state.vel.slice(0, 2 * to);
    }
    state.count = to;

    // Shrink buffers locaux
    lastX = lastX.slice(0, to);
    lastY = lastY.slice(0, to);
    nextJitterAt = nextJitterAt.slice(0, to);
    skipDraw = skipDraw.slice(0, to);
  }

  // === CLEAR option 1 (EMPTY container réutilisé) ===
  const EMPTY = new Container();
  const clearTrailOnce = () => {
    app.renderer.render({ container: EMPTY, target: ping, clear: true });
    app.renderer.render({ container: EMPTY, target: pong, clear: true });
    trail.texture = ping;
    const w = app.renderer.width, h = app.renderer.height;
    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i;
      const x = Math.random() * w, y = Math.random() * h;
      state.pos[ix] = x; state.pos[ix + 1] = y;
      state.vel[ix] = 0; state.vel[ix + 1] = 0;
      lastX[i] = x; lastY[i] = y;
    }
  };

  // --- Couleur ---
  const vRef = 120;

  // --- Ticker ---
  let last = performance.now();
  const tickerFn = () => {
    const params = useParams.getState();
    const now = performance.now();
    const targetFPS = params.maxFPS || 60;
    const maxDt = 1 / targetFPS;
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const steps = Math.max(1, Math.round(dt / maxDt));
    const h = dt / steps;

    skipDraw.fill(0);

    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i; state.vel[ix] = 0; state.vel[ix + 1] = 0;
    }

    for (let s = 0; s < steps; s++) {
      const gain = 1000 * (params.speed || 1);
      for (let i = 0; i < state.count; i++) {
        const ix = 2 * i;
        const x = state.pos[ix], y = state.pos[ix + 1];
        const { ax, ay } = steer(x, y);
        const vx = ax * gain * h, vy = ay * gain * h;
        state.vel[ix] = vx; state.vel[ix + 1] = vy;
        state.pos[ix] = x + vx * h; state.pos[ix + 1] = y + vy * h;

        const w = app.renderer.width, ht = app.renderer.height;
        if (state.pos[ix] < 0 || state.pos[ix] > w) { state.pos[ix] = Math.min(w, Math.max(0, state.pos[ix])); state.vel[ix] = -vx; }
        if (state.pos[ix + 1] < 0 || state.pos[ix + 1] > ht) { state.pos[ix + 1] = Math.min(ht, Math.max(0, state.pos[ix + 1])); state.vel[ix + 1] = -vy; }
      }
    }

    // Jitter
    {
      const t = performance.now() / 1000;
      const w = app.renderer.width, ht = app.renderer.height;
      for (let i = 0; i < state.count; i++) {
        if (t >= nextJitterAt[i]) {
          const ix = 2 * i;
          state.pos[ix]     = Math.random() * w;
          state.pos[ix + 1] = Math.random() * ht;
          skipDraw[i] = 1;
          lastX[i] = state.pos[ix]; lastY[i] = state.pos[ix + 1];
          nextJitterAt[i] = t + expWait(JITTER_MEAN_S);
        }
      }
    }

    // Debug
    if (SHOW_DEBUG) {
      debugDots.clear();
      const n = Math.min(state.count, 200);
      for (let i = 0; i < n; i++) {
        const x = state.pos[2 * i], y = state.pos[2 * i + 1];
        debugDots.circle(x, y, 2).fill(DEBUG_FILL);
      }
    }

    // Modifiers overlay
    if (SHOW_MODS) {
      modsG.clear();
      // (aucune alloc par itération : MOD_FILL réutilisé)
      for (const m of modifiers) {
        modsG.circle(m.x, m.y, 3).fill(MOD_FILL);
      }
    }

    // Trail ping-pong
    const trailAlpha  = params.trailAlpha;
    app.renderer.render({ container: trail, target: pong, clear: true });

    let vMoy = 0, vMax = 0;
    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i;
      const x0 = lastX[i], y0 = lastY[i];
      const x1 = state.pos[ix], y1 = state.pos[ix + 1];

      const vCurr = Math.hypot(x1-x0, y1-y0);
      vMoy += vCurr;

      vMax = vMax < vCurr ? vCurr : vMax;
    }
    vMoy/=state.count;

    pen.clear();
    const pr = Math.max(2, params.pointRadius);
    for (let i = 0; i < state.count; i++) {
      if (skipDraw[i]) continue;
      const ix = 2 * i;
      const x0 = lastX[i], y0 = lastY[i];
      const x1 = state.pos[ix], y1 = state.pos[ix + 1];
      const dx = x1 - x0, dy = y1 - y0;
      if (dx * dx + dy * dy < 0.25) continue;

      const v = Math.hypot(x1-x0, y1-y0);
      const hue = 360 * (v / vMax);
      const color = oklchToHex(params.lightColor, params.saturationColor, hue);

      // Réutilise STROKE_OPTS (aucune alloc)
      STROKE_OPTS.color = color;
      STROKE_OPTS.alpha = trailAlpha;
      STROKE_OPTS.width = pr * 2 * Math.random();

      pen.stroke(STROKE_OPTS).moveTo(x0, y0).lineTo(x1, y1);

      lastX[i] = x1; lastY[i] = y1;
    }
    app.renderer.render({ container: pen, target: pong, clear: false });

    const tmp = ping; ping = pong; pong = tmp;
    trail.texture = ping;
  };
  app.ticker.add(tickerFn);

  // Resize
  const resize = () => {
    ping.resize(app.renderer.width, app.renderer.height);
    pong.resize(app.renderer.width, app.renderer.height);
  };
  window.addEventListener("resize", resize);

  // Store reactions
  const unsub = useParams.subscribe((next, prev) => {
    if (next.bgColor !== prev.bgColor) app.renderer.background.color = next.bgColor;

    // AUGMENTATION d'agents
    if (next.nb !== prev.nb && next.nb > state.count) {
      const w = app.renderer.width, h = app.renderer.height;
      const from = state.count;
      for (let i = state.count; i < next.nb; i++) spawn(Math.random() * w, Math.random() * h, 0, 0);
      addJitterForNewAgents(from, next.nb);
    }

    // DIMINUTION d'agents (shrink réel des buffers + state.count)
    if (next.nb !== prev.nb && next.nb < state.count) {
      shrinkAgents(next.nb);
    }

    // Budget de modifiers paramétrable
    if (next.maxModifiers !== prev.maxModifiers) {
      trimModifiers();
    }
  });

  // Clear trigger
  const unsubClear = useParams.subscribe((next, prev) => {
    if (next.clearToken !== prev.clearToken) clearTrailOnce();
  });

  return {
    dispose() {
      unsub();
      unsubClear();
      window.removeEventListener("resize", resize);
      app.canvas?.removeEventListener("pointerdown", handlePointerDown);
      app.ticker.remove(tickerFn);

      pen.destroy(true);
      debugDots.destroy(true);
      modsG.destroy(true);
      trail.destroy(true);
      EMPTY.destroy(true);

      if (ping) { ping.destroy(true); ping = null as any; }
      if (pong) { pong.destroy(true); pong = null as any; }

      app.destroy();
      hostEl.innerHTML = "";
    },
  };
}

/* ---------- API ---------- */
export const EngineAPI = {
  addAttractor(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "str">> = {}) {
    addModifier({ type: "attractor", x: pos.x, y: pos.y, ...opts });
    trimModifiers();
  },
  addRotator(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "rot">> = {}) {
    addModifier({ type: "rotator", x: pos.x, y: pos.y, ...opts });
    trimModifiers();
  },
  clearModifiers() { clearModifiers(); },
  addModifierAt({ x, y, radius, strength, rotation, kind = "auto" }: AddModifierAtArgs) {
    if (kind === "rotator" || (kind === "auto" && Math.abs(rotation) > ROT_EPS)) {
      addModifier({ type: "rotator", x, y, r: radius, rot: rotation });
    } else {
      addModifier({ type: "attractor", x, y, r: radius, str: strength });
    }
    trimModifiers();
  },
} as const;