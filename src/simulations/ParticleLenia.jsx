import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◉  PARTICLE LENIA  ◉
// ════════════════════════════════════════════════════════════════════
// After Mordvintsev, Niklasson, Randazzo (Google Research, 2022)
// Gaussian shell kernel · Gradient-based motion · Short-range repulsion
// Multi-species ecology with asymmetric interactions
// ════════════════════════════════════════════════════════════════════

const PRESETS = {
  orbium: { name: "Orbium (Glider)", mu_k: 4.0, sigma_k: 1.0, w_k: 0.022, mu_g: 0.6, sigma_g: 0.15, c_rep: 1.0, n: 200, species: 1 },
  mushroom: { name: "Mushroom", mu_k: 4.3, sigma_k: 1.1, w_k: 0.020, mu_g: 0.23, sigma_g: 0.06, c_rep: 1.0, n: 300, species: 1 },
  swarm: { name: "Swarm", mu_k: 2.75, sigma_k: 1.25, w_k: 0.026, mu_g: 0.7, sigma_g: 0.167, c_rep: 1.0, n: 400, species: 1 },
  multispecies: { name: "Multi-Species", mu_k: 3.5, sigma_k: 1.0, w_k: 0.024, mu_g: 0.5, sigma_g: 0.12, c_rep: 1.0, n: 500, species: 3 },
};

const SPECIES_COLORS = [
  [78, 205, 196],   // teal
  [255, 107, 107],  // coral
  [167, 139, 250],  // purple
  [245, 158, 11],   // amber
  [52, 211, 153],   // emerald
];

function gaussianShellKernel(r, mu, sigma, w) {
  return w * Math.exp(-((r - mu) * (r - mu)) / (2 * sigma * sigma));
}

function growthFunction(u, mu, sigma) {
  return 2.0 * Math.exp(-((u - mu) * (u - mu)) / (2 * sigma * sigma)) - 1.0;
}

function initParticles(n, W, H, numSpecies) {
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const species = new Uint8Array(n);
  // Cluster spawn
  const cx = W * 0.3 + Math.random() * W * 0.4;
  const cy = H * 0.3 + Math.random() * H * 0.4;
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * Math.min(W, H) * 0.15;
    px[i] = cx + Math.cos(angle) * rad;
    py[i] = cy + Math.sin(angle) * rad;
    vx[i] = 0; vy[i] = 0;
    species[i] = Math.floor(Math.random() * numSpecies);
  }
  return { px, py, vx, vy, species, n };
}

function step(particles, params, W, H, dt) {
  const { px, py, vx, vy, species, n } = particles;
  const { mu_k, sigma_k, w_k, mu_g, sigma_g, c_rep } = params;
  const maxR = mu_k + 3 * sigma_k;

  for (let i = 0; i < n; i++) {
    let fx = 0, fy = 0;
    let U = 0; // field value at particle i

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = px[j] - px[i];
      let dy = py[j] - py[i];
      // Wrap
      if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01 || dist > maxR + 2) continue;
      const nx = dx / dist, ny = dy / dist;

      // Kernel contribution to field
      const K = gaussianShellKernel(dist, mu_k, sigma_k, w_k);
      U += K;

      // Repulsion
      if (dist < 1.0) {
        const rep = c_rep * (1.0 - dist);
        fx -= rep * nx;
        fy -= rep * ny;
      }

      // Kernel gradient for growth-field gradient ascent
      const dK_dr = K * (-(dist - mu_k)) / (sigma_k * sigma_k);
      const G = growthFunction(U, mu_g, sigma_g);
      // Approximate: move toward higher growth
      fx += dK_dr * nx * 0.5;
      fy += dK_dr * ny * 0.5;
    }

    // Growth-based force (simplified gradient ascent)
    const G = growthFunction(U, mu_g, sigma_g);
    vx[i] = vx[i] * 0.1 + fx * dt + G * vx[i] * 0.01;
    vy[i] = vy[i] * 0.1 + fy * dt + G * vy[i] * 0.01;

    // Clamp velocity
    const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
    if (speed > 2.0) {
      vx[i] = (vx[i] / speed) * 2.0;
      vy[i] = (vy[i] / speed) * 2.0;
    }
  }

  // Update positions
  for (let i = 0; i < n; i++) {
    px[i] += vx[i] * dt;
    py[i] += vy[i] * dt;
    // Wrap
    px[i] = ((px[i] % W) + W) % W;
    py[i] = ((py[i] % H) + H) % H;
  }
}

function Slider({ label, value, onChange, min, max, step: s, color, desc }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 12, color: color || "#d4dae8", fontWeight: 600 }}>{typeof value === "number" ? value.toFixed(3) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={s} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, outline: "none", cursor: "pointer" }} />
      {desc && <div style={{ fontSize: 8, color: "#3a4b6a", marginTop: 2 }}>{desc}</div>}
    </div>
  );
}

export default function ParticleLenia() {
  const W = 500, H = 500;
  const canvasRef = useRef(null);
  const particlesRef = useRef(null);
  const animRef = useRef(null);
  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("orbium");
  const [mu_k, setMuK] = useState(4.0);
  const [sigma_k, setSigmaK] = useState(1.0);
  const [w_k, setWK] = useState(0.022);
  const [mu_g, setMuG] = useState(0.6);
  const [sigma_g, setSigmaG] = useState(0.15);
  const [c_rep, setCRep] = useState(1.0);
  const [nParticles, setNParticles] = useState(200);
  const [numSpecies, setNumSpecies] = useState(1);
  const [frameCount, setFrameCount] = useState(0);
  const [showTrails, setShowTrails] = useState(true);

  const reset = useCallback(() => {
    particlesRef.current = initParticles(nParticles, W, H, numSpecies);
    setFrameCount(0);
  }, [nParticles, numSpecies]);

  const loadPreset = useCallback((id) => {
    const p = PRESETS[id];
    setPreset(id);
    setMuK(p.mu_k); setSigmaK(p.sigma_k); setWK(p.w_k);
    setMuG(p.mu_g); setSigmaG(p.sigma_g); setCRep(p.c_rep);
    setNParticles(p.n); setNumSpecies(p.species);
    particlesRef.current = initParticles(p.n, W, H, p.species);
    setFrameCount(0);
  }, []);

  useEffect(() => { reset(); }, []);

  useEffect(() => {
    if (!running || !particlesRef.current) return;
    let active = true;
    const loop = () => {
      if (!active) return;
      const params = { mu_k, sigma_k, w_k, mu_g, sigma_g, c_rep };
      step(particlesRef.current, params, W, H, 0.5);

      // Render
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (showTrails) {
          ctx.fillStyle = "rgba(6,10,18,0.15)";
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = "#060a12";
          ctx.fillRect(0, 0, W, H);
        }
        const p = particlesRef.current;
        for (let i = 0; i < p.n; i++) {
          const col = SPECIES_COLORS[p.species[i] % SPECIES_COLORS.length];
          const speed = Math.sqrt(p.vx[i] * p.vx[i] + p.vy[i] * p.vy[i]);
          const alpha = Math.min(1.0, 0.4 + speed * 0.5);
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
          ctx.beginPath();
          ctx.arc(p.px[i], p.py[i], 2 + speed * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // Glow
          if (speed > 0.5) {
            ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.15})`;
            ctx.beginPath();
            ctx.arc(p.px[i], p.py[i], 5 + speed, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      setFrameCount(f => f + 1);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, mu_k, sigma_k, w_k, mu_g, sigma_g, c_rep, showTrails]);

  return (
    <div style={{
      "--mono": "'JetBrains Mono', monospace",
      padding: "16px 12px", maxWidth: 1000, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#f59e0b", fontFamily: "var(--mono)", margin: 0 }}>
          ◉ PARTICLE LENIA
        </h2>
        <div style={{ fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginTop: 4 }}>
          Mordvintsev, Niklasson & Randazzo (2022) · Gaussian Shell Kernel · Gradient Motion
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Controls */}
        <div style={{ width: 220, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 16, flexShrink: 0 }}>
          {/* Presets */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Presets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: preset === id ? "1px solid #f59e0b44" : "1px solid #1a2236",
                background: preset === id ? "#f59e0b18" : "#0a0f1a",
                color: preset === id ? "#f59e0b" : "#5a6b8a",
                fontFamily: "var(--mono)", letterSpacing: "0.04em",
              }}>{p.name}</button>
            ))}
          </div>

          <Slider label="Kernel μ" value={mu_k} onChange={setMuK} min={1} max={8} step={0.1} color="#f59e0b" desc="Peak radius of shell kernel" />
          <Slider label="Kernel σ" value={sigma_k} onChange={setSigmaK} min={0.1} max={3} step={0.05} color="#f59e0b" desc="Width of shell kernel" />
          <Slider label="Kernel w" value={w_k} onChange={setWK} min={0.001} max={0.05} step={0.001} color="#f59e0b" desc="Kernel amplitude" />
          <Slider label="Growth μ" value={mu_g} onChange={setMuG} min={0.05} max={1.0} step={0.01} color="#22d3ee" desc="Optimal field density" />
          <Slider label="Growth σ" value={sigma_g} onChange={setSigmaG} min={0.01} max={0.3} step={0.005} color="#22d3ee" desc="Growth function width" />
          <Slider label="Repulsion" value={c_rep} onChange={setCRep} min={0} max={3} step={0.1} color="#ff6b6b" desc="Short-range repulsion" />

          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
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
            background: showTrails ? "#f59e0b12" : "#0a0f1a", color: showTrails ? "#f59e0b" : "#5a6b8a",
            fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
          }}>{showTrails ? "◉ TRAILS ON" : "◯ TRAILS OFF"}</button>

          <div style={{ marginTop: 10, fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", textAlign: "center" }}>
            {nParticles} particles · frame {frameCount}
          </div>

          {/* Theory */}
          <div style={{ marginTop: 12, padding: 10, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>
              Particle Lenia Formulation
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.6, color: "#3a4b6a" }}>
              K(r) = w·exp(−(r−μ_K)²/2σ_K²)<br />
              U(x) = Σᵢ K(‖x − pᵢ‖)<br />
              G(u) = 2·exp(−(u−μ_G)²/2σ_G²) − 1<br />
              dp/dt = −∇E = ∇G(U) − ∇R
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 10 }}>
          <canvas ref={canvasRef} width={W} height={H} style={{
            borderRadius: 6, display: "block",
            boxShadow: "0 0 40px rgba(245,158,11,0.06)",
          }} />
        </div>
      </div>
    </div>
  );
}
