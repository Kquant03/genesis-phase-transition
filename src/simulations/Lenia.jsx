import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◉  LENIA  ◉  Continuous Cellular Automata
// ════════════════════════════════════════════════════════════════════
// After Bert Wang-Chak Chan (2018)
// Continuous space · Continuous time · Continuous states
// FFT-accelerated convolution · Gaussian ring kernel
// U(x) = K * A   |   G(u) = 2·exp(−(u−μ)²/2σ²) − 1
// A(t+dt) = clip(A(t) + dt·G(U), 0, 1)
// ════════════════════════════════════════════════════════════════════

const N = 256; // Grid size (power of 2 for FFT)
const DISPLAY = 512;

// ═══════════════ FFT (Cooley-Tukey Radix-2) ═══════════════

function fft1d(re, im, n, inverse) {
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (inverse ? -1 : 1) * 2 * Math.PI / len;
    const wR = Math.cos(ang), wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0;
      for (let j = 0; j < half; j++) {
        const idx = i + j, idx2 = idx + half;
        const tR = cR * re[idx2] - cI * im[idx2];
        const tI = cR * im[idx2] + cI * re[idx2];
        re[idx2] = re[idx] - tR;
        im[idx2] = im[idx] - tI;
        re[idx] += tR;
        im[idx] += tI;
        const nR = cR * wR - cI * wI;
        cI = cR * wI + cI * wR;
        cR = nR;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

function fft2d(re, im, n, inverse) {
  const rBuf = new Float64Array(n), iBuf = new Float64Array(n);
  // Transform rows
  for (let y = 0; y < n; y++) {
    const off = y * n;
    for (let x = 0; x < n; x++) { rBuf[x] = re[off + x]; iBuf[x] = im[off + x]; }
    fft1d(rBuf, iBuf, n, inverse);
    for (let x = 0; x < n; x++) { re[off + x] = rBuf[x]; im[off + x] = iBuf[x]; }
  }
  // Transform columns
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { rBuf[y] = re[y * n + x]; iBuf[y] = im[y * n + x]; }
    fft1d(rBuf, iBuf, n, inverse);
    for (let y = 0; y < n; y++) { re[y * n + x] = rBuf[y]; im[y * n + x] = iBuf[y]; }
  }
}

// ═══════════════ Kernel Construction ═══════════════

function buildKernelFFT(R, kernelMu, kernelSigma, rings) {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const r = Math.sqrt(dx * dx + dy * dy) / R;
      if (r > 1 || r === 0) continue;
      let k = 0;
      if (rings && rings.length > 1) {
        // Multi-ring (beta) kernel
        const B = rings.length;
        const ringIdx = Math.min(Math.floor(r * B), B - 1);
        const localR = (r * B) % 1;
        const core = Math.exp(4 - 4 / (4 * localR * (1 - localR) + 1e-10));
        k = rings[ringIdx] * core;
      } else {
        // Single Gaussian ring
        k = Math.exp(-((r - kernelMu) * (r - kernelMu)) / (2 * kernelSigma * kernelSigma));
      }
      const gy = ((dy % N) + N) % N;
      const gx = ((dx % N) + N) % N;
      re[gy * N + gx] += k;
      sum += k;
    }
  }
  if (sum > 0) for (let i = 0; i < N * N; i++) re[i] /= sum;
  fft2d(re, im, N, false);
  return { re: new Float64Array(re), im: new Float64Array(im) };
}

// ═══════════════ Lenia Step (FFT) ═══════════════

function leniaStep(state, kRe, kIm, mu, sigma, dt, potential) {
  const nn = N * N;
  const re = new Float64Array(nn);
  const im = new Float64Array(nn);
  re.set(state);

  fft2d(re, im, N, false);

  // Pointwise complex multiply with kernel FFT
  for (let i = 0; i < nn; i++) {
    const a = re[i], b = im[i], c = kRe[i], d = kIm[i];
    re[i] = a * c - b * d;
    im[i] = a * d + b * c;
  }

  fft2d(re, im, N, true);

  // Growth + update
  for (let i = 0; i < nn; i++) {
    const u = re[i];
    potential[i] = u;
    const g = 2.0 * Math.exp(-((u - mu) * (u - mu)) / (2 * sigma * sigma)) - 1.0;
    state[i] = Math.min(1, Math.max(0, state[i] + dt * g));
  }
}

// ═══════════════ Creature Seeds ═══════════════

// Orbium unicaudatus — the classic Lenia glider
// Approximate initial state (20×20, values in [0,1])
const ORBIUM_CELLS = [
  [0,0,0,0,0,0,0.1,0.14,0.1,0,0,0.03,0.03,0,0,0.3,0,0,0,0],
  [0,0,0,0,0,0.08,0.24,0.3,0.3,0.18,0.14,0.15,0.16,0.15,0.09,0.2,0,0,0,0],
  [0,0,0,0,0,0.15,0.34,0.44,0.46,0.38,0.18,0.14,0.11,0.13,0.19,0.18,0.45,0,0,0],
  [0,0,0,0,0.06,0.13,0.39,0.5,0.5,0.37,0.06,0,0,0,0.02,0.16,0.68,0,0,0],
  [0,0,0,0.11,0.17,0.17,0.33,0.4,0.38,0.28,0.14,0,0,0,0,0,0.18,0.42,0,0],
  [0,0,0.09,0.18,0.13,0.06,0.08,0.26,0.32,0.32,0.27,0,0,0,0,0,0,0.82,0,0],
  [0.27,0,0.16,0.12,0,0,0,0.25,0.38,0.44,0.45,0.34,0,0,0,0,0,0.22,0.17,0],
  [0,0.07,0.2,0.02,0,0,0,0.31,0.48,0.57,0.6,0.57,0,0,0,0,0,0,0.49,0],
  [0,0.59,0.19,0,0,0,0,0.2,0.57,0.69,0.76,0.76,0.49,0,0,0,0,0,0.36,0],
  [0,0.58,0.19,0,0,0,0,0,0.67,0.83,0.9,0.92,0.87,0.12,0,0,0,0,0.22,0.07],
  [0,0,0.46,0,0,0,0,0,0.7,0.93,1,1,1,0.61,0,0,0,0,0.18,0.11],
  [0,0,0.82,0,0,0,0,0,0.47,1,1,0.98,1,0.96,0.27,0,0,0,0.19,0.1],
  [0,0,0.46,0,0,0,0,0,0.25,1,1,0.84,0.92,0.97,0.54,0.14,0.04,0.1,0.21,0.05],
  [0,0,0,0.4,0,0,0,0,0.09,0.8,1,0.82,0.8,0.85,0.63,0.31,0.18,0.19,0.2,0.01],
  [0,0,0,0.36,0.1,0,0,0,0.05,0.54,0.86,0.79,0.74,0.72,0.6,0.39,0.28,0.24,0.13,0],
  [0,0,0,0.01,0.3,0.07,0,0,0.08,0.36,0.64,0.7,0.64,0.6,0.51,0.39,0.29,0.19,0.04,0],
  [0,0,0,0,0.1,0.24,0.14,0.1,0.15,0.29,0.45,0.53,0.52,0.46,0.4,0.31,0.21,0.08,0,0],
  [0,0,0,0,0,0.08,0.21,0.21,0.22,0.29,0.36,0.39,0.37,0.33,0.26,0.18,0.09,0,0,0],
  [0,0,0,0,0,0,0.03,0.13,0.19,0.22,0.24,0.24,0.23,0.18,0.13,0.05,0,0,0,0],
  [0,0,0,0,0,0,0,0,0.02,0.06,0.08,0.09,0.07,0.05,0.01,0,0,0,0,0],
];

function makeGaussianBlob(size, peak) {
  const cells = [];
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy) / (size / 2);
      row.push(r < 1 ? peak * (1 - r * r) * (1 + 0.1 * Math.sin(6 * Math.atan2(dy, dx))) : 0);
    }
    cells.push(row);
  }
  return cells;
}

function makeRing(size, innerR, outerR, peak) {
  const cells = [];
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const r = Math.sqrt((x-c)*(x-c) + (y-c)*(y-c)) / (size/2);
      const inRing = r >= innerR && r <= outerR;
      row.push(inRing ? peak * Math.exp(-((r - (innerR+outerR)/2)/(outerR-innerR))*(( r - (innerR+outerR)/2)/(outerR-innerR))*2) : 0);
    }
    cells.push(row);
  }
  return cells;
}

const PRESETS = {
  orbium: {
    name: "Orbium",
    desc: "The iconic Lenia glider — smooth diagonal locomotion",
    R: 13, T: 10, mu: 0.15, sigma: 0.017,
    kernelMu: 0.5, kernelSigma: 0.15, rings: null,
    seed: "orbium", count: 3,
  },
  geminium: {
    name: "Geminium",
    desc: "Self-replication through mitosis-like division",
    R: 10, T: 10, mu: 0.14, sigma: 0.014,
    kernelMu: 0.5, kernelSigma: 0.14, rings: null,
    seed: "blob", count: 4,
  },
  scutium: {
    name: "Scutium",
    desc: "Shield-shaped — rotational morphology",
    R: 12, T: 10, mu: 0.16, sigma: 0.02,
    kernelMu: 0.5, kernelSigma: 0.16, rings: null,
    seed: "ring", count: 3,
  },
  smoothlife: {
    name: "SmoothLife",
    desc: "Wide kernel — amoeboid pulsation and fission",
    R: 18, T: 10, mu: 0.12, sigma: 0.012,
    kernelMu: 0.5, kernelSigma: 0.12, rings: null,
    seed: "blob", count: 2,
  },
  wanderer: {
    name: "Wanderer",
    desc: "Tight growth band — fast locomotion",
    R: 13, T: 10, mu: 0.135, sigma: 0.013,
    kernelMu: 0.5, kernelSigma: 0.13, rings: null,
    seed: "orbium", count: 4,
  },
  primordial: {
    name: "Primordial Soup",
    desc: "Random initial — watch species emerge from noise",
    R: 13, T: 10, mu: 0.15, sigma: 0.017,
    kernelMu: 0.5, kernelSigma: 0.15, rings: null,
    seed: "soup", count: 1,
  },
};

function placeSeed(grid, cells, cx, cy) {
  const h = cells.length, w = cells[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = ((cx - Math.floor(w / 2) + x) % N + N) % N;
      const gy = ((cy - Math.floor(h / 2) + y) % N + N) % N;
      grid[gy * N + gx] = Math.max(grid[gy * N + gx], cells[y][x]);
    }
  }
}

function initGrid(seedType, count) {
  const grid = new Float64Array(N * N);
  if (seedType === "soup") {
    // Random blobs scattered
    for (let i = 0; i < 12; i++) {
      const cx = Math.floor(Math.random() * N);
      const cy = Math.floor(Math.random() * N);
      const size = 8 + Math.floor(Math.random() * 12);
      placeSeed(grid, makeGaussianBlob(size, 0.5 + Math.random() * 0.5), cx, cy);
    }
    return grid;
  }
  const seedFn = seedType === "orbium" ? () => ORBIUM_CELLS
    : seedType === "ring" ? () => makeRing(16, 0.3, 0.7, 0.9)
    : () => makeGaussianBlob(14, 0.85);
  for (let i = 0; i < (count || 1); i++) {
    const cx = Math.floor(N * 0.15 + Math.random() * N * 0.7);
    const cy = Math.floor(N * 0.15 + Math.random() * N * 0.7);
    placeSeed(grid, seedFn(), cx, cy);
  }
  return grid;
}

// ═══════════════ Colormaps ═══════════════

function inferno(t) {
  // Attempt at replicating matplotlib inferno, piecewise linear
  const stops = [
    [0.0, 0, 0, 4], [0.13, 40, 11, 84], [0.25, 101, 21, 110],
    [0.38, 159, 42, 99], [0.5, 212, 72, 66], [0.63, 245, 125, 21],
    [0.75, 250, 175, 12], [0.88, 245, 220, 75], [1.0, 252, 255, 164],
  ];
  if (t <= 0) return stops[0].slice(1);
  if (t >= 1) return stops[stops.length - 1].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
      return [
        stops[i-1][1] + (stops[i][1] - stops[i-1][1]) * s,
        stops[i-1][2] + (stops[i][2] - stops[i-1][2]) * s,
        stops[i-1][3] + (stops[i][3] - stops[i-1][3]) * s,
      ];
    }
  }
  return [252, 255, 164];
}

function magma(t) {
  const stops = [
    [0.0, 0, 0, 4], [0.13, 28, 16, 68], [0.25, 79, 18, 123],
    [0.38, 129, 37, 129], [0.5, 181, 54, 122], [0.63, 229, 80, 100],
    [0.75, 251, 135, 97], [0.88, 254, 194, 140], [1.0, 252, 253, 191],
  ];
  if (t <= 0) return stops[0].slice(1);
  if (t >= 1) return stops[stops.length - 1].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
      return [
        stops[i-1][1] + (stops[i][1] - stops[i-1][1]) * s,
        stops[i-1][2] + (stops[i][2] - stops[i-1][2]) * s,
        stops[i-1][3] + (stops[i][3] - stops[i-1][3]) * s,
      ];
    }
  }
  return [252, 253, 191];
}

function viridis(t) {
  const stops = [
    [0.0, 68, 1, 84], [0.13, 72, 36, 117], [0.25, 64, 67, 135],
    [0.38, 52, 95, 141], [0.5, 41, 121, 142], [0.63, 33, 148, 140],
    [0.75, 53, 183, 121], [0.88, 109, 206, 89], [1.0, 253, 231, 37],
  ];
  if (t <= 0) return stops[0].slice(1);
  if (t >= 1) return stops[stops.length - 1].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
      return [
        stops[i-1][1] + (stops[i][1] - stops[i-1][1]) * s,
        stops[i-1][2] + (stops[i][2] - stops[i-1][2]) * s,
        stops[i-1][3] + (stops[i][3] - stops[i-1][3]) * s,
      ];
    }
  }
  return [253, 231, 37];
}

function bioluminescent(t) {
  const stops = [
    [0.0, 2, 4, 15], [0.15, 8, 20, 60], [0.3, 15, 50, 100],
    [0.45, 20, 90, 130], [0.6, 40, 160, 160], [0.75, 100, 210, 180],
    [0.88, 180, 240, 200], [1.0, 240, 255, 235],
  ];
  if (t <= 0) return stops[0].slice(1);
  if (t >= 1) return stops[stops.length - 1].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
      return [
        stops[i-1][1] + (stops[i][1] - stops[i-1][1]) * s,
        stops[i-1][2] + (stops[i][2] - stops[i-1][2]) * s,
        stops[i-1][3] + (stops[i][3] - stops[i-1][3]) * s,
      ];
    }
  }
  return [240, 255, 235];
}

const COLORMAPS = { inferno, magma, viridis, bioluminescent };
const COLORMAP_NAMES = Object.keys(COLORMAPS);

// ═══════════════ UI Components ═══════════════

function Slider({ label, value, onChange, min, max, step: s, color, desc }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color: color || "#d4dae8", fontWeight: 600 }}>
          {typeof value === "number" ? (value < 0.1 ? value.toFixed(4) : value < 1 ? value.toFixed(3) : value.toFixed(1)) : value}
        </span>
      </div>
      <input type="range" min={min} max={max} step={s} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, outline: "none", cursor: "pointer" }} />
      {desc && <div style={{ fontSize: 8, color: "#3a4b6a", marginTop: 2 }}>{desc}</div>}
    </div>
  );
}

// ═══════════════ Main Component ═══════════════

export default function Lenia() {
  const canvasRef = useRef(null);
  const offCanvasRef = useRef(null); // offscreen sim-resolution canvas
  const bloomCanvasRef = useRef(null);
  const gridRef = useRef(null);
  const trailRef = useRef(null);
  const potentialRef = useRef(new Float64Array(N * N));
  const kernelFFTRef = useRef(null);
  const animRef = useRef(null);

  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("orbium");
  const [R, setR] = useState(13);
  const [mu, setMu] = useState(0.15);
  const [sigma, setSigma] = useState(0.017);
  const [dt, setDt] = useState(0.1);
  const [kernelMu, setKernelMu] = useState(0.5);
  const [kernelSigma, setKernelSigma] = useState(0.15);
  const [colormap, setColormap] = useState("inferno");
  const [viewMode, setViewMode] = useState("state"); // state, potential, growth, composite
  const [showTrails, setShowTrails] = useState(true);
  const [bloom, setBloom] = useState(true);
  const [stepsPerFrame, setStepsPerFrame] = useState(2);
  const [brushSize, setBrushSize] = useState(8);
  const [frameCount, setFrameCount] = useState(0);
  const [mass, setMass] = useState(0);
  const [drawing, setDrawing] = useState(false);

  const paramsRef = useRef({ mu, sigma, dt, stepsPerFrame, colormap, viewMode, showTrails, bloom });
  useEffect(() => {
    paramsRef.current = { mu, sigma, dt, stepsPerFrame, colormap, viewMode, showTrails, bloom };
  }, [mu, sigma, dt, stepsPerFrame, colormap, viewMode, showTrails, bloom]);

  // Rebuild kernel when kernel params change
  useEffect(() => {
    kernelFFTRef.current = buildKernelFFT(R, kernelMu, kernelSigma, null);
  }, [R, kernelMu, kernelSigma]);

  // Create offscreen canvases
  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = N; off.height = N;
    offCanvasRef.current = off;
    const bl = document.createElement("canvas");
    bl.width = DISPLAY; bl.height = DISPLAY;
    bloomCanvasRef.current = bl;
  }, []);

  const loadPreset = useCallback((id) => {
    const p = PRESETS[id];
    setPreset(id);
    setR(p.R); setMu(p.mu); setSigma(p.sigma); setDt(1 / p.T);
    setKernelMu(p.kernelMu); setKernelSigma(p.kernelSigma);
    kernelFFTRef.current = buildKernelFFT(p.R, p.kernelMu, p.kernelSigma, p.rings);
    gridRef.current = initGrid(p.seed, p.count);
    trailRef.current = new Float64Array(N * N);
    potentialRef.current = new Float64Array(N * N);
    setFrameCount(0);
  }, []);

  const reset = useCallback(() => {
    const p = PRESETS[preset];
    gridRef.current = initGrid(p.seed, p.count);
    trailRef.current = new Float64Array(N * N);
    potentialRef.current = new Float64Array(N * N);
    setFrameCount(0);
  }, [preset]);

  // Init on mount
  useEffect(() => {
    kernelFFTRef.current = buildKernelFFT(R, kernelMu, kernelSigma, null);
    gridRef.current = initGrid("orbium", 3);
    trailRef.current = new Float64Array(N * N);
  }, []);

  // Drawing
  const drawOnGrid = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !gridRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = N / rect.width, scaleY = N / rect.height;
    const mx = Math.floor((e.clientX - rect.left) * scaleX);
    const my = Math.floor((e.clientY - rect.top) * scaleY);
    const r = brushSize;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const gx = ((mx + dx) % N + N) % N;
        const gy = ((my + dy) % N + N) % N;
        const falloff = 1 - Math.sqrt(d2) / r;
        gridRef.current[gy * N + gx] = Math.min(1, gridRef.current[gy * N + gx] + falloff * 0.4);
      }
    }
  }, [brushSize]);

  // Animation loop
  useEffect(() => {
    if (!running) return;
    let active = true;

    const loop = () => {
      if (!active || !gridRef.current || !kernelFFTRef.current) return;
      const { mu: pMu, sigma: pSigma, dt: pDt, stepsPerFrame: spf,
              colormap: cm, viewMode: vm, showTrails: st, bloom: bl } = paramsRef.current;
      const colFn = COLORMAPS[cm] || inferno;

      // Simulate
      for (let s = 0; s < spf; s++) {
        leniaStep(gridRef.current, kernelFFTRef.current.re, kernelFFTRef.current.im,
                  pMu, pSigma, pDt, potentialRef.current);
      }

      // Update trails
      const trail = trailRef.current;
      const grid = gridRef.current;
      if (st) {
        for (let i = 0; i < N * N; i++) {
          trail[i] = Math.max(grid[i], trail[i] * 0.96);
        }
      }

      // Render to offscreen canvas at sim resolution
      const off = offCanvasRef.current;
      if (!off) { animRef.current = requestAnimationFrame(loop); return; }
      const octx = off.getContext("2d");
      const img = octx.createImageData(N, N);

      let m = 0;
      for (let i = 0; i < N * N; i++) {
        const v = grid[i];
        m += v;
        let t;
        if (vm === "potential") {
          // Potential field — normalize to [0, 0.5] typical range
          t = Math.min(1, potentialRef.current[i] * 3);
        } else if (vm === "growth") {
          const u = potentialRef.current[i];
          const g = 2.0 * Math.exp(-((u - pMu) * (u - pMu)) / (2 * pSigma * pSigma)) - 1.0;
          t = g * 0.5 + 0.5; // map [-1,1] to [0,1]
        } else if (vm === "composite" && st) {
          // Composite: trail halo + state + growth shimmer
          const trailVal = trail[i];
          const u = potentialRef.current[i];
          const g = 2.0 * Math.exp(-((u - pMu) * (u - pMu)) / (2 * pSigma * pSigma)) - 1.0;
          // Blend trail (faint) with state (strong) and growth (tint)
          t = Math.min(1, v * 0.85 + trailVal * 0.15 + Math.max(0, g) * 0.1);
        } else {
          t = st ? Math.min(1, v * 0.8 + trail[i] * 0.2) : v;
        }
        const c = colFn(t);
        const idx = i * 4;
        img.data[idx] = c[0];
        img.data[idx + 1] = c[1];
        img.data[idx + 2] = c[2];
        img.data[idx + 3] = 255;
      }
      octx.putImageData(img, 0, 0);

      // Render to display canvas with smooth interpolation
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(off, 0, 0, DISPLAY, DISPLAY);

        // Bloom pass
        if (bl) {
          const bCanvas = bloomCanvasRef.current;
          if (bCanvas) {
            const bctx = bCanvas.getContext("2d");
            bctx.clearRect(0, 0, DISPLAY, DISPLAY);
            bctx.filter = "blur(12px) brightness(1.2)";
            bctx.drawImage(canvas, 0, 0);
            bctx.filter = "none";
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = 0.2;
            ctx.drawImage(bCanvas, 0, 0);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1.0;
          }
        }
      }

      setMass(m);
      setFrameCount(f => f + 1);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running]);

  // Kernel mini-visualization
  const kernelVizRef = useRef(null);
  useEffect(() => {
    const kc = kernelVizRef.current;
    if (!kc) return;
    const ctx = kc.getContext("2d");
    const s = 80;
    kc.width = s; kc.height = s;
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        const k = r <= 1 ? Math.exp(-((r - kernelMu) * (r - kernelMu)) / (2 * kernelSigma * kernelSigma)) : 0;
        const idx = (y * s + x) * 4;
        img.data[idx] = k * 245; img.data[idx + 1] = k * 158; img.data[idx + 2] = k * 11; img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [kernelMu, kernelSigma]);

  // Growth function mini-visualization
  const growthVizRef = useRef(null);
  useEffect(() => {
    const gc = growthVizRef.current;
    if (!gc) return;
    const ctx = gc.getContext("2d");
    const w = 160, h = 40;
    gc.width = w; gc.height = h;
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1a2236";
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 0.5; // [0, 0.5]
      const g = 2.0 * Math.exp(-((u - mu) * (u - mu)) / (2 * sigma * sigma)) - 1.0;
      const py = h / 2 - g * (h / 2 - 2);
      if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
    // Mark mu
    const mx = (mu / 0.5) * w;
    ctx.strokeStyle = "#f59e0b44";
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, h); ctx.stroke();
  }, [mu, sigma]);

  return (
    <div style={{ "--mono": "'JetBrains Mono', monospace", padding: "16px 12px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#f59e0b", fontFamily: "var(--mono)", margin: 0 }}>
          ◉ LENIA
        </h2>
        <div style={{ fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginTop: 4 }}>
          Bert Wang-Chak Chan (2018) · Continuous Space · Continuous Time · Continuous States · FFT Convolution
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {/* ══════ Controls Panel ══════ */}
        <div style={{ width: 230, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 16, flexShrink: 0 }}>
          {/* Presets */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Species Presets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "4px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                border: preset === id ? "1px solid #f59e0b44" : "1px solid #1a2236",
                background: preset === id ? "#f59e0b18" : "#0a0f1a",
                color: preset === id ? "#f59e0b" : "#5a6b8a",
                fontFamily: "var(--mono)", letterSpacing: "0.03em",
              }}>{p.name}</button>
            ))}
          </div>
          {PRESETS[preset] && <div style={{ fontSize: 8, color: "#4a5b7a", marginBottom: 10, fontFamily: "var(--mono)", fontStyle: "italic" }}>{PRESETS[preset].desc}</div>}

          {/* Kernel section */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Kernel K(r)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <canvas ref={kernelVizRef} width={80} height={80} style={{ borderRadius: 4, border: "1px solid #1a2236", width: 60, height: 60 }} />
            <div style={{ flex: 1 }}>
              <Slider label="R" value={R} onChange={v => setR(Math.round(v))} min={5} max={25} step={1} color="#f59e0b" />
              <Slider label="Peak μ" value={kernelMu} onChange={setKernelMu} min={0.1} max={0.9} step={0.01} color="#f59e0b" />
              <Slider label="Width σ" value={kernelSigma} onChange={setKernelSigma} min={0.02} max={0.35} step={0.005} color="#f59e0b" />
            </div>
          </div>

          {/* Growth section */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Growth G(u)</div>
          <canvas ref={growthVizRef} width={160} height={40} style={{ width: "100%", height: 30, borderRadius: 4, border: "1px solid #1a2236", marginBottom: 6 }} />
          <Slider label="Growth μ" value={mu} onChange={setMu} min={0.01} max={0.4} step={0.002} color="#22d3ee" desc="Optimal neighborhood density" />
          <Slider label="Growth σ" value={sigma} onChange={setSigma} min={0.001} max={0.08} step={0.001} color="#22d3ee" desc="Tolerance width" />
          <Slider label="Δt" value={dt} onChange={setDt} min={0.02} max={0.2} step={0.005} color="#22d3ee" desc="Time resolution (1/T)" />
          <Slider label="Steps/frame" value={stepsPerFrame} onChange={v => setStepsPerFrame(Math.round(v))} min={1} max={5} step={1} color="#22d3ee" />

          {/* Drawing */}
          <Slider label="Brush size" value={brushSize} onChange={v => setBrushSize(Math.round(v))} min={2} max={20} step={1} color="#34d399" desc="Click canvas to paint matter" />

          {/* View controls */}
          <div style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, marginTop: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Visualization</div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
            {["state", "potential", "growth", "composite"].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 8, cursor: "pointer",
                border: viewMode === m ? "1px solid #a78bfa44" : "1px solid #1a2236",
                background: viewMode === m ? "#a78bfa18" : "#0a0f1a",
                color: viewMode === m ? "#a78bfa" : "#5a6b8a",
                fontFamily: "var(--mono)", textTransform: "capitalize",
              }}>{m}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
            {COLORMAP_NAMES.map(cm => (
              <button key={cm} onClick={() => setColormap(cm)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: colormap === cm ? "1px solid #f59e0b44" : "1px solid #1a2236",
                background: colormap === cm ? "#f59e0b18" : "#0a0f1a",
                color: colormap === cm ? "#f59e0b" : "#5a6b8a",
                fontFamily: "var(--mono)", textTransform: "capitalize",
              }}>{cm}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button onClick={() => setShowTrails(!showTrails)} style={{
              flex: 1, padding: "4px", border: "1px solid #1a2236", borderRadius: 3,
              background: showTrails ? "#f59e0b12" : "#0a0f1a", color: showTrails ? "#f59e0b" : "#5a6b8a",
              fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{showTrails ? "◉ Trails" : "◯ Trails"}</button>
            <button onClick={() => setBloom(!bloom)} style={{
              flex: 1, padding: "4px", border: "1px solid #1a2236", borderRadius: 3,
              background: bloom ? "#a78bfa12" : "#0a0f1a", color: bloom ? "#a78bfa" : "#5a6b8a",
              fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{bloom ? "◉ Bloom" : "◯ Bloom"}</button>
          </div>

          {/* Playback */}
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
          <button onClick={() => { gridRef.current = new Float64Array(N * N); trailRef.current = new Float64Array(N * N); setFrameCount(0); }} style={{
            width: "100%", padding: "5px", marginTop: 6, border: "1px solid #1a2236", borderRadius: 4,
            background: "#0a0f1a", color: "#5a6b8a",
            fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.06em",
          }}>CLEAR FIELD</button>

          {/* Stats */}
          <div style={{ marginTop: 8, fontSize: 9, color: "#5a6b8a", fontFamily: "var(--mono)", textAlign: "center", lineHeight: 1.6 }}>
            {N}×{N} · R={R} · Δt={dt.toFixed(2)} · frame {frameCount}<br />
            mass: {mass.toFixed(1)} · FFT convolution
          </div>

          {/* Theory box */}
          <div style={{ marginTop: 10, padding: 10, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>
              Lenia Update Rule
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.7, color: "#3a4b6a", fontFamily: "var(--mono)" }}>
              U(x) = K ∗ A&nbsp;&nbsp;<span style={{ color: "#2a3b5a" }}>(via FFT)</span><br />
              G(u) = 2·exp(−(u−μ)²/2σ²) − 1<br />
              A<sup>t+Δt</sup> = clip(A<sup>t</sup> + Δt·G(U), 0, 1)<br />
              <span style={{ fontSize: 7, color: "#2a3b5a" }}>
                K(r) = exp(−(r−μ<sub>K</sub>)²/2σ<sub>K</sub>²) / ΣK<br />
                400+ species · 18 families
              </span>
            </div>
          </div>
        </div>

        {/* ══════ Canvas ══════ */}
        <div style={{ background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 10 }}>
          <canvas
            ref={canvasRef}
            width={DISPLAY} height={DISPLAY}
            onMouseDown={e => { setDrawing(true); drawOnGrid(e); }}
            onMouseMove={e => { if (drawing) drawOnGrid(e); }}
            onMouseUp={() => setDrawing(false)}
            onMouseLeave={() => setDrawing(false)}
            style={{
              width: DISPLAY, height: DISPLAY,
              borderRadius: 6, display: "block", cursor: "crosshair",
              boxShadow: "0 0 60px rgba(245,158,11,0.04)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 8, color: "#3a4b6a", fontFamily: "var(--mono)" }}>
            <span>Click to paint matter · Scroll presets to explore species</span>
            <span>View: {viewMode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}