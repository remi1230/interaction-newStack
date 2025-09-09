// src/components/CanvasStage.tsx
import { useEffect, useRef } from "react";
import { createPixiEngine } from "../engine/pixiEngine";
import { useParams } from "../store/params";

type EngineInstance = Awaited<ReturnType<typeof createPixiEngine>>;

export default function CanvasStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineInstance | null>(null);

  const { placing } = useParams();

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const engine = await createPixiEngine(host);

      if (!isMounted) {
        // Si le composant s’est démonté pendant l’await, on nettoie aussitôt
        engine.dispose?.();
        return;
      }
      engineRef.current = engine;
    })();

    return () => {
      isMounted = false;
      // Nettoyage complet à l’unmount (évite ticker/RAF/listeners fantômes)
      try {
        engineRef.current?.dispose?.();
      } finally {
        engineRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {/* Couche de clic au-dessus du canvas : active uniquement en mode placing */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          cursor: placing ? "crosshair" : "default",
          zIndex: 2,
          // Important : ne pas bloquer les interactions Pixi quand on ne place pas
          pointerEvents: placing ? "auto" : "none",
        }}
      />
    </div>
  );
}