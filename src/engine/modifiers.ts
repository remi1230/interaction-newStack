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
}

function falloff(d: number, R: number, kind?: Modifier["falloff"]) {
  const t = Math.max(0, Math.min(1, 1 - d / R));
  return kind === "smoothstep" ? t * t * (3 - 2 * t) : t;
}

// 🔹 Calcul de la force appliquée par tous les modifiers proches
export function steer(x: number, y: number) {
  let ax = 0, ay = 0;

  // ✅ recherche élargie en fonction du plus grand rayon posé
  // (si aucun mod, on met 1 pour éviter n=0)
  const near = (grid as any).nearbyRadius
    ? (grid as any).nearbyRadius(x, y, Math.max(1, maxRadius || 1))
    : grid.nearby(x, y); // fallback si nearbyRadius n’existe pas encore

  for (const m of near as Modifier[]) {
    const dx = m.x - x, dy = m.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1) continue;
    const d = Math.sqrt(d2);
    if (d > m.r) continue;

    const w = falloff(d, m.r, m.falloff) * (m.sign ?? 1);

    // Attraction
    if (m.type === "attractor" || m.str) {
      const s = (m.str ?? 0) * w;
      ax += (dx / d) * s;
      ay += (dy / d) * s;
    }

    // Rotation (vortex)
    if (m.type === "rotator" || m.rot) {
      const s = (m.rot ?? 0) * w;
      ax += (-dy / d) * s;
      ay += (dx / d) * s;
    }

    // 👉 Ici tu pourras ajouter les autres types :
    // - polygonator
    // - spiralor
    // - deviator...
    // En branchant une formule spécifique pour chacun.
  }

  return { ax, ay };
}