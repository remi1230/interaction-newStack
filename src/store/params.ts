import { create } from "zustand";

export type StoreState = {
  nb: number;
  maxModifiers: number;
  speed: number;
  pointRadius: number;
  trailAlpha: number;
  bgColor: number;
  tintColor: number;
  lightColor: number;
  saturationColor: number;
  maxFPS: number;

  // Modifiers (UI)
  modRadius: number;
  modStrength: number;
  modRotation: number;

  // Placement (UI)
  placing: false | "attractor" | "rotator";

  // --- ✨ Signal d’effacement ---
  clearToken: number;          // change de valeur pour déclencher un clear 1-frame
  clearCanvas: () => void;     // action pour l’UI

  setParam: (k: keyof StoreState, v: any) => void;
  setPlacing: (v: StoreState["placing"]) => void;
};

export const useParams = create<StoreState>((set, get) => ({
  nb: 1500,
  maxModifiers: 256,
  speed: 3.0,
  pointRadius: 3.0,
  trailAlpha: 0.06,
  bgColor: 0x000000,
  tintColor: 0xffffff,
  lightColor: 0.78,
  saturationColor: 0.14,
  maxFPS: 60,

  modRadius: 160,
  modStrength: 0.8,
  modRotation: 0.6,

  placing: "attractor",

  // --- init du signal
  clearToken: 0,
  clearCanvas: () => set({ clearToken: get().clearToken + 1 }),

  setParam: (k, v) => set({ [k]: v } as any),
  setPlacing: (v) => set({ placing: v }),
}));