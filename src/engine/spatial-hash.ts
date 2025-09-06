// src/engine/spatial-hash.ts

export type HasXY = { x: number; y: number };

export class SpatialHash<T extends HasXY> {
  public s: number;
  private map: Map<number, T[]>;

  constructor(s: number = 64, map?: Map<number, T[]>) {
    this.s = s;
    this.map = map ?? new Map<number, T[]>();
  }

  private k(cx: number, cy: number): number {
    return ((cx | 0) << 16) ^ (cy | 0);
  }

  clear(): void {
    this.map.clear();
  }

  insert(obj: T): void {
    const cx = (obj.x / this.s) | 0;
    const cy = (obj.y / this.s) | 0;
    const key = this.k(cx, cy);
    let cell = this.map.get(key);
    if (!cell) {
      cell = [];
      this.map.set(key, cell);
    }
    cell.push(obj);
  }

  nearby(x: number, y: number): T[] {
    const cx = (x / this.s) | 0;
    const cy = (y / this.s) | 0;
    const out: T[] = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cell = this.map.get(this.k(cx + i, cy + j));
        if (cell) out.push(...cell);
      }
    }
    return out;
  }

  nearbyRadius(x: number, y: number, R: number): T[] {
    const cx = (x / this.s) | 0;
    const cy = (y / this.s) | 0;
    const n = Math.max(1, Math.ceil(R / this.s)); // nombre de cellules à couvrir
    const out: T[] = [];
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const cell = this.map.get(this.k(cx + i, cy + j));
        if (cell) out.push(...cell);
      }
    }
    return out;
  }
}