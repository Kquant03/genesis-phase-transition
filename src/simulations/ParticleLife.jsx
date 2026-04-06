import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◆  PARTICLE LIFE  ◆
// ════════════════════════════════════════════════════════════════════
// Asymmetric force matrices between particle types
// After Hunar Ahmad (2022) / Tom Mohr
// Emergent predation, symbiosis, orbital capture, membranes
// ════════════════════════════════════════════════════════════════════

const COLORS = [
  [78, 205, 196],   // teal
  [255, 107, 107],  // coral
  [167, 139, 250],  // purple
  [245, 158, 11],   // amber
  [52, 211, 153],   // emerald
  [236, 72, 153],   // pink
];

function randomMatrix(n) {
  const m = [];
  for (let i = 0; i < n; i++) {
    m[i] = [];
    for (let j = 0; j < n; j++) {
      m[i][j] = Math.random() * 2 - 1; // -1 to 1
    }
  }
  return m;
}

function predatorPreyMatrix() {
  return [
    [0.1, 0.5, -0.3, 0.0],
    [-0.5, 0.1, 0.5, -0.3],
    [0.3, -0.5, 0.1, 0.5],
    [0.0, 0.3, -0.5, 0.1],
  ];
}

function symbiosisMatrix() {
  return [
    [-0.1, 0.6, 0.6, 0.0],
    [0.6, -0.1, 0.0, 0.6],
    [0.6, 0.0, -0.1, 0.6],
    [0.0, 0.6, 0.6, -0.1],
  ];
}

function chaosMatrix() {
  return [
    [0.8, -0.9, 0.3, 0.5],
    [0.4, 0.2, -0.8, 0.7],
    [-0.6, 0.9, 0.1, -0.4],
    [0.3, -0.5, 0.6, -0.2],
  ];
}

const MATRIX_PRESETS = {
  random: { name: "Random", gen: () => randomMatrix(4) },
  predator: { name: "Predator-Prey", gen: predatorPreyMatrix },
  symbiosis: { name: "Symbiosis", gen: symbiosisMatrix },
  chaos: { name: "Chaos", gen: chaosMatrix },
};

function initParticles(n, numTypes, W, H) {
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const types = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = Math.random() * W;
    py[i] = Math.random() * H;
    vx[i] = 0; vy[i] = 0;
    types[i] = Math.floor(Math.random() * numTypes);
  }
  return { px, py, vx, vy, types, n };
}

function stepParticleLife(particles, matrix, W, H, rMax, friction, beta) {
  const { px, py, vx, vy, types, n } = particles;
  for (let i = 0; i < n; i++) {
    let fx = 0, fy = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = px[j] - px[i];
      let dy = py[j] - py[i];
      // Wrap
      if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rMax || dist < 0.01) continue;
      const r = dist / rMax; // normalized 0-1
      const nx = dx / dist, ny = dy / dist;
      let force;
      if (r < beta) {
        // Repulsion zone
        force = r / beta - 1.0;
      } else {
        // Interaction zone
        const a = matrix[types[i]][types[j]];
        force = a * (1.0 - Math.abs(1.0 + beta - 2.0 * r) / (1.0 - beta));
      }
      fx += force * nx;
      fy += force * ny;
    }
    vx[i] = vx[i] * friction + fx * rMax * 0.01;
    vy[i] = vy[i] * friction + fy * rMax * 0.01;
  }
  for (let i = 0; i < n; i++) {
    px[i] += vx[i];
    py[i] += vy[i];
    px[i] = ((px[i] % W) + W) % W;
    py[i] = ((py[i] % H) + H) % H;
  }
}

export default function ParticleLife() {
  const W = 500, H = 500;
  const canvasRef = useRef(null);
  const particlesRef = useRef(null);
  const matrixRef = useRef(randomMatrix(4));
  const animRef = useRef(null);
  const [running, setRunning] = useState(true);
  const [nParticles] = useState(600);
  const [numTypes] = useState(4);
  const [rMax, setRMax] = useState(80);
  const [friction, setFriction] = useState(0.5);
  const [beta, setBeta] = useState(0.3);
  const [matrixPreset, setMatrixPreset] = useState("random");
  const [matrix, setMatrix] = useState(matrixRef.current);
  const [frameCount, setFrameCount] = useState(0);
  const [showTrails, setShowTrails] = useState(true);

  const reset = useCallback(() => {
    particlesRef.current = initParticles(nParticles, numTypes, W, H);
    setFrameCount(0);
  }, [nParticles, numTypes]);

  const newMatrix = useCallback((id) => {
    const gen = MATRIX_PRESETS[id].gen;
    const m = gen();
    matrixRef.current = m;
    setMatrix([...m]);
    setMatrixPreset(id);
    reset();
  }, [reset]);

  useEffect(() => { reset(); }, []);

  useEffect(() => {
    if (!running || !particlesRef.current) return;
    let active = true;
    const loop = () => {
      if (!active) return;
      stepParticleLife(particlesRef.current, matrixRef.current, W, H, rMax, friction, beta);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (showTrails) {
          ctx.fillStyle = "rgba(6,10,18,0.12)";
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = "#060a12";
          ctx.fillRect(0, 0, W, H);
        }
        const p = particlesRef.current;
        for (let i = 0; i < p.n; i++) {
          const col = COLORS[p.types[i] % COLORS.length];
          const speed = Math.sqrt(p.vx[i] * p.vx[i] + p.vy[i] * p.vy[i]);
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, 0.5 + speed * 0.3)})`;
          ctx.beginPath();
          ctx.arc(p.px[i], p.py[i], 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      setFrameCount(f => f + 1);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, rMax, friction, beta, showTrails]);

  return (
    <div style={{
      "--mono": "'JetBrains Mono', monospace",
      padding: "16px 12px", maxWidth: 1050, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#ec4899", fontFamily: "var(--mono)", margin: 0 }}>
          ◆ PARTICLE LIFE
        </h2>
        <div style={{ fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginTop: 4 }}>
          Asymmetric Force Matrices · Emergent Ecology · Ahmad / Mohr
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ width: 240, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 16, flexShrink: 0 }}>
          {/* Matrix presets */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Matrix Preset</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {Object.entries(MATRIX_PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => newMatrix(id)} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: matrixPreset === id ? "1px solid #ec489944" : "1px solid #1a2236",
                background: matrixPreset === id ? "#ec489918" : "#0a0f1a",
                color: matrixPreset === id ? "#ec4899" : "#5a6b8a",
                fontFamily: "var(--mono)",
              }}>{p.name}</button>
            ))}
          </div>

          {/* Interaction matrix display */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>
            Interaction Matrix M[i][j]
          </div>
          <div style={{ marginBottom: 14, padding: 8, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1a2236" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontSize: 7, color: "#3a4b6a", padding: 2 }}></td>
                  {COLORS.slice(0, numTypes).map((c, j) => (
                    <td key={j} style={{ textAlign: "center", padding: 2 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: `rgb(${c[0]},${c[1]},${c[2]})` }} />
                    </td>
                  ))}
                </tr>
                {matrix.slice(0, numTypes).map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: 2 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: `rgb(${COLORS[i][0]},${COLORS[i][1]},${COLORS[i][2]})` }} />
                    </td>
                    {row.slice(0, numTypes).map((v, j) => (
                      <td key={j} style={{
                        textAlign: "center", padding: 2, fontSize: 8,
                        color: v > 0 ? "#4ecdc4" : v < 0 ? "#ff6b6b" : "#5a6b8a",
                        fontFamily: "var(--mono)", fontWeight: 600,
                      }}>{v.toFixed(1)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>RANGE</span>
              <span style={{ fontSize: 12, color: "#ec4899", fontWeight: 600 }}>{rMax}</span>
            </div>
            <input type="range" min={30} max={150} step={5} value={rMax} onChange={e => setRMax(parseInt(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>FRICTION</span>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{friction.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={0.95} step={0.05} value={friction} onChange={e => setFriction(parseFloat(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>REPULSION β</span>
              <span style={{ fontSize: 12, color: "#ff6b6b", fontWeight: 600 }}>{beta.toFixed(2)}</span>
            </div>
            <input type="range" min={0.05} max={0.6} step={0.05} value={beta} onChange={e => setBeta(parseFloat(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
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

          <button onClick={() => setShowTrails(!showTrails)} style={{
            width: "100%", padding: "5px", marginTop: 8, border: "1px solid #1a2236", borderRadius: 4,
            background: showTrails ? "#ec489912" : "#0a0f1a", color: showTrails ? "#ec4899" : "#5a6b8a",
            fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
          }}>{showTrails ? "◆ TRAILS ON" : "◇ TRAILS OFF"}</button>

          <div style={{ marginTop: 10, fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", textAlign: "center" }}>
            {nParticles} particles · {numTypes} types · frame {frameCount}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 10 }}>
          <canvas ref={canvasRef} width={W} height={H} style={{
            borderRadius: 6, display: "block",
            boxShadow: "0 0 40px rgba(236,72,153,0.06)",
          }} />
        </div>
      </div>
    </div>
  );
}
