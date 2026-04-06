import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◎  GRAY-SCOTT REACTION-DIFFUSION  ◎
// ════════════════════════════════════════════════════════════════════
// ∂u/∂t = D_u∇²u − uv² + F(1−u)
// ∂v/∂t = D_v∇²v + uv² − (F+k)v
// After Pearson (1993) "Complex patterns in a simple system"
// ════════════════════════════════════════════════════════════════════

const PRESETS = {
  mitosis:  { name: "Mitosis", F: 0.0367, k: 0.0649, desc: "Self-replicating spots" },
  coral:    { name: "Coral", F: 0.0545, k: 0.062, desc: "Labyrinthine/fingerprint" },
  spirals:  { name: "Spirals", F: 0.018, k: 0.051, desc: "Rotating spiral waves" },
  worms:    { name: "Worms", F: 0.058, k: 0.065, desc: "Moving worm patterns" },
  solitons: { name: "Solitons", F: 0.030, k: 0.055, desc: "Pulsating spots" },
  uskate:   { name: "U-Skate", F: 0.062, k: 0.0609, desc: "Gliding solitons" },
  waves:    { name: "Waves", F: 0.014, k: 0.054, desc: "Expanding wavefronts" },
  bubbles:  { name: "Bubbles", F: 0.098, k: 0.057, desc: "Negative bubbles" },
};

const DU = 0.2097, DV = 0.105;

function createFields(N) {
  const u = new Float32Array(N * N).fill(1.0);
  const v = new Float32Array(N * N).fill(0.0);
  // Seed: random square patches
  const cx = N / 2, cy = N / 2;
  for (let i = 0; i < 5; i++) {
    const sx = cx + (Math.random() - 0.5) * N * 0.3;
    const sy = cy + (Math.random() - 0.5) * N * 0.3;
    const sz = 3 + Math.random() * 8;
    for (let x = Math.floor(sx - sz); x < sx + sz; x++) {
      for (let y = Math.floor(sy - sz); y < sy + sz; y++) {
        const wx = ((x % N) + N) % N;
        const wy = ((y % N) + N) % N;
        const idx = wx * N + wy;
        u[idx] = 0.5 + Math.random() * 0.1;
        v[idx] = 0.25 + Math.random() * 0.1;
      }
    }
  }
  return { u, v, u2: new Float32Array(N * N), v2: new Float32Array(N * N) };
}

function stepRD(fields, N, F, k, iterations) {
  let { u, v, u2, v2 } = fields;
  for (let iter = 0; iter < iterations; iter++) {
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const idx = x * N + y;
        const xp = ((x + 1) % N) * N + y;
        const xm = ((x - 1 + N) % N) * N + y;
        const yp = x * N + (y + 1) % N;
        const ym = x * N + ((y - 1 + N) % N);
        const lap_u = u[xp] + u[xm] + u[yp] + u[ym] - 4.0 * u[idx];
        const lap_v = v[xp] + v[xm] + v[yp] + v[ym] - 4.0 * v[idx];
        const uvv = u[idx] * v[idx] * v[idx];
        u2[idx] = u[idx] + DU * lap_u - uvv + F * (1.0 - u[idx]);
        v2[idx] = v[idx] + DV * lap_v + uvv - (F + k) * v[idx];
        u2[idx] = Math.max(0, Math.min(1, u2[idx]));
        v2[idx] = Math.max(0, Math.min(1, v2[idx]));
      }
    }
    // Swap
    [fields.u, fields.u2] = [fields.u2, fields.u];
    [fields.v, fields.v2] = [fields.v2, fields.v];
    u = fields.u; v = fields.v; u2 = fields.u2; v2 = fields.v2;
  }
}

function renderFields(ctx, fields, N, canvasSize, colorMode) {
  const imgData = ctx.createImageData(canvasSize, canvasSize);
  const data = imgData.data;
  const scale = canvasSize / N;
  const { u, v } = fields;

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      const idx = x * N + y;
      const uv = u[idx], vv = v[idx];
      let r, g, b;

      if (colorMode === "chemical") {
        // u = blue channel, v = warm
        r = Math.floor(vv * 280);
        g = Math.floor(vv * 120 + (1 - uv) * 40);
        b = Math.floor(uv * 180 + 20);
      } else if (colorMode === "heat") {
        const t = vv;
        if (t < 0.25) { r = 10; g = 10 + t * 400; b = 40 + t * 600; }
        else if (t < 0.5) { r = (t - 0.25) * 800; g = 110; b = 190 - (t - 0.25) * 400; }
        else { r = 200 + (t - 0.5) * 110; g = 110 - (t - 0.5) * 180; b = 40 - t * 60; }
      } else {
        // Monochrome v
        const lum = Math.floor(vv * 255);
        r = lum; g = lum; b = lum;
      }

      for (let dx = 0; dx < scale; dx++) {
        for (let dy = 0; dy < scale; dy++) {
          const px = Math.floor(y * scale + dy);
          const py = Math.floor(x * scale + dx);
          if (px < canvasSize && py < canvasSize) {
            const pi = (py * canvasSize + px) * 4;
            data[pi] = Math.max(0, Math.min(255, r));
            data[pi + 1] = Math.max(0, Math.min(255, g));
            data[pi + 2] = Math.max(0, Math.min(255, b));
            data[pi + 3] = 255;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export default function GrayScottRD() {
  const N = 200;
  const CANVAS = 500;
  const canvasRef = useRef(null);
  const fieldsRef = useRef(null);
  const animRef = useRef(null);
  const [running, setRunning] = useState(true);
  const [F, setF] = useState(0.0367);
  const [k, setK] = useState(0.0649);
  const [speed, setSpeed] = useState(8);
  const [preset, setPreset] = useState("mitosis");
  const [colorMode, setColorMode] = useState("chemical");
  const [stepCount, setStepCount] = useState(0);
  const [painting, setPainting] = useState(false);

  const reset = useCallback(() => {
    fieldsRef.current = createFields(N);
    setStepCount(0);
  }, []);

  useEffect(() => { reset(); }, []);

  const loadPreset = useCallback((id) => {
    const p = PRESETS[id];
    setPreset(id);
    setF(p.F);
    setK(p.k);
    fieldsRef.current = createFields(N);
    setStepCount(0);
  }, []);

  // Paint seed on click/drag
  const handleCanvasInteraction = useCallback((e) => {
    if (!fieldsRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = N / CANVAS;
    const mx = Math.floor((e.clientX - rect.left) * scale);
    const my = Math.floor((e.clientY - rect.top) * scale);
    const r = 5;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = ((mx + dx) % N + N) % N;
        const y = ((my + dy) % N + N) % N;
        const idx = x * N + y;
        fieldsRef.current.u[idx] = 0.5;
        fieldsRef.current.v[idx] = 0.25;
      }
    }
  }, []);

  useEffect(() => {
    if (!running || !fieldsRef.current) return;
    let active = true;
    const loop = () => {
      if (!active) return;
      stepRD(fieldsRef.current, N, F, k, speed);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) renderFields(ctx, fieldsRef.current, N, CANVAS, colorMode);
      setStepCount(s => s + speed);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, F, k, speed, colorMode]);

  return (
    <div style={{
      "--mono": "'JetBrains Mono', monospace",
      padding: "16px 12px", maxWidth: 1000, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#a78bfa", fontFamily: "var(--mono)", margin: 0 }}>
          ◎ GRAY-SCOTT REACTION-DIFFUSION
        </h2>
        <div style={{ fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginTop: 4 }}>
          Pearson (1993) · D_u={DU} · D_v={DV} · Click to seed
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ width: 220, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Pearson Classification</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "3px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: preset === id ? "1px solid #a78bfa44" : "1px solid #1a2236",
                background: preset === id ? "#a78bfa18" : "#0a0f1a",
                color: preset === id ? "#a78bfa" : "#5a6b8a",
                fontFamily: "var(--mono)",
              }}>{p.name}</button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>FEED RATE F</span>
              <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>{F.toFixed(4)}</span>
            </div>
            <input type="range" min={0.01} max={0.1} step={0.0001} value={F} onChange={e => setF(parseFloat(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>KILL RATE k</span>
              <span style={{ fontSize: 12, color: "#22d3ee", fontWeight: 600 }}>{k.toFixed(4)}</span>
            </div>
            <input type="range" min={0.04} max={0.07} step={0.0001} value={k} onChange={e => setK(parseFloat(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>SPEED</span>
              <span style={{ fontSize: 12, color: "#5a6b8a", fontWeight: 600 }}>{speed}×</span>
            </div>
            <input type="range" min={1} max={20} step={1} value={speed} onChange={e => setSpeed(parseInt(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          {/* Color mode */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {["chemical", "heat", "mono"].map(m => (
              <button key={m} onClick={() => setColorMode(m)} style={{
                flex: 1, padding: "4px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: colorMode === m ? "1px solid #a78bfa44" : "1px solid #1a2236",
                background: colorMode === m ? "#a78bfa18" : "#0a0f1a",
                color: colorMode === m ? "#a78bfa" : "#5a6b8a",
                fontFamily: "var(--mono)", textTransform: "uppercase",
              }}>{m}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setRunning(!running)} style={{
              flex: 1, padding: "7px", border: "1px solid #1a2236", borderRadius: 5,
              background: running ? "#dc262618" : "#4ecdc418", color: running ? "#f87171" : "#4ecdc4",
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{running ? "PAUSE" : "RUN"}</button>
            <button onClick={reset} style={{
              flex: 1, padding: "7px", border: "1px solid #1a2236", borderRadius: 5,
              background: "#0a0f1a", color: "#5a6b8a",
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
            }}>RESET</button>
          </div>

          <div style={{ marginTop: 10, fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", textAlign: "center" }}>
            {N}² grid · step {stepCount.toLocaleString()}
          </div>

          <div style={{ marginTop: 12, padding: 10, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>
              Gray-Scott Equations
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.6, color: "#3a4b6a" }}>
              ∂u/∂t = D_u∇²u − uv² + F(1−u)<br />
              ∂v/∂t = D_v∇²v + uv² − (F+k)v<br />
              <span style={{ fontSize: 8, marginTop: 4, display: "block" }}>
                F controls feed rate of u substrate.<br />
                k controls removal rate of v catalyst.
              </span>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 10 }}>
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            style={{
              borderRadius: 6, display: "block", cursor: "crosshair",
              boxShadow: "0 0 40px rgba(167,139,250,0.06)",
              imageRendering: "pixelated",
            }}
            onMouseDown={(e) => { setPainting(true); handleCanvasInteraction(e); }}
            onMouseMove={(e) => { if (painting) handleCanvasInteraction(e); }}
            onMouseUp={() => setPainting(false)}
            onMouseLeave={() => setPainting(false)}
          />
        </div>
      </div>
    </div>
  );
}
