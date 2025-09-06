// src/engine/pixiEngine.ts
import { Application, Graphics, RenderTexture, Sprite } from "pixi.js";
import { state, spawn } from "./state";
import { addModifier, clearModifiers, rebuildGrid, steer, modifiers } from "./modifiers";
import type { Modifier } from "./modifiers";
import { useParams } from "../store/params";

// ---------- OKLCH -> sRGB helpers ----------
function oklchToHex(L: number, C: number, hDeg: number): number {
  const h = ((hDeg % 360) + 360) % 360 * Math.PI / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab -> LMS' (non-linéaire)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // LMS' -> LMS lin
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS lin -> RGB lin
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // lin -> sRGB
  const toSRGB = (c: number) =>
    c <= 0 ? 0 :
    c >= 1 ? 1 :
    (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  r = toSRGB(r); g = toSRGB(g); b2 = toSRGB(b2);

  const R = Math.max(0, Math.min(255, Math.round(r * 255)));
  const G = Math.max(0, Math.min(255, Math.round(g * 255)));
  const B = Math.max(0, Math.min(255, Math.round(b2 * 255)));
  return (R << 16) | (G << 8) | B;
}

type Vec2 = { x: number; y: number };

export async function createPixiEngine(hostEl: HTMLElement) {
  const p = useParams.getState();

  // Init Pixi v8 (async) + ajout du canvas
  const app = new Application();
  await app.init({ background: p.bgColor, antialias: false, resizeTo: hostEl });
  hostEl.appendChild(app.canvas as HTMLCanvasElement);

  // — Clic directement sur le canvas (plus fiable que l'overlay React)
  app.canvas.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      const st = useParams.getState();
      const mode = st.placing; // false | "attractor" | "rotator"
      if (!mode) return;

      const rect = app.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (mode === "attractor") {
        addModifier({ type: "attractor", x, y, r: st.modRadius, str: st.modStrength });
        console.log("Attractor posé", { x, y, r: st.modRadius, str: st.modStrength });
      } else if (mode === "rotator") {
        addModifier({ type: "rotator", x, y, r: st.modRadius, rot: st.modRotation });
        console.log("Rotator posé", { x, y, r: st.modRadius, rot: st.modRotation });
      }
    },
    { passive: true }
  );

  // RenderTextures ping-pong pour la trail persistante
  let ping = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  let pong = RenderTexture.create({ width: app.renderer.width, height: app.renderer.height });
  const trail = new Sprite(ping);
  trail.position.set(0, 0);
  trail.anchor.set(0, 0);
  app.stage.addChild(trail);

  // (option debug) points visibles directement sur la scène
  const debugDots = new Graphics();
  app.stage.addChild(debugDots);
  const SHOW_DEBUG = false; // ← passe à true si besoin

  // (option) overlay des modifiers
  const modsG = new Graphics();
  app.stage.addChild(modsG);
  const SHOW_MODS = true;

  // Brush réutilisé (base blanche → tint par particule)
  const brush = new Graphics();
  const updateBrush = () => {
    const st = useParams.getState();
    brush.clear();
    brush.circle(0, 0, Math.max(2, st.pointRadius)).fill({ color: 0xffffff, alpha: 1 });
  };
  updateBrush();

  // Particules initiales
  for (let i = 0; i < p.nb; i++) {
    spawn(
      Math.random() * app.renderer.width,
      Math.random() * app.renderer.height,
      0,
      0
    );
  }

  // 1er modifier de test (optionnel)
  addModifier({ type: "attractor", x: app.renderer.width / 2, y: app.renderer.height / 2, r: 160, str: 0.8 });

  // Paramètres OKLCH (peuvent devenir des sliders si tu veux)
  const L = 0.78;   // luminosité
  const C = 0.14;   // chroma
  const vRef = 120; // vitesse de référence (px/s) pour 360°

  // Boucle
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const targetFPS = useParams.getState().maxFPS || 60;
    const maxDt = 1 / targetFPS;
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const steps = Math.max(1, Math.round(dt / maxDt));
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      rebuildGrid();

      // gain global : on s'appuie sur "speed" pour amplifier l'effet des modifiers
      const gain = 1000 * (useParams.getState().speed || 1);

      for (let i = 0; i < state.count; i++) {
        const ix = 2 * i;
        const x = state.pos[ix], y = state.pos[ix + 1];

        const { ax, ay } = steer(x, y);
        state.vel[ix]     = ax * gain * h;
        state.vel[ix + 1] = ay * gain * h;

        state.pos[ix]     = x + state.vel[ix]     * h;
        state.pos[ix + 1] = y + state.vel[ix + 1] * h;

        const w = app.renderer.width, ht = app.renderer.height;
        if (state.pos[ix] < 0 || state.pos[ix] > w)           state.vel[ix] *= -1;
        if (state.pos[ix + 1] < 0 || state.pos[ix + 1] > ht)  state.vel[ix + 1] *= -1;
      }
    }

    // Debug (points magenta à l'écran)
    if (SHOW_DEBUG) {
      debugDots.clear();
      const n = Math.min(state.count, 200);
      for (let i = 0; i < n; i++) {
        const x = state.pos[2 * i], y = state.pos[2 * i + 1];
        debugDots.circle(x, y, 2).fill({ color: 0xff00ff, alpha: 1 });
      }
    }

    // Overlay visuel des modifiers
    if (SHOW_MODS) {
      modsG.clear();
      for (const m of modifiers) {
        modsG
          .circle(m.x, m.y, Math.max(4, Math.min(m.r, 2000)))
          .stroke({ color: 0x00ff88, alpha: 0.5, width: 1 })
          .circle(m.x, m.y, 3)
          .fill({ color: 0x00ff88, alpha: 0.9 });
      }
    }

    // —— Trail ping-pong (Pixi v8) ——
    const { trailAlpha } = useParams.getState();

    // 1) recopier la trail affichée (ping) vers la texture de travail (pong)
    app.renderer.render({ container: trail, target: pong, clear: true });

    // 2) dessiner les nouveaux points dans 'pong' avec teinte OKLCH selon la vitesse
    updateBrush(); // si rayon changé côté UI
    for (let i = 0; i < state.count; i++) {
      const ix = 2 * i;
      const vx = state.vel[ix];
      const vy = state.vel[ix + 1];
      const v = Math.hypot(vx, vy);         // vitesse instantanée (px/s approx)
      const hue = (v / vRef) * 360;         // hue qui boucle naturellement
      const color = oklchToHex(L, C, hue);  // couleur sRGB

      brush.position.set(state.pos[ix], state.pos[ix + 1]);
      brush.alpha = trailAlpha;
      (brush as any).tint = color;          // teinte sans recréer la géo

      app.renderer.render({ container: brush, target: pong, clear: false });
    }

    // 3) swap & affiche la nouvelle texture sur le sprite 'trail'
    const tmp = ping; ping = pong; pong = tmp;
    trail.texture = ping;
  });

  // Resize des RT
  const resize = () => {
    ping.resize(app.renderer.width, app.renderer.height);
    pong.resize(app.renderer.width, app.renderer.height);
  };
  window.addEventListener("resize", resize);

  // Réactions “lentes” du store
  const unsub = useParams.subscribe((next, prev) => {
    if (next.bgColor !== prev.bgColor) app.renderer.background.color = next.bgColor;
    if (next.nb !== prev.nb && next.nb > state.count) {
      const w = app.renderer.width, h = app.renderer.height;
      for (let i = state.count; i < next.nb; i++) {
        spawn(Math.random() * w, Math.random() * h, 0, 0);
      }
    }
  });

  return {
    dispose() {
      unsub();
      window.removeEventListener("resize", resize);
      app.destroy();
      hostEl.innerHTML = "";
    },
  };
}

// API pour l’UI
export const EngineAPI = {
  addAttractor(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "str">> = {}) {
    addModifier({ type: "attractor", x: pos.x, y: pos.y, ...opts });
  },
  addRotator(pos: Vec2, opts: Partial<Pick<Modifier, "r" | "rot">> = {}) {
    addModifier({ type: "rotator", x: pos.x, y: pos.y, ...opts });
  },
  clearModifiers() {
    clearModifiers();
  },
} as const;