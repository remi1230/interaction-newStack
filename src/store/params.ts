import { create } from "zustand";

export type PlacingType = false | "attractor" | "rotator";

export type StoreState = {
  nb: number;
  speed: number;
  pointRadius: number;
  trailAlpha: number;
  bgColor: number;
  tintColor: number;
  maxFPS: number;
  modRadius: number;
  modStrength: number;
  modRotation: number;
  placing: PlacingType;                 // <-- nouveau
  setParam: (k: keyof StoreState, v: any) => void;
  setPlacing: (p: PlacingType) => void; // <-- nouveau
};

export const useParams = create<StoreState>((set) => ({
  nb: 150,
  speed: 0,
  pointRadius: 1.6,
  trailAlpha: 0.06,
  bgColor: 0x000000,
  tintColor: 0xffffff,
  maxFPS: 60,
  modRadius: 160,
  modStrength: 0.8,
  modRotation: 0.6,
  placing: false,
  setParam: (k, v) => set({ [k]: v } as any),
  setPlacing: (p) => set({ placing: p }),
}));