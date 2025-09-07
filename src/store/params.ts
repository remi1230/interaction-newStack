import { create } from "zustand";

export type StoreState = {
  nb: number;
  speed: number;
  pointRadius: number;
  trailAlpha: number;
  bgColor: number;
  tintColor: number;
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
  nb: 150,
  speed: 1.0,
  pointRadius: 1.6,
  trailAlpha: 0.06,
  bgColor: 0x000000,
  tintColor: 0xffffff,
  maxFPS: 60,

  modRadius: 160,
  modStrength: 0.8,
  modRotation: 0.6,

  placing: false,

  // --- init du signal
  clearToken: 0,
  clearCanvas: () => set({ clearToken: get().clearToken + 1 }),

  setParam: (k, v) => set({ [k]: v } as any),
  setPlacing: (v) => set({ placing: v }),
}));