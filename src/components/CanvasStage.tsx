// src/components/CanvasStage.tsx
import { useEffect, useRef } from "react";
import { createPixiEngine, EngineAPI } from "../engine/pixiEngine";
import { useParams } from "../store/params";

export default function CanvasStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { placing, modRadius, modStrength, modRotation } = useParams();

  useEffect(() => {
    let disposed = false;
    (async () => {
      const engine = await createPixiEngine(hostRef.current!);
      if (disposed) engine.dispose();
    })();
    return () => { disposed = true; };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placing) return;
    const rect = hostRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if (placing === "attractor") {
      EngineAPI.addAttractor({ x, y }, { r: modRadius, str: modStrength });
      console.log("Attractor posé", { x, y, r: modRadius, str: modStrength });
    } else if (placing === "rotator") {
      EngineAPI.addRotator({ x, y }, { r: modRadius, rot: modRotation });
      console.log("Rotator posé", { x, y, r: modRadius, rot: modRotation });
    }
  };

  return (
    <div ref={hostRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* couche de clic au-dessus du canvas */}
      <div
        onPointerDown={onPointerDown}
        style={{ position: "absolute", inset: 0, cursor: placing ? "crosshair" : "default", zIndex: 2 }}
      />
    </div>
  );
}