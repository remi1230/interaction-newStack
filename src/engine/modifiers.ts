// src/engine/modifiers.ts
import { SpatialHash, type HasXY } from "./spatial-hash";

// 🔹 Types de modificateurs (union de littéraux)
export type ModType =
  | "attractor"
  | "rotator"
  | "polygonator"
  | "spiralor"
  | "deviator"
  | "accelerator"
  | "alternator"
  | "magnetor"
  | "formulator"
  | "director"
  | "pathor";

export interface Modifier extends HasXY {
  type: ModType;
  r: number;             // rayon d’influence
  str?: number;          // intensité d’attraction
  rot?: number;          // intensité rotationnelle
  falloff?: "linear" | "smoothstep";
  sign?: 1 | -1;
}

export const modifiers: Modifier[] = [];
export const grid = new SpatialHash<Modifier>(64);

// ✅ on garde le plus grand rayon posé pour élargir la recherche spatiale
let maxRadius = 0;
export function getMaxRadius() { return maxRadius; }

// Ajout d’un modificateur avec valeurs par défaut
export function addModifier(m: Partial<Modifier> & HasXY) {
  const def: Modifier = {
    type: "attractor",
    x: m.x,
    y: m.y,
    r: 160,
    str: 0.8,
    rot: 0,
    falloff: "linear",
    sign: 1,
  };
  const obj: Modifier = { ...def, ...m };
  modifiers.push(obj);
  if (obj.r > maxRadius) maxRadius = obj.r;      // 🔸 maj du rayon max global
}

export function clearModifiers() {
  modifiers.length = 0;
  maxRadius = 0;                                  // 🔸 reset du rayon max
}

export function rebuildGrid() {
  grid.clear();
  for (const m of modifiers) grid.insert(m);
  /*grid.clear();
  for (const m of modifiers) grid.insert(m);*/
}

function falloff(d: number, R: number, kind?: Modifier["falloff"]) {
  const t = Math.max(0, Math.min(1, 1 - d / R));
  return kind === "smoothstep" ? t * t * (3 - 2 * t) : t;
}

const EPS = 1e-3;           // seuil de distance ~0
const KICK = 0.35;          // amplitude de la micro-poussée (à ajuster)
const FMAX = 3.0;           // borne de sécurité sur la force locale (optionnelle)
// 🔹 Calcul de la force appliquée par tous les modifiers proches
export function steer(x: number, y: number) {
  let ax = 0, ay = 0;

  for (const m of modifiers) {
    const dx = m.x - x, dy = m.y - y;
    const d2 = dx*dx + dy*dy;
    const d  = Math.sqrt(d2);

    // 1) Si on est "pile" au centre (ou quasi), on injecte un petit bruit directionnel
    if (d < EPS) {
      // bruit proportionnel à l'intensité du mod (attract + rot)
      const s = (Math.abs(m.str ?? 0) + Math.abs(m.rot ?? 0)) || 1;
      const th = Math.random() * Math.PI * 2;
      ax += Math.cos(th) * KICK * s;
      ay += Math.sin(th) * KICK * s;
      continue; // on passe au mod suivant
    }

    // 2) Poids d'atténuation global (jamais 0), R = échelle (pas cutoff)
    const scale = Math.max(1e-6, m.r || 1);
    const xnorm = d / scale;
    // loi douce (jamais nulle) : 1 / (1 + x^2)
    const w = (1 / (1 + xnorm * xnorm)) * (m.sign ?? 1);

    // 3) Direction unitaire sûre (évite division par 0)
    const invd = 1 / d;
    const ux = dx * invd;
    const uy = dy * invd;

    // 4) Contributions, bornées pour éviter une force démesurée très près du centre
    if (m.type === "attractor" || m.str) {
      let s = (m.str ?? 0) * w;
      s = Math.max(-FMAX, Math.min(FMAX, s));
      ax += ux * s;
      ay += uy * s;
    }

    if (m.type === "rotator" || m.rot) {
      let s = (m.rot ?? 0) * w;
      s = Math.max(-FMAX, Math.min(FMAX, s));
      ax += (-uy) * s;  // tangent = rotation de (ux,uy)
      ay += ( ux) * s;
    }
  }

  return { ax, ay };
}