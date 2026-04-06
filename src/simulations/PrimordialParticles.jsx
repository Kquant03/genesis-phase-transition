import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◇  PRIMORDIAL PARTICLE SYSTEMS  ◇
// ════════════════════════════════════════════════════════════════════
// After Schmickl et al. (2016) Scientific Reports 6
// "How a life-like system emerges from a simplistic particle motion law"
// ONE equation. TWO parameters. CELLS that divide.
// Δφ_i = α + β · N_i · sign(R_i − L_i)
// ════════════════════════════════════════════════════════════════════

function initParticles(n, W, H) {
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const phi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = Math.random() * W;
    y[i] = Math.random() * H;
    phi[i] = Math.random() * Math.PI * 2;
  }
  return { x, y, phi, n };
}

function stepPPS(particles, W, H, alpha, beta, senseRadius, velocity) {
  const { x, y, phi, n } = particles;
  const alphaDeg = alpha * Math.PI / 180;
  const betaDeg = beta * Math.PI / 180;
  const r2 = senseRadius * senseRadius;

  // Update headings
  for (let i = 0; i < n; i++) {
    let nCount = 0, leftCount = 0, rightCount = 0;
    const cosP = Math.cos(phi[i]), sinP = Math.sin(phi[i]);

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = x[j] - x[i];
      let dy = y[j] - y[i];
      // Wrap
      if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;

      if (dx * dx + dy * dy <= r2) {
        nCount++;
        // Cross product determines left/right
        const cross = cosP * dy - sinP * dx;
        if (cross > 0) rightCount++;
        else leftCount++;
      }
    }

    const sign = rightCount > leftCount ? 1 : rightCount < leftCount ? -1 : 0;
    phi[i] += alphaDeg + betaDeg * nCount * sign;
    // Normalize
    phi[i] = phi[i] % (Math.PI * 2);
  }

  // Update positions
  for (let i = 0; i < n; i++) {
    x[i] += velocity * Math.cos(phi[i]);
    y[i] += velocity * Math.sin(phi[i]);
    x[i] = ((x[i] % W) + W) % W;
    y[i] = ((y[i] % H) + H) % H;
  }
}

const PRESETS = {
  cells: { name: "Cell Life", alpha: 180, beta: 17, sense: 5, vel: 0.67, n: 800, desc: "Classic cell formation & division" },
  worms: { name: "Worms", alpha: 90, beta: 12, sense: 8, vel: 0.8, n: 600, desc: "Elongated worm-like structures" },
  swirls: { name: "Swirls", alpha: 120, beta: 20, sense: 6, vel: 0.5, n: 700, desc: "Rotating vortex patterns" },
  crystals: { name: "Crystals", alpha: 60, beta: 8, sense: 10, vel: 0.4, n: 500, desc: "Rigid crystalline formations" },
  gas: { name: "Gas", alpha: 180, beta: 30, sense: 4, vel: 1.0, n: 600, desc: "Diffuse gas-like behavior" },
};

export default function PrimordialParticles() {
  const W = 500, H = 500;
  const canvasRef = useRef(null);
  const particlesRef = useRef(null);
  const animRef = useRef(null);
  const [running, setRunning] = useState(true);
  const [alpha, setAlpha] = useState(180);
  const [beta, setBeta] = useState(17);
  const [senseRadius, setSenseRadius] = useState(5);
  const [velocity, setVelocity] = useState(0.67);
  const [nParticles, setNParticles] = useState(800);
  const [preset, setPreset] = useState("cells");
  const [frameCount, setFrameCount] = useState(0);
  const [colorMode, setColorMode] = useState("neighbors");
  const [showTrails, setShowTrails] = useState(true);

  const reset = useCallback(() => {
    particlesRef.current = initParticles(nParticles, W, H);
    setFrameCount(0);
  }, [nParticles]);

  const loadPreset = useCallback((id) => {
    const p = PRESETS[id];
    setPreset(id);
    setAlpha(p.alpha); setBeta(p.beta);
    setSenseRadius(p.sense); setVelocity(p.vel);
    setNParticles(p.n);
    particlesRef.current = initParticles(p.n, W, H);
    setFrameCount(0);
  }, []);

  useEffect(() => { reset(); }, []);

  useEffect(() => {
    if (!running || !particlesRef.current) return;
    let active = true;
    const loop = () => {
      if (!active) return;
      stepPPS(particlesRef.current, W, H, alpha, beta, senseRadius, velocity);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (showTrails) {
          ctx.fillStyle = "rgba(6,10,18,0.18)";
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = "#060a12";
          ctx.fillRect(0, 0, W, H);
        }
        const p = particlesRef.current;
        const r2 = senseRadius * senseRadius;

        // Precompute neighbor counts for coloring
        const nCounts = new Uint16Array(p.n);
        if (colorMode === "neighbors") {
          for (let i = 0; i < p.n; i++) {
            let count = 0;
            for (let j = 0; j < p.n; j++) {
              if (i === j) continue;
              let dx = p.x[j] - p.x[i], dy = p.y[j] - p.y[i];
              if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
              if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
              if (dx * dx + dy * dy <= r2) count++;
            }
            nCounts[i] = count;
          }
        }

        for (let i = 0; i < p.n; i++) {
          let r, g, b, a = 0.85;
          if (colorMode === "neighbors") {
            const t = Math.min(1, nCounts[i] / 20);
            if (t < 0.33) { r = 52; g = 211; b = 153; } // emerald (sparse)
            else if (t < 0.66) { r = 78; g = 205; b = 196; } // teal (medium)
            else { r = 245; g = 158; b = 11; } // amber (dense)
            a = 0.4 + t * 0.5;
          } else if (colorMode === "heading") {
            const hue = (p.phi[i] / (Math.PI * 2)) * 360;
            const h = hue / 60;
            const f = h - Math.floor(h);
            const v = 200;
            switch (Math.floor(h) % 6) {
              case 0: r = v; g = Math.floor(v * f); b = 0; break;
              case 1: r = Math.floor(v * (1 - f)); g = v; b = 0; break;
              case 2: r = 0; g = v; b = Math.floor(v * f); break;
              case 3: r = 0; g = Math.floor(v * (1 - f)); b = v; break;
              case 4: r = Math.floor(v * f); g = 0; b = v; break;
              default: r = v; g = 0; b = Math.floor(v * (1 - f));
            }
          } else {
            r = 52; g = 211; b = 153; // solid emerald
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.beginPath();
          ctx.arc(p.x[i], p.y[i], 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      setFrameCount(f => f + 1);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, alpha, beta, senseRadius, velocity, colorMode, showTrails]);

  return (
    <div style={{
      "--mono": "'JetBrains Mono', monospace",
      padding: "16px 12px", maxWidth: 1000, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#34d399", fontFamily: "var(--mono)", margin: 0 }}>
          ◇ PRIMORDIAL PARTICLE SYSTEMS
        </h2>
        <div style={{ fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginTop: 4 }}>
          Schmickl et al. (2016) · One equation · Two parameters · Life from turning
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ width: 220, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Presets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "3px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: preset === id ? "1px solid #34d39944" : "1px solid #1a2236",
                background: preset === id ? "#34d39918" : "#0a0f1a",
                color: preset === id ? "#34d399" : "#5a6b8a",
                fontFamily: "var(--mono)",
              }}>{p.name}</button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>α (BASE TURN)</span>
              <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>{alpha}°</span>
            </div>
            <input type="range" min={0} max={360} step={5} value={alpha} onChange={e => setAlpha(parseInt(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
            <div style={{ fontSize: 7, color: "#3a4b6a", marginTop: 2 }}>180° = isolated oscillation</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>β (NEIGHBOR TURN)</span>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{beta}°</span>
            </div>
            <input type="range" min={1} max={40} step={1} value={beta} onChange={e => setBeta(parseInt(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
            <div style={{ fontSize: 7, color: "#3a4b6a", marginTop: 2 }}>17° = "Region of Life"</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>SENSE RADIUS</span>
              <span style={{ fontSize: 12, color: "#22d3ee", fontWeight: 600 }}>{senseRadius}</span>
            </div>
            <input type="range" min={2} max={15} step={1} value={senseRadius} onChange={e => setSenseRadius(parseInt(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
              <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em" }}>VELOCITY</span>
              <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>{velocity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={2.0} step={0.05} value={velocity} onChange={e => setVelocity(parseFloat(e.target.value))}
              style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, cursor: "pointer" }} />
          </div>

          {/* Color modes */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {[["neighbors", "Density"], ["heading", "Heading"], ["solid", "Solid"]].map(([m, label]) => (
              <button key={m} onClick={() => setColorMode(m)} style={{
                flex: 1, padding: "4px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: colorMode === m ? "1px solid #34d39944" : "1px solid #1a2236",
                background: colorMode === m ? "#34d39918" : "#0a0f1a",
                color: colorMode === m ? "#34d399" : "#5a6b8a",
                fontFamily: "var(--mono)", textTransform: "uppercase",
              }}>{label}</button>
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

          <button onClick={() => setShowTrails(!showTrails)} style={{
            width: "100%", padding: "5px", marginTop: 8, border: "1px solid #1a2236", borderRadius: 4,
            background: showTrails ? "#34d39912" : "#0a0f1a", color: showTrails ? "#34d399" : "#5a6b8a",
            fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
          }}>{showTrails ? "◇ TRAILS ON" : "◇ TRAILS OFF"}</button>

          <div style={{ marginTop: 10, fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", textAlign: "center" }}>
            {nParticles} particles · frame {frameCount}
          </div>

          <div style={{ marginTop: 12, padding: 10, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>
              The One Equation
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.6, color: "#34d399", textAlign: "center", fontFamily: "var(--mono)" }}>
              Δφᵢ = α + β·Nᵢ·sign(Rᵢ − Lᵢ)
            </div>
            <div style={{ fontSize: 8, lineHeight: 1.5, color: "#3a4b6a", marginTop: 6 }}>
              α = fixed rotation per step<br />
              β = neighbor-proportional rotation<br />
              N = neighbors within sense radius<br />
              R,L = counts in right/left semicircles<br />
              <span style={{ color: "#5a6b8a", marginTop: 4, display: "block" }}>
                From this alone: cells, division, spores, migration, repair, logistic population dynamics.
              </span>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 10 }}>
          <canvas ref={canvasRef} width={W} height={H} style={{
            borderRadius: 6, display: "block",
            boxShadow: "0 0 40px rgba(52,211,153,0.06)",
          }} />
        </div>
      </div>
    </div>
  );
}
