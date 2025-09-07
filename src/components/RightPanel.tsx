import { useParams } from "../store/params";

export default function RightPanel() {
  const {
    nb, speed, pointRadius, trailAlpha, bgColor, tintColor,
    modRadius, modStrength, modRotation,
    placing, setParam, setPlacing, clearCanvas
  } = useParams();

  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        color: "#eee",
        background: "#111",
        padding: "12px 16px",
        fontFamily: "ui-sans-serif",
        overflowY: "auto"
      }}
    >
      <h3 style={{ marginTop: 0 }}>Paramètres</h3>

      <label>Nb avatars: {nb}</label>
      <input
        type="range"
        min={1}
        max={5000}
        value={nb}
        onChange={(e) => setParam("nb", +e.target.value)}
      />

      <label>Vitesse: {speed.toFixed(2)}</label>
      <input
        type="range"
        min={0}
        max={5}
        step={0.01}
        value={speed}
        onChange={(e) => setParam("speed", +e.target.value)}
      />

      <label>Rayon point: {pointRadius.toFixed(1)}</label>
      <input
        type="range"
        min={0.2}
        max={6}
        step={0.1}
        value={pointRadius}
        onChange={(e) => setParam("pointRadius", +e.target.value)}
      />

      <label>Trail alpha: {trailAlpha.toFixed(2)}</label>
      <input
        type="range"
        min={0.0}
        max={0.3}
        step={0.01}
        value={trailAlpha}
        onChange={(e) => setParam("trailAlpha", +e.target.value)}
      />

      <hr />

      <h4>Pose de modifiers</h4>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <label>
          <input
            type="radio"
            name="placing"
            checked={placing === false}
            onChange={() => setPlacing(false)}
          />{" "}
          Aucun
        </label>
        <label>
          <input
            type="radio"
            name="placing"
            checked={placing === "attractor"}
            onChange={() => setPlacing("attractor")}
          />{" "}
          Attractor
        </label>
        <label>
          <input
            type="radio"
            name="placing"
            checked={placing === "rotator"}
            onChange={() => setPlacing("rotator")}
          />{" "}
          Rotator
        </label>
      </div>

      <label>Rayon (R): {modRadius}</label>
      <input
        type="range"
        min={10}
        max={600}
        step={1}
        value={modRadius}
        onChange={(e) => setParam("modRadius", +e.target.value)}
      />

      <label>Force attract: {modStrength.toFixed(2)}</label>
      <input
        type="range"
        min={-3}
        max={7}
        step={0.01}
        value={modStrength}
        onChange={(e) => setParam("modStrength", +e.target.value)}
      />

      <label>Force rotation: {modRotation.toFixed(2)}</label>
      <input
        type="range"
        min={-3}
        max={3}
        step={0.01}
        value={modRotation}
        onChange={(e) => setParam("modRotation", +e.target.value)}
      />

      <hr />

      <label>Tint</label>
      <input
        type="color"
        value={hex(tintColor)}
        onChange={(e) => setParam("tintColor", parseInt(e.target.value.slice(1), 16))}
      />

      <label>Fond</label>
      <input
        type="color"
        value={hex(bgColor)}
        onChange={(e) => setParam("bgColor", parseInt(e.target.value.slice(1), 16))}
      />

      <hr />
      <button onClick={clearCanvas}>Effacer le canvas</button>
    </aside>
  );
}