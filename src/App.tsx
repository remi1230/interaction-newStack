import CanvasStage from "./components/CanvasStage";
import RightPanel from "./components/RightPanel";

export default function App() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <CanvasStage />
      <RightPanel />
    </div>
  );
}