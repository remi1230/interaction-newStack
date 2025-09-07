// src/engine/pixiEngine.ts
import { Application, Graphics, RenderTexture, Sprite } from "pixi.js";
import { state, spawn } from "./state";
import { addModifier, clearModifiers, rebuildGrid, steer, modifiers } from "./modifiers";
import type { Modifier } from "./modifiers";
import { useParams } from "../store/params";

/* ---------- OKLCH -> sRGB helpers ---------- */
function oklchToHex(L: number, C: number, hDeg: number): number {
  const h = ((hDeg % 360) + 360) % 360 * Math.PI / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
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

export async function createPixiEngine(hostEl: HTMLElement) {
  const p = useParams.getState();

  // --- Pixi v8 init ---
  const app = new Application();
  await app.init({ background: p.bgColor, antialias: false, resizeTo: hostEl });
  hostEl.appendChild(app.canvas as HTMLCanvasElement);

  // --- Pose de modifiers au clic directement sur le canvas ---
  app.canvas.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      const st = useParams.getState();
      const mode = st.placing; // false | "attractor" | "rotator"
      if (!mode) return;
      const rect = app.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (mode === "attractor") addModifier({ type: "attractor", x, y, r: st.modRadius, str: st.modStrength });
      else if (mode === "rotator") addModifier({ type: "rotator", x, y, r: st.modRadius, rot: st.modRotation });
    },
    { passive: true }
  );

  // --- Ping-pong trail ---
  let ping = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  let pong = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  const trail = new Sprite(ping);
  trail.position.set(0, 0);
  trail.anchor.set(0, 0);
  app.stage.addChild(trail);

  // — Nettoyage d'une frame : on vide les deux RT et on garde la même texture
  const clearTrailOnce = () => {
    // on “rend rien” avec clear:true pour obtenir une RT transparente
    const blank = new Graphics(); // vide
    app.renderer.render({ container: blank, target: ping, clear: true });
    app.renderer.render({ container: blank, target: pong, clear: true });
    // s'assure que le sprite affiche la RT vide
    trail.texture = ping;

    const w = app.renderer.width, h = app.renderer.height;
    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i;
      const x = Math.random() * w;
      const y = Math.random() * h;
      state.pos[ix] = x;
      state.pos[ix + 1] = y;
      state.vel[ix] = 0;
      state.vel[ix + 1] = 0;

      // 3) réaligner la dernière position dessinée (pas de gros segment au redémarrage)
      if (lastX && lastY) {
        lastX[i] = x;
        lastY[i] = y;
      }
    }
  };

  // s'abonne au signal du store : à chaque changement → clear 1-frame
  const unsubClear = useParams.subscribe((next, prev) => {
    if (next.clearToken !== prev.clearToken) {
      clearTrailOnce();
    }
  });

  // --- Overlays optionnels ---
  const debugDots = new Graphics(); app.stage.addChild(debugDots);
  const modsG = new Graphics();     app.stage.addChild(modsG);
  const SHOW_DEBUG = false;
  const SHOW_MODS = true;

  // --- Brush de point (pour timbres si besoin)
  const dot = new Graphics();
  const updateDot = () => {
    const st = useParams.getState();
    dot.clear();
    dot.circle(0, 0, Math.max(2, st.pointRadius)).fill({ color: 0xffffff, alpha: 1 });
  };
  updateDot();

  // --- Stylo (segment) réutilisé pour tracer entre pos_prev et pos_now ---
  const pen = new Graphics();

  // --- Particules initiales (vitesse 0) ---
  for (let i = 0; i < p.nb; i++) {
    spawn(Math.random() * app.renderer.width, Math.random() * app.renderer.height, 0, 0);
  }

  // --- Mémoire de la dernière position DESSINÉE (pour tracer des segments) ---
  let lastX = new Float32Array(state.count);
  let lastY = new Float32Array(state.count);
  for (let i = 0; i < state.count; i++) {
    lastX[i] = state.pos[2 * i];
    lastY[i] = state.pos[2 * i + 1];
  }

  // --- JITTER asynchrone par avatar + stylo levé ---
  const JITTER_MEAN_S = 0.8;
  const JITTER_STEP_PX = 14;
  const expWait = (mean: number) => -Math.log(1 - Math.random()) * mean;

  let nextJitterAt = new Float64Array(state.count);
  let skipDraw = new Uint8Array(state.count); // 1 = ne pas tracer de segment ce frame (stylo levé)
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
      // initialise la dernière position dessinée sur la position actuelle
      lastX[i] = state.pos[2 * i];
      lastY[i] = state.pos[2 * i + 1];
    }
  };

  // --- Palette OKLCH & mapping vitesse->hue ---
  const L = 0.78, C = 0.14, vRef = 120;

  // --- Ticker ---
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const targetFPS = useParams.getState().maxFPS || 60;
    const maxDt = 1 / targetFPS;
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const steps = Math.max(1, Math.round(dt / maxDt));
    const h = dt / steps;

    // Début de frame
    skipDraw.fill(0);

    // Sans inertie: v remise à zéro
    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i;
      state.vel[ix] = 0;
      state.vel[ix + 1] = 0;
    }

    for (let s = 0; s < steps; s++) {
      rebuildGrid();

      // gain fort (car Δx ≈ a*h^2)
      const gain = 1000 * (useParams.getState().speed || 1);

      for (let i = 0; i < state.count; i++) {
        const ix = 2 * i;
        const x = state.pos[ix], y = state.pos[ix + 1];

        const { ax, ay } = steer(x, y);
        const vx = ax * gain * h;
        const vy = ay * gain * h;

        state.vel[ix]     = vx;
        state.vel[ix + 1] = vy;

        state.pos[ix]     = x + vx * h;
        state.pos[ix + 1] = y + vy * h;

        const w = app.renderer.width, ht = app.renderer.height;
        if (state.pos[ix] < 0 || state.pos[ix] > w) {
          state.pos[ix] = Math.min(w, Math.max(0, state.pos[ix]));
          state.vel[ix] = -vx;
        }
        if (state.pos[ix + 1] < 0 || state.pos[ix + 1] > ht) {
          state.pos[ix + 1] = Math.min(ht, Math.max(0, state.pos[ix + 1]));
          state.vel[ix + 1] = -vy;
        }
      }
    }

    // JITTER (une fois par frame) : téléportation et stylo levé + réalignement lastX/lastY
    {
      const t = performance.now() / 1000;
      const w = app.renderer.width, ht = app.renderer.height;
      for (let i = 0; i < state.count; i++) {
        if (t >= nextJitterAt[i]) {
          const ix = 2 * i;

          // téléportation
          state.pos[ix]     = Math.min(w, Math.max(0, state.pos[ix]     + (Math.random() - 0.5) * JITTER_STEP_PX));
          state.pos[ix + 1] = Math.min(ht, Math.max(0, state.pos[ix + 1] + (Math.random() - 0.5) * JITTER_STEP_PX));

          // stylo levé — on met aussi la "dernière position dessinée" à jour
          skipDraw[i] = 1;
          lastX[i] = state.pos[ix];
          lastY[i] = state.pos[ix + 1];

          // replanifie
          nextJitterAt[i] = t + expWait(JITTER_MEAN_S);
        }
      }
    }

    // Debug (optionnel)
    if (SHOW_DEBUG) {
      debugDots.clear();
      const n = Math.min(state.count, 200);
      for (let i = 0; i < n; i++) {
        const x = state.pos[2 * i], y = state.pos[2 * i + 1];
        debugDots.circle(x, y, 2).fill({ color: 0xff00ff, alpha: 1 });
      }
    }

    // Overlay modifiers (optionnel)
    if (SHOW_MODS) {
      modsG.clear();
      for (const m of modifiers) {
        modsG
          .circle(m.x, m.y, 3)
          .fill({ color: 0x00ff88, alpha: 0.9 });
      }
    }

    // --- Trail ping-pong ---
    const { trailAlpha } = useParams.getState();

    // 1) copier ping -> pong
    app.renderer.render({ container: trail, target: pong, clear: true });

    // 2) tracer des SEGMENTS (pas des points)
    pen.clear();
    const pr = Math.max(2, useParams.getState().pointRadius);
    for (let i = 0; i < state.count; i++) {
      if (skipDraw[i]) continue; // stylo levé ce frame

      const ix = 2 * i;
      const x0 = lastX[i], y0 = lastY[i];
      const x1 = state.pos[ix], y1 = state.pos[ix + 1];

      // distance parcourue
      const dx = x1 - x0, dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) continue; // trop court, ne trace rien

      // couleur selon vitesse instantanée
      const v = Math.hypot(state.vel[ix], state.vel[ix + 1]);
      const hue = (v / vRef) * 360;
      const color = oklchToHex(L, C, hue);

      // épaisseur ≈ diamètre du point pour un rendu similaire
      pen.stroke({ color, alpha: trailAlpha, width: pr * 2 * Math.random(), cap: "round" })
         .moveTo(x0, y0)
         .lineTo(x1, y1);
      
      // met à jour la dernière position dessinée
      lastX[i] = x1;
      lastY[i] = y1;
    }

    app.renderer.render({ container: pen, target: pong, clear: false });

    // 3) swap
    const tmp = ping; ping = pong; pong = tmp;
    trail.texture = ping;
  });

  // --- Resize des RT ---
  const resize = () => {
    ping.resize(app.renderer.width, app.renderer.height);
    pong.resize(app.renderer.width, app.renderer.height);
  };
  window.addEventListener("resize", resize);

  // --- Réactions store “lentes” ---
  const unsub = useParams.subscribe((next, prev) => {
    if (next.bgColor !== prev.bgColor) app.renderer.background.color = next.bgColor;
    if (next.nb !== prev.nb && next.nb > state.count) {
      const w = app.renderer.width, h = app.renderer.height;
      const from = state.count;
      for (let i = state.count; i < next.nb; i++) spawn(Math.random() * w, Math.random() * h, 0, 0);
      addJitterForNewAgents(from, next.nb);
    }
  });

  return {
    dispose() {
      unsub();
      unsubClear();
      window.removeEventListener("resize", resize);
      app.destroy();
      hostEl.innerHTML = "";
    },
  };
}

/* ---------- API pour l’UI ---------- */
export const EngineAPI = {
  addAttractor(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "str">> = {}) {
    addModifier({ type: "attractor", x: pos.x, y: pos.y, ...opts });
  },
  addRotator(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "rot">> = {}) {
    addModifier({ type: "rotator", x: pos.x, y: pos.y, ...opts });
  },
  clearModifiers() { clearModifiers(); },
} as const;