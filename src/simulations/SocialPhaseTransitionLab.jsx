import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ════════════════════════════════════════════════════════════════════
// ◈  SOCIAL PHASE TRANSITION LABORATORY  ◈
// ════════════════════════════════════════════════════════════════════
// 2D Ising Model · Metropolis-Hastings + Wolff Cluster Algorithm
// Hoshen-Kopelman Cluster Decomposition · Domain Wall Fractal Analysis
// Full Thermodynamic Observable Suite: χ, C_v, ξ, U_L
// After Tsarev, Trofimova, Alodjants & Khrennikov (2019)
// "Phase transitions, collective emotions and decision-making
//  problem in heterogeneous social systems" — Sci. Rep. 9, 18039
// ════════════════════════════════════════════════════════════════════

const TC = 2.0 / Math.log(1.0 + Math.SQRT2); // 2.269185...
const BETA_C = Math.log(1.0 + Math.SQRT2) / 2.0;

// ── Onsager exact spontaneous magnetization ──
function onsagerMag(T, J = 1.0) {
  const x = Math.sinh(2 * J / T);
  if (x <= 1) return 0;
  return Math.pow(1 - Math.pow(x, -4), 1 / 8);
}

// ── Grid management with typed arrays ──
function createGrid(N, mode = "random") {
  const grid = new Int8Array(N * N);
  if (mode === "allUp") {
    grid.fill(1);
  } else if (mode === "allDown") {
    grid.fill(-1);
  } else {
    for (let i = 0; i < N * N; i++) grid[i] = Math.random() < 0.5 ? 1 : -1;
  }
  return grid;
}

// ── Metropolis-Hastings sweep with precomputed Boltzmann factors ──
function metropolisSweep(grid, N, beta, J, H) {
  // Precompute acceptance probabilities for all possible ΔE values
  const accept = new Float64Array(17); // index dE+8 → 0..16
  for (const dE of [-8, -4, 0, 4, 8]) {
    accept[dE + 8] = dE <= 0 ? 1.0 : Math.exp(-beta * J * dE);
  }
  // External field acceptance handled inline
  const steps = N * N;
  for (let i = 0; i < steps; i++) {
    const x = (Math.random() * N) | 0;
    const y = (Math.random() * N) | 0;
    const idx = x * N + y;
    const s = grid[idx];
    const neighbors =
      grid[((x + 1) % N) * N + y] +
      grid[((x - 1 + N) % N) * N + y] +
      grid[x * N + ((y + 1) % N)] +
      grid[x * N + ((y - 1 + N) % N)];
    const dE_coupling = 2 * s * neighbors; // ΔE/J from coupling
    const dE_field = 2 * s * H; // ΔE from external field
    const totalDE = J * dE_coupling + dE_field;
    if (totalDE <= 0 || Math.random() < Math.exp(-beta * totalDE)) {
      grid[idx] = -s;
    }
  }
}

// ── Wolff single-cluster algorithm ──
function wolffCluster(grid, N, beta, J) {
  const pAdd = 1.0 - Math.exp(-2.0 * beta * J);
  const seedIdx = (Math.random() * N * N) | 0;
  const sigma = grid[seedIdx];
  grid[seedIdx] = -sigma;
  const stack = [seedIdx];
  let clusterSize = 1;
  const clusterSites = [seedIdx]; // track for visualization
  
  while (stack.length > 0) {
    const idx = stack.pop();
    const x = (idx / N) | 0;
    const y = idx % N;
    const neighbors = [
      ((x + 1) % N) * N + y,
      ((x - 1 + N) % N) * N + y,
      x * N + ((y + 1) % N),
      x * N + ((y - 1 + N) % N),
    ];
    for (const nIdx of neighbors) {
      if (grid[nIdx] === sigma && Math.random() < pAdd) {
        grid[nIdx] = -sigma;
        stack.push(nIdx);
        clusterSize++;
        if (clusterSites.length < 50000) clusterSites.push(nIdx);
      }
    }
  }
  return { clusterSize, clusterSites };
}

// ── Compute thermodynamic observables ──
function computeObservables(grid, N, J, H) {
  let mag = 0, energy = 0;
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      const s = grid[x * N + y];
      mag += s;
      energy += -J * s * (grid[((x + 1) % N) * N + y] + grid[x * N + ((y + 1) % N)]) - H * s;
    }
  }
  const total = N * N;
  return { magnetization: mag / total, energy: energy / total, absMag: Math.abs(mag / total), totalMag: mag };
}

// ── Hoshen-Kopelman cluster labeling ──
function hoshenKopelman(grid, N) {
  const labels = new Int32Array(N * N);
  const parent = new Int32Array(N * N + 1);
  const sizes = new Int32Array(N * N + 1);
  let nextLabel = 1;

  function find(x) {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) { const n = parent[x]; parent[x] = root; x = n; }
    return root;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) {
      if (sizes[ra] < sizes[rb]) { parent[ra] = rb; sizes[rb] += sizes[ra]; }
      else { parent[rb] = ra; sizes[ra] += sizes[rb]; }
    }
  }

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      const idx = x * N + y;
      const s = grid[idx];
      const leftIdx = y > 0 ? x * N + (y - 1) : -1;
      const upIdx = x > 0 ? (x - 1) * N + y : -1;
      const sameLeft = leftIdx >= 0 && grid[leftIdx] === s;
      const sameUp = upIdx >= 0 && grid[upIdx] === s;

      if (!sameLeft && !sameUp) {
        labels[idx] = nextLabel;
        parent[nextLabel] = nextLabel;
        sizes[nextLabel] = 1;
        nextLabel++;
      } else if (sameLeft && !sameUp) {
        labels[idx] = find(labels[leftIdx]);
        sizes[labels[idx]]++;
      } else if (!sameLeft && sameUp) {
        labels[idx] = find(labels[upIdx]);
        sizes[labels[idx]]++;
      } else {
        const lL = find(labels[leftIdx]);
        const lU = find(labels[upIdx]);
        union(lL, lU);
        labels[idx] = find(lL);
        sizes[labels[idx]]++;
      }
    }
  }

  // Canonicalize
  for (let i = 0; i < N * N; i++) labels[i] = find(labels[i]);
  
  // Find largest cluster and count clusters
  const clusterSizeMap = {};
  for (let i = 0; i < N * N; i++) {
    const l = labels[i];
    clusterSizeMap[l] = (clusterSizeMap[l] || 0) + 1;
  }
  let maxLabel = 0, maxSize = 0;
  const clusterCount = Object.keys(clusterSizeMap).length;
  for (const [l, s] of Object.entries(clusterSizeMap)) {
    if (s > maxSize) { maxSize = s; maxLabel = parseInt(l); }
  }

  return { labels, clusterCount, maxSize, maxLabel, clusterSizeMap };
}

// ── Domain wall detection ──
function computeDomainWalls(grid, N) {
  const walls = new Uint8Array(N * N * 2); // [horizontal, vertical] for each cell
  let wallCount = 0;
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      const s = grid[x * N + y];
      if (s !== grid[((x + 1) % N) * N + y]) { walls[(x * N + y) * 2] = 1; wallCount++; }
      if (s !== grid[x * N + ((y + 1) % N)]) { walls[(x * N + y) * 2 + 1] = 1; wallCount++; }
    }
  }
  return { walls, wallCount };
}

// ── Color utilities ──
const PHI_INV = 0.618033988749895;
function clusterColor(label) {
  const hue = ((label * PHI_INV) % 1.0) * 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
}

// ── Rolling statistics accumulator ──
class StatAccumulator {
  constructor(windowSize = 200) {
    this.window = windowSize;
    this.vals = [];
    this.m2Vals = [];
    this.m4Vals = [];
  }
  push(m, absM, e) {
    this.vals.push({ m, absM, e, m2: m * m, m4: m * m * m * m, e2: e * e });
    if (this.vals.length > this.window) this.vals.shift();
  }
  get n() { return this.vals.length; }
  mean(key) {
    if (this.vals.length === 0) return 0;
    let s = 0;
    for (const v of this.vals) s += v[key];
    return s / this.vals.length;
  }
  susceptibility(T, N) {
    if (this.vals.length < 10) return 0;
    const beta = 1.0 / T;
    const mM2 = this.mean("m2");
    const mAbsM = this.mean("absM");
    return beta * N * N * (mM2 - mAbsM * mAbsM);
  }
  specificHeat(T, N) {
    if (this.vals.length < 10) return 0;
    const mE2 = this.mean("e2");
    const mE = this.mean("e");
    return (N * N / (T * T)) * (mE2 - mE * mE);
  }
  binderCumulant() {
    if (this.vals.length < 10) return 0;
    const m2 = this.mean("m2");
    const m4 = this.mean("m4");
    if (m2 === 0) return 0;
    return 1.0 - m4 / (3.0 * m2 * m2);
  }
}

// ── Sparkline Component ──
function Sparkline({ data, width, height, color, label, value, unit, min, max, criticalLine, format }) {
  if (!data || data.length < 2) return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 13, color, fontWeight: 600 }}>—</span>
      </div>
      <div style={{ width, height, borderRadius: 4, background: "var(--panel-deep)" }} />
    </div>
  );
  const displayData = data.slice(-200);
  const yMin = min !== undefined ? min : Math.min(...displayData);
  const yMax = max !== undefined ? max : Math.max(...displayData);
  const yRange = yMax - yMin || 1;
  const points = displayData.map((v, i) => {
    const x = (i / (displayData.length - 1)) * width;
    const y = height - 2 - ((v - yMin) / yRange) * (height - 4);
    return `${x},${y}`;
  }).join(" ");
  const criticalY = criticalLine !== undefined ? height - 2 - ((criticalLine - yMin) / yRange) * (height - 4) : null;
  const fmtVal = format ? format(value) : (typeof value === "number" ? value.toFixed(4) : value);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 13, color, fontWeight: 600 }}>
          {fmtVal}
          {unit && <span style={{ fontSize: 9, color: "var(--text-dim)", marginLeft: 3 }}>{unit}</span>}
        </span>
      </div>
      <svg width={width} height={height} style={{ display: "block", borderRadius: 4, background: "var(--panel-deep)" }}>
        {criticalY !== null && criticalY >= 0 && criticalY <= height && (
          <line x1={0} y1={criticalY} x2={width} y2={criticalY} stroke="var(--critical)" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
        )}
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      </svg>
    </div>
  );
}

// ── Parameter slider ──
function ParamSlider({ label, value, onChange, min, max, step, desc, accent, fmt }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--mono)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent || "var(--text)", fontFamily: "var(--mono)" }}>{fmt ? fmt(value) : value.toFixed(3)}</span>
      </div>
      <div style={{ position: "relative", height: 24 }}>
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, height: 4, background: "var(--panel-deep)", borderRadius: 2 }} />
        <div style={{ position: "absolute", top: 10, left: 0, width: `${pct}%`, height: 4, background: accent || "var(--accent)", borderRadius: 2, transition: "width 0.04s" }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 24, opacity: 0, cursor: "pointer", margin: 0 }} />
      </div>
      {desc && <div style={{ fontSize: 8, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.4, opacity: 0.6 }}>{desc}</div>}
    </div>
  );
}

// ── Phase indicator with glow ──
function PhaseIndicator({ T }) {
  const ratio = T / TC;
  const phases = [
    { label: "COHERENT", active: ratio < 0.88, color: "#4ecdc4", icon: "◆" },
    { label: "CRITICAL", active: ratio >= 0.88 && ratio <= 1.12, color: "#ff6b6b", icon: "◈" },
    { label: "DISORDERED", active: ratio > 1.12, color: "#64748b", icon: "◇" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
      {phases.map(p => (
        <div key={p.label} style={{
          flex: 1, textAlign: "center", padding: "5px 2px", borderRadius: 4, fontSize: 8, fontWeight: 700,
          letterSpacing: "0.1em", fontFamily: "var(--mono)", transition: "all 0.4s ease",
          background: p.active ? p.color + "18" : "transparent",
          color: p.active ? p.color : "var(--text-dim)",
          border: p.active ? `1px solid ${p.color}33` : "1px solid transparent",
          boxShadow: p.active ? `0 0 12px ${p.color}15` : "none",
        }}>
          <span style={{ fontSize: 10 }}>{p.icon}</span><br />{p.label}
        </div>
      ))}
    </div>
  );
}

// ── Event button ──
function EventButton({ label, onClick, active, color }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "7px 4px", border: active ? `1px solid ${color}55` : "1px solid var(--border)",
      borderRadius: 5, background: active ? color + "15" : "var(--panel-deep)", color: active ? color : "var(--text-dim)",
      fontSize: 8, fontWeight: 600, letterSpacing: "0.06em", fontFamily: "var(--mono)", cursor: "pointer",
      transition: "all 0.2s", textTransform: "uppercase",
    }}>
      {label}
    </button>
  );
}

// ── Mode toggle button ──
function ModeButton({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 8px", borderRadius: 4, border: active ? `1px solid ${color || "var(--accent)"}55` : "1px solid var(--border)",
      background: active ? (color || "var(--accent)") + "18" : "transparent",
      color: active ? (color || "var(--accent)") : "var(--text-dim)",
      fontSize: 8, fontWeight: 600, fontFamily: "var(--mono)", cursor: "pointer", letterSpacing: "0.06em",
      transition: "all 0.2s", textTransform: "uppercase",
    }}>
      {label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════
export default function SocialPhaseTransitionLab() {
  const GRID_SIZE = 128;
  const CELL_SIZE = 4;
  const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
  const sparkW = 210;

  const canvasRef = useRef(null);
  const gridRef = useRef(createGrid(GRID_SIZE));
  const animRef = useRef(null);
  const statsRef = useRef(new StatAccumulator(300));
  const frameCountRef = useRef(0);
  const lastClusterRef = useRef(null);
  const sweepCountRef = useRef(0);

  // ── State ──
  const [running, setRunning] = useState(true);
  const [temperature, setTemperature] = useState(TC);
  const [coupling, setCoupling] = useState(1.0);
  const [externalField, setExternalField] = useState(0.0);
  const [sweepSpeed, setSweepSpeed] = useState(3);
  const [algorithm, setAlgorithm] = useState("metropolis"); // "metropolis" | "wolff"
  const [vizMode, setVizMode] = useState("spin"); // "spin" | "cluster" | "walls" | "energy"
  const [newsEvent, setNewsEvent] = useState(null);
  const [socialMode, setSocialMode] = useState(false);

  // Observable histories
  const [magHistory, setMagHistory] = useState([]);
  const [absMagHistory, setAbsMagHistory] = useState([]);
  const [energyHistory, setEnergyHistory] = useState([]);
  const [chiHistory, setChiHistory] = useState([]);
  const [cvHistory, setCvHistory] = useState([]);
  const [binderHistory, setBinderHistory] = useState([]);
  const [clusterInfo, setClusterInfo] = useState({ count: 0, maxSize: 0 });
  const [wallInfo, setWallInfo] = useState({ count: 0 });
  const [currentObs, setCurrentObs] = useState({ magnetization: 0, energy: 0, absMag: 0 });
  const [sweepCount, setSweepCount] = useState(0);
  const [lastClusterSize, setLastClusterSize] = useState(0);

  // ── Sweep controls ──
  const [sweepActive, setSweepActive] = useState(false);
  const [sweepT, setSweepT] = useState(0.5);
  const sweepRef = useRef({ active: false, T: 0.5, dir: 1 });

  // ── Render the grid to canvas ──
  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const grid = gridRef.current;
    const N = GRID_SIZE;
    const CS = CELL_SIZE;
    const imgData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const data = imgData.data;

    if (vizMode === "spin") {
      // Deep color rendering with local alignment intensity
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const s = grid[x * N + y];
          const nb = grid[((x+1)%N)*N+y] + grid[((x-1+N)%N)*N+y] + grid[x*N+((y+1)%N)] + grid[x*N+((y-1+N)%N)];
          const alignment = (s * nb) / 4;
          const intensity = 0.55 + 0.45 * Math.max(0, alignment);
          let r, g, b;
          if (s === 1) {
            // Warm coral → deep crimson
            r = (220 * intensity) | 0;
            g = (60 * intensity) | 0;
            b = (72 * intensity) | 0;
          } else {
            // Cool teal → deep navy
            r = (20 + 35 * intensity) | 0;
            g = (70 + 120 * intensity) | 0;
            b = (110 + 100 * intensity) | 0;
          }
          for (let dx = 0; dx < CS; dx++) {
            for (let dy = 0; dy < CS; dy++) {
              const px = y * CS + dy;
              const py = x * CS + dx;
              const pi = (py * CANVAS_SIZE + px) * 4;
              data[pi] = r; data[pi+1] = g; data[pi+2] = b; data[pi+3] = 255;
            }
          }
        }
      }
    } else if (vizMode === "cluster") {
      // Hoshen-Kopelman cluster coloring
      const { labels, clusterCount, maxSize, maxLabel, clusterSizeMap } = hoshenKopelman(grid, N);
      lastClusterRef.current = { labels, clusterCount, maxSize };
      setClusterInfo({ count: clusterCount, maxSize });
      
      // Precompute colors for each label
      const colorCache = {};
      for (let i = 0; i < N * N; i++) {
        const l = labels[i];
        if (!colorCache[l]) {
          const size = clusterSizeMap[l] || 1;
          if (l === maxLabel) {
            colorCache[l] = [255, 220, 100]; // Gold for largest
          } else {
            const hue = ((l * PHI_INV) % 1.0) * 360;
            const sat = 60 + Math.min(20, Math.log2(size + 1) * 3);
            const lum = 35 + Math.min(30, Math.log2(size + 1) * 4);
            colorCache[l] = hslToRgb(hue, sat, lum);
          }
        }
      }

      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const l = labels[x * N + y];
          const [r, g, b] = colorCache[l];
          for (let dx = 0; dx < CS; dx++) {
            for (let dy = 0; dy < CS; dy++) {
              const px = y * CS + dy;
              const py = x * CS + dx;
              const pi = (py * CANVAS_SIZE + px) * 4;
              data[pi] = r; data[pi+1] = g; data[pi+2] = b; data[pi+3] = 255;
            }
          }
        }
      }
    } else if (vizMode === "walls") {
      // Domain wall visualization: dark background with bright wall lines
      const { walls, wallCount } = computeDomainWalls(grid, N);
      setWallInfo({ count: wallCount });

      // Base: very dark with slight spin tinting
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const s = grid[x * N + y];
          const base = s === 1 ? [18, 12, 15] : [10, 14, 22];
          for (let dx = 0; dx < CS; dx++) {
            for (let dy = 0; dy < CS; dy++) {
              const px = y * CS + dy;
              const py = x * CS + dx;
              const pi = (py * CANVAS_SIZE + px) * 4;
              data[pi] = base[0]; data[pi+1] = base[1]; data[pi+2] = base[2]; data[pi+3] = 255;
            }
          }
        }
      }
      // Draw walls as bright lines
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const idx = x * N + y;
          // Horizontal wall (between x and x+1)
          if (walls[idx * 2]) {
            const py = (x + 1) * CS;
            if (py < CANVAS_SIZE) {
              for (let dy = 0; dy < CS; dy++) {
                const px = y * CS + dy;
                for (let t = -1; t <= 0; t++) {
                  const row = py + t;
                  if (row >= 0 && row < CANVAS_SIZE) {
                    const pi = (row * CANVAS_SIZE + px) * 4;
                    data[pi] = 120; data[pi+1] = 230; data[pi+2] = 255; data[pi+3] = 220;
                  }
                }
              }
            }
          }
          // Vertical wall (between y and y+1)
          if (walls[idx * 2 + 1]) {
            const px = (y + 1) * CS;
            if (px < CANVAS_SIZE) {
              for (let dx = 0; dx < CS; dx++) {
                const py2 = x * CS + dx;
                for (let t = -1; t <= 0; t++) {
                  const col = px + t;
                  if (col >= 0 && col < CANVAS_SIZE) {
                    const pi = (py2 * CANVAS_SIZE + col) * 4;
                    data[pi] = 120; data[pi+1] = 230; data[pi+2] = 255; data[pi+3] = 220;
                  }
                }
              }
            }
          }
        }
      }
    } else if (vizMode === "energy") {
      // Local energy density heatmap
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const s = grid[x * N + y];
          const nb = grid[((x+1)%N)*N+y] + grid[((x-1+N)%N)*N+y] + grid[x*N+((y+1)%N)] + grid[x*N+((y-1+N)%N)];
          const localE = -coupling * s * nb; // -4 to +4
          const t = (localE + 4) / 8; // 0 to 1, low energy = 0, high = 1
          // Coolwarm diverging colormap
          let r, g, b;
          if (t < 0.5) {
            const u = t * 2;
            r = (10 + 50 * u) | 0;
            g = (30 + 140 * u) | 0;
            b = (120 + 100 * u) | 0;
          } else {
            const u = (t - 0.5) * 2;
            r = (60 + 170 * u) | 0;
            g = (170 - 130 * u) | 0;
            b = (220 - 180 * u) | 0;
          }
          for (let dx = 0; dx < CS; dx++) {
            for (let dy = 0; dy < CS; dy++) {
              const px = y * CS + dy;
              const py = x * CS + dx;
              const pi = (py * CANVAS_SIZE + px) * 4;
              data[pi] = r; data[pi+1] = g; data[pi+2] = b; data[pi+3] = 255;
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [vizMode, coupling, GRID_SIZE, CELL_SIZE, CANVAS_SIZE]);

  // ── Main simulation loop ──
  useEffect(() => {
    if (!running) return;
    let active = true;
    const step = () => {
      if (!active) return;
      const N = GRID_SIZE;
      const beta = 1.0 / temperature;
      const effectiveH = externalField + (newsEvent === "positive" ? 0.15 : newsEvent === "negative" ? -0.15 : 0);

      // Temperature sweep
      if (sweepRef.current.active) {
        sweepRef.current.T += sweepRef.current.dir * 0.008;
        if (sweepRef.current.T > 4.5) sweepRef.current.dir = -1;
        if (sweepRef.current.T < 0.3) { sweepRef.current.dir = 1; sweepRef.current.active = false; setSweepActive(false); }
        setSweepT(sweepRef.current.T);
        // Override temperature for sweep
      }
      const effTemp = sweepRef.current.active ? sweepRef.current.T : temperature;
      const effBeta = 1.0 / effTemp;

      if (algorithm === "wolff") {
        let totalFlipped = 0;
        let lastCS = 0;
        while (totalFlipped < N * N * sweepSpeed) {
          const { clusterSize } = wolffCluster(gridRef.current, N, effBeta, coupling);
          totalFlipped += clusterSize;
          lastCS = clusterSize;
        }
        setLastClusterSize(lastCS);
      } else {
        for (let i = 0; i < sweepSpeed; i++) {
          metropolisSweep(gridRef.current, N, effBeta, coupling, effectiveH);
        }
      }

      sweepCountRef.current += sweepSpeed;
      const obs = computeObservables(gridRef.current, N, coupling, effectiveH);
      statsRef.current.push(obs.magnetization, obs.absMag, obs.energy);

      const chi = statsRef.current.susceptibility(effTemp, N);
      const cv = statsRef.current.specificHeat(effTemp, N);
      const binder = statsRef.current.binderCumulant();

      setCurrentObs(obs);
      setSweepCount(sweepCountRef.current);

      setMagHistory(prev => { const n = [...prev, obs.magnetization]; return n.length > 500 ? n.slice(-500) : n; });
      setAbsMagHistory(prev => { const n = [...prev, obs.absMag]; return n.length > 500 ? n.slice(-500) : n; });
      setEnergyHistory(prev => { const n = [...prev, obs.energy]; return n.length > 500 ? n.slice(-500) : n; });
      setChiHistory(prev => { const n = [...prev, chi]; return n.length > 500 ? n.slice(-500) : n; });
      setCvHistory(prev => { const n = [...prev, cv]; return n.length > 500 ? n.slice(-500) : n; });
      setBinderHistory(prev => { const n = [...prev, binder]; return n.length > 500 ? n.slice(-500) : n; });

      renderGrid();
      frameCountRef.current++;
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, temperature, coupling, externalField, sweepSpeed, algorithm, newsEvent, renderGrid]);

  const resetSimulation = useCallback(() => {
    gridRef.current = createGrid(GRID_SIZE);
    sweepCountRef.current = 0;
    frameCountRef.current = 0;
    statsRef.current = new StatAccumulator(300);
    setMagHistory([]); setAbsMagHistory([]); setEnergyHistory([]);
    setChiHistory([]); setCvHistory([]); setBinderHistory([]);
    setSweepCount(0); setNewsEvent(null); setLastClusterSize(0);
    sweepRef.current = { active: false, T: 0.5, dir: 1 };
    setSweepActive(false);
    renderGrid();
  }, [renderGrid]);

  const startSweep = useCallback(() => {
    sweepRef.current = { active: true, T: 0.5, dir: 1 };
    setSweepActive(true);
    statsRef.current = new StatAccumulator(300);
  }, []);

  // Derive current chi/cv/binder for display
  const effTemp = sweepActive ? sweepT : temperature;
  const chi = statsRef.current.susceptibility(effTemp, GRID_SIZE);
  const cv = statsRef.current.specificHeat(effTemp, GRID_SIZE);
  const binder = statsRef.current.binderCumulant();

  // Social labels
  const labels = socialMode ? {
    temperature: "Social Noise",
    coupling: "Conformity Pressure",
    field: "Media Influence",
    mag: "Consensus ⟨σ⟩",
    absMag: "Polarization |σ|",
    energy: "Social Tension",
    chi: "Susceptibility χ",
    cv: "Volatility Cᵥ",
    binder: "Cohesion U_L",
    spinUp: "Opinion A",
    spinDown: "Opinion B",
    events: "Media Events",
    positive: "+ Viral Positive",
    negative: "— Crisis Event",
  } : {
    temperature: "Temperature T",
    coupling: "Coupling J",
    field: "External Field H",
    mag: "Magnetization ⟨M⟩",
    absMag: "Order Param |M|",
    energy: "Energy ⟨E⟩/N",
    chi: "Susceptibility χ",
    cv: "Specific Heat Cᵥ",
    binder: "Binder Cumulant U_L",
    spinUp: "+1 Spin",
    spinDown: "−1 Spin",
    events: "Field Events",
    positive: "+ Positive",
    negative: "— Negative",
  };

  return (
    <div style={{
      "--bg": "#080c14",
      "--panel": "#0f1520",
      "--panel-deep": "#0a0f1a",
      "--border": "#1a2236",
      "--text": "#d4dae8",
      "--text-dim": "#5a6b8a",
      "--accent": "#4ecdc4",
      "--critical": "#ff6b6b",
      "--mono": "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      padding: "16px 12px",
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 16, maxWidth: 800, margin: "0 auto 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, transparent, var(--accent))" }} />
          <h1 style={{ fontSize: 15, fontWeight: 300, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--accent)", margin: 0, fontFamily: "var(--mono)" }}>
            {socialMode ? "Social Phase Transition" : "Phase Transition"} Laboratory
          </h1>
          <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, var(--accent), transparent)" }} />
        </div>
        <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.06em", fontFamily: "var(--mono)" }}>
          2D Ising · {algorithm === "wolff" ? "Wolff Cluster" : "Metropolis-Hastings"} Monte Carlo
          {vizMode === "cluster" ? " · Hoshen-Kopelman" : vizMode === "walls" ? " · Domain Walls" : vizMode === "energy" ? " · Energy Density" : ""}
          {socialMode ? " · Tsarev et al. (2019)" : ""}
        </div>
      </div>

      {/* ── Mode toggles ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: "3px", background: "var(--panel)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <ModeButton label="Spin" active={vizMode === "spin"} onClick={() => setVizMode("spin")} />
          <ModeButton label="Clusters" active={vizMode === "cluster"} onClick={() => setVizMode("cluster")} color="#f59e0b" />
          <ModeButton label="Walls" active={vizMode === "walls"} onClick={() => setVizMode("walls")} color="#78e0f0" />
          <ModeButton label="Energy" active={vizMode === "energy"} onClick={() => setVizMode("energy")} color="#a78bfa" />
        </div>
        <div style={{ display: "flex", gap: 4, padding: "3px", background: "var(--panel)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <ModeButton label="Metropolis" active={algorithm === "metropolis"} onClick={() => setAlgorithm("metropolis")} />
          <ModeButton label="Wolff" active={algorithm === "wolff"} onClick={() => setAlgorithm("wolff")} color="#22d3ee" />
        </div>
        <div style={{ display: "flex", gap: 4, padding: "3px", background: "var(--panel)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <ModeButton label="Physics" active={!socialMode} onClick={() => setSocialMode(false)} />
          <ModeButton label="Social" active={socialMode} onClick={() => setSocialMode(true)} color="#ec4899" />
        </div>
      </div>

      {/* ── Main 3-column layout ── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", maxWidth: 1120, margin: "0 auto" }}>

        {/* ═══ LEFT PANEL: Controls ═══ */}
        <div style={{ width: 240, background: "var(--panel)", borderRadius: 10, border: "1px solid var(--border)", padding: 16, flexShrink: 0 }}>
          <PhaseIndicator T={sweepActive ? sweepT : temperature} />

          <ParamSlider label={labels.temperature} value={sweepActive ? sweepT : temperature}
            onChange={v => { if (!sweepActive) setTemperature(v); }}
            min={0.1} max={5.0} step={0.01}
            desc={`T_c ≈ ${TC.toFixed(3)}. Below: ordered. Above: disordered.`}
            accent={effTemp < TC * 0.88 ? "#4ecdc4" : effTemp > TC * 1.12 ? "#64748b" : "#ff6b6b"} />

          <ParamSlider label={labels.coupling} value={coupling} onChange={setCoupling}
            min={0.0} max={2.0} step={0.01}
            desc={socialMode ? "Strength of peer influence and group conformity." : "Nearest-neighbor interaction strength."}
            accent="#f59e0b" />

          <ParamSlider label={labels.field} value={externalField} onChange={setExternalField}
            min={-1.0} max={1.0} step={0.01}
            desc={socialMode ? "Global media/narrative push. Tsarev's s-photon field." : "Zeeman coupling to external magnetic field."}
            accent="#a78bfa" />

          <ParamSlider label="Speed" value={sweepSpeed} onChange={setSweepSpeed}
            min={1} max={10} step={1} desc="MC sweeps per frame." accent="var(--text-dim)"
            fmt={v => `${v}×`} />

          {/* Events */}
          <div style={{ marginTop: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--mono)" }}>
              {labels.events}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <EventButton label={labels.positive} onClick={() => setNewsEvent(n => n === "positive" ? null : "positive")} active={newsEvent === "positive"} color="#ec4858" />
              <EventButton label={labels.negative} onClick={() => setNewsEvent(n => n === "negative" ? null : "negative")} active={newsEvent === "negative"} color="#3b82f6" />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button onClick={() => setRunning(!running)} style={{
              flex: 1, padding: "8px", border: "1px solid var(--border)", borderRadius: 5,
              background: running ? "#dc262618" : "#4ecdc418", color: running ? "#f87171" : "#4ecdc4",
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.08em",
            }}>
              {running ? "PAUSE" : "RUN"}
            </button>
            <button onClick={resetSimulation} style={{
              flex: 1, padding: "8px", border: "1px solid var(--border)", borderRadius: 5,
              background: "var(--panel-deep)", color: "var(--text-dim)",
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.08em",
            }}>
              RESET
            </button>
          </div>

          {/* Temperature sweep */}
          <button onClick={startSweep} disabled={sweepActive} style={{
            width: "100%", padding: "7px", border: "1px solid var(--border)", borderRadius: 5, marginTop: 6,
            background: sweepActive ? "#f59e0b18" : "var(--panel-deep)",
            color: sweepActive ? "#f59e0b" : "var(--text-dim)",
            fontSize: 9, fontWeight: 600, cursor: sweepActive ? "default" : "pointer",
            fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {sweepActive ? `SWEEPING T = ${sweepT.toFixed(2)}` : "▷ AUTO TEMP SWEEP"}
          </button>

          {/* Init state buttons */}
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
            <button onClick={() => { gridRef.current = createGrid(GRID_SIZE, "allUp"); renderGrid(); }} style={{
              flex: 1, padding: "5px", border: "1px solid var(--border)", borderRadius: 4,
              background: "var(--panel-deep)", color: "#ec4858", fontSize: 8, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
            }}>ALL +1</button>
            <button onClick={() => { gridRef.current = createGrid(GRID_SIZE, "allDown"); renderGrid(); }} style={{
              flex: 1, padding: "5px", border: "1px solid var(--border)", borderRadius: 4,
              background: "var(--panel-deep)", color: "#4ea8c8", fontSize: 8, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
            }}>ALL −1</button>
            <button onClick={() => { gridRef.current = createGrid(GRID_SIZE, "random"); renderGrid(); }} style={{
              flex: 1, padding: "5px", border: "1px solid var(--border)", borderRadius: 4,
              background: "var(--panel-deep)", color: "var(--text-dim)", fontSize: 8, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
            }}>RANDOM</button>
          </div>

          {/* Stats footer */}
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
            {sweepCount.toLocaleString()} sweeps · {GRID_SIZE}² lattice
            {algorithm === "wolff" && lastClusterSize > 0 && (
              <span> · last cluster: {lastClusterSize.toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* ═══ CENTER: Canvas ═══ */}
        <div style={{
          background: "var(--panel)", borderRadius: 10, border: "1px solid var(--border)", padding: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{
            borderRadius: 6, imageRendering: "pixelated",
            width: Math.min(CANVAS_SIZE, 512), height: Math.min(CANVAS_SIZE, 512),
            boxShadow: `0 0 30px ${effTemp < TC * 0.88 ? "rgba(78,205,196,0.08)" : effTemp > TC * 1.12 ? "rgba(100,116,139,0.06)" : "rgba(255,107,107,0.12)"}`,
          }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 9, fontFamily: "var(--mono)" }}>
            {vizMode === "spin" && <>
              <span style={{ color: "#dc3c48" }}>● {labels.spinUp}</span>
              <span style={{ color: "#4ea8c8" }}>● {labels.spinDown}</span>
            </>}
            {vizMode === "cluster" && <>
              <span style={{ color: "#ffd864" }}>● Largest cluster ({clusterInfo.maxSize.toLocaleString()})</span>
              <span style={{ color: "var(--text-dim)" }}>{clusterInfo.count} clusters</span>
            </>}
            {vizMode === "walls" && <>
              <span style={{ color: "#78e0f0" }}>● Domain walls ({wallInfo.count.toLocaleString()} bonds)</span>
            </>}
            {vizMode === "energy" && <>
              <span style={{ color: "#3b5fa0" }}>● Low E</span>
              <span style={{ color: "#9ca0a8" }}>● Zero</span>
              <span style={{ color: "#d04040" }}>● High E</span>
            </>}
          </div>

          {/* Onsager reference */}
          <div style={{
            marginTop: 8, padding: "6px 10px", background: "var(--panel-deep)", borderRadius: 5,
            border: "1px solid var(--border)", fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--mono)",
            textAlign: "center", width: "100%", maxWidth: 400,
          }}>
            {socialMode ? (
              <>Dicke superradiant mapping: T{"<"}T_c → coherent consensus · T{">"}T_c → opinion disorder</>
            ) : (
              <>Onsager exact: m₀(T) = [1 − sinh⁻⁴(2J/T)]^{"{"}1/8{"}"} → m₀({effTemp.toFixed(2)}) = <span style={{ color: "#4ecdc4" }}>{onsagerMag(effTemp, coupling).toFixed(4)}</span></>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL: Observables ═══ */}
        <div style={{ width: 250, background: "var(--panel)", borderRadius: 10, border: "1px solid var(--border)", padding: 16, flexShrink: 0, overflowY: "auto", maxHeight: 620 }}>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, fontFamily: "var(--mono)" }}>
            {socialMode ? "Social Observables" : "Thermodynamic Observables"}
          </div>

          <Sparkline data={magHistory} width={sparkW} height={44} color="#4ecdc4" label={labels.mag}
            value={currentObs.magnetization} min={-1} max={1} criticalLine={0} />

          <Sparkline data={absMagHistory} width={sparkW} height={44} color="#f59e0b" label={labels.absMag}
            value={currentObs.absMag} min={0} max={1} />

          <Sparkline data={energyHistory} width={sparkW} height={44} color="#a78bfa" label={labels.energy}
            value={currentObs.energy} unit={socialMode ? "" : "J"} />

          <Sparkline data={chiHistory} width={sparkW} height={44} color="#22d3ee" label={labels.chi}
            value={chi} format={v => v > 999 ? v.toExponential(1) : v.toFixed(1)} />

          <Sparkline data={cvHistory} width={sparkW} height={44} color="#f472b6" label={labels.cv}
            value={cv} format={v => v > 999 ? v.toExponential(1) : v.toFixed(1)} />

          <Sparkline data={binderHistory} width={sparkW} height={44} color="#34d399" label={labels.binder}
            value={binder} min={0} max={0.7} criticalLine={0.6107}
            format={v => v.toFixed(4)} />

          {/* Theory panel */}
          <div style={{ marginTop: 10, padding: 10, background: "var(--panel-deep)", borderRadius: 6, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--mono)" }}>
              {socialMode ? "Tsarev–Dicke Mapping" : "Critical Exponents (Exact)"}
            </div>
            {socialMode ? (
              <div style={{ fontSize: 9, lineHeight: 1.65, color: "var(--text-dim)" }}>
                <div><span style={{ color: "#4ecdc4" }}>P</span> (Arousal) = Collective Polarization</div>
                <div><span style={{ color: "#f59e0b" }}>S</span> (Valence) = Population Imbalance</div>
                <div><span style={{ color: "#a78bfa" }}>H</span> (s-field) = Information Quanta</div>
                <div><span style={{ color: "#22d3ee" }}>χ</span> = Community Susceptibility</div>
                <div style={{ marginTop: 5, fontSize: 8, opacity: 0.7 }}>
                  T {"<"} T_c → Superradiant consensus<br />
                  Coherent social energy release<br />
                  P² + S² = 1/4 (Russell circumplex)
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 9, lineHeight: 1.65, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                <div>β = <span style={{ color: "#f59e0b" }}>1/8</span> · γ = <span style={{ color: "#22d3ee" }}>7/4</span> · ν = <span style={{ color: "#a78bfa" }}>1</span></div>
                <div>α = <span style={{ color: "#f472b6" }}>0 (log)</span> · η = <span style={{ color: "#34d399" }}>1/4</span> · δ = <span style={{ color: "#ec4858" }}>15</span></div>
                <div style={{ marginTop: 5, fontSize: 8, opacity: 0.7 }}>
                  T_c = 2/ln(1+√2) ≈ {TC.toFixed(6)}<br />
                  U* ≈ 0.6107 (Binder crossing)<br />
                  χ_max ~ L^(γ/ν) = L^(7/4)
                </div>
              </div>
            )}
          </div>

          {/* Shoal-broadcast bridge */}
          <div style={{ marginTop: 8, padding: 8, background: "#4ecdc406", borderRadius: 6, border: "1px solid #4ecdc418" }}>
            <div style={{ fontSize: 7, color: "#4ecdc4", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3, fontFamily: "var(--mono)" }}>
              Shoal-Broadcast Bridge
            </div>
            <div style={{ fontSize: 8, lineHeight: 1.45, color: "var(--text-dim)" }}>
              This lattice is the discrete limit of continuous scalar fields.
              {algorithm === "wolff"
                ? " Wolff clusters = FK percolation clusters = the correlation structure your agents swim through."
                : " Each cell's local alignment = the field gradient your agents navigate."}
              {vizMode === "cluster" && " Cluster coloring reveals the fractal geometry at criticality (d_F = 15/8)."}
              {vizMode === "walls" && " Domain walls at T_c form SLE(3) curves with fractal dimension 11/8."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
