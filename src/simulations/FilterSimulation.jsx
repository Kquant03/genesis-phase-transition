// ═══════════════════════════════════════════════════════════════════════════
//  FILTER SIMULATION — Ghost Layer as Selection Geometry (v2)
//
//  The 7th Genesis substrate. Civilizations as agents in (expansion,
//  coupling) space. Watch the filter select out grabby lineages in real
//  time. Run the full phase-diagram sweep with one click.
//
//  v2 additions:
//    • Fission dynamics (naive + architected modes)
//    • Horizontal trait transfer (rare crossover in trait space)
//    • Cumulative-cost death-mode attribution
//    • Seeded RNG with visible, shareable seed
//    • URL-hash serialization of full parameter state
//    • Comparison mode: split-screen with shared seed
//    • CSV export of run history
//    • Click-to-inspect agent panel
//    • Death trails and continuous hue-by-trait coloring
//    • Phase-diagram gallery (keep last 4 sweeps)
//    • Trajectory legend that matches phase-space dot colors
//
//  Based on: Sebastian & Claude (2026), "Against Grabby Expansion:
//  Psychology, Alignment, and the Design of Homeostatic Minds," §5, §5.3.
//
//  Part of the Teármann Research Ecosystem · Replete AI
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Physics constants ──────────────────────────────────────────────────────
const GROWTH_RATE = 0.05;
const CARRYING_CAPACITY = 1.0;
const VIABILITY_THRESHOLD = 0.01;
const TAU = 1.0;
const L_HARD_CAP = 50.0;
const R_HARD_CAP = 2.0;
const POP_CAP = 2000;          // safety cap for fission blooms

const ACCENT = "#8AAFC8";
const GRABBY_COLOR = "232, 63, 63";
const GHOST_COLOR = "127, 175, 179";
const BALANCED_COLOR = "145, 230, 147";

// ─── Seeded RNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller normal sample
function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Agent factory ──────────────────────────────────────────────────────────
let NEXT_AGENT_ID = 0;
function createAgent(e, c, lineageRoot = null, parentId = null, parentE = null, parentC = null, bornAt = 0) {
  const id = NEXT_AGENT_ID++;
  return {
    id,
    e: Math.max(0.001, Math.min(1, e)),
    c: Math.max(0.001, Math.min(1, c)),
    R: 1.0,
    L: 0.0,
    age: 0,
    alive: true,
    // Cumulative cost tracking — honest death-mode attribution
    cumExpCost: 0,
    cumShockImpact: 0,
    deathMode: null,
    deathAge: null,
    lineageRoot: lineageRoot === null ? id : lineageRoot,
    parentId,
    // For lineage-link rendering: where the parent was in (e,c) space and when this agent was born
    parentE, parentC, bornAt,
    fissions: 0,
    opacity: 1.0,
  };
}

// ─── Single step of agent dynamics ──────────────────────────────────────────
// Returns a daughter agent if fission occurs, else null.
function stepAgent(agent, params, rng) {
  if (!agent.alive) {
    agent.opacity = Math.max(0, agent.opacity - 0.01);
    return null;
  }
  const { alpha, beta, gamma, shockRate, shockSigma, fissionMode, lFiss, etaE, etaC, alphaReduction } = params;

  // Effective alpha: architected daughters inherit reduced expansion cost
  const effectiveAlpha = (fissionMode === "architected" && agent.parentId !== null)
    ? alpha * alphaReduction
    : alpha;

  const growth = GROWTH_RATE * agent.R * (1 - agent.R / CARRYING_CAPACITY);
  const expCost = effectiveAlpha * agent.e * agent.R * (agent.L * agent.L) / TAU;
  const couplingBenefit = gamma * agent.c;

  let shock = 0;
  if (rng() < shockRate) shock = Math.abs(randn(rng)) * shockSigma;
  const shockImpact = shock * agent.R * (1 - couplingBenefit);

  const newR = agent.R + growth - expCost - shockImpact;

  // Track cumulative costs for death-mode attribution
  agent.cumExpCost += expCost;
  agent.cumShockImpact += shockImpact;

  if (!Number.isFinite(newR)) {
    agent.alive = false;
    agent.deathMode = "burnout";
    agent.deathAge = agent.age;
    agent.R = 0;
    return null;
  }

  agent.R = Math.min(R_HARD_CAP, newR);
  agent.L = Math.min(L_HARD_CAP, agent.L + beta * agent.e * Math.max(0, agent.R));
  agent.age += 1;

  if (agent.R <= VIABILITY_THRESHOLD) {
    agent.alive = false;
    // Honest attribution: whichever accumulated cost was larger over lifetime
    agent.deathMode = agent.cumExpCost > agent.cumShockImpact ? "burnout" : "shock";
    agent.deathAge = agent.age;
    agent.R = 0;
    return null;
  }

  // Fission check
  if (fissionMode !== "off" && agent.L >= lFiss && agent.alive) {
    agent.R = agent.R / 2;
    agent.L = lFiss / 2;
    agent.fissions += 1;
    const dE = agent.e + randn(rng) * etaE;
    const dC = agent.c + randn(rng) * etaC;
    const daughter = createAgent(
      dE, dC,
      agent.lineageRoot, agent.id,
      agent.e, agent.c,
      0  // bornAt will be set by the caller, who has access to runner.t
    );
    return daughter;
  }

  return null;
}

// ─── Phase-diagram single-lineage simulation ────────────────────────────────
function simulateLineage(e, c, params, rng, maxSteps) {
  let R = 1.0, L = 0.0;
  for (let t = 0; t < maxSteps; t++) {
    const growth = GROWTH_RATE * R * (1 - R / CARRYING_CAPACITY);
    const expCost = params.alpha * e * R * (L * L) / TAU;
    const couplingBenefit = params.gamma * c;
    let shock = 0;
    if (rng() < params.shockRate) shock = Math.abs(randn(rng)) * params.shockSigma;
    const shockImpact = shock * R * (1 - couplingBenefit);
    const newR = R + growth - expCost - shockImpact;
    if (!Number.isFinite(newR)) return t;
    R = Math.min(R_HARD_CAP, newR);
    L = Math.min(L_HARD_CAP, L + params.beta * e * Math.max(0, R));
    if (R <= VIABILITY_THRESHOLD) return t;
  }
  return maxSteps;
}

// ─── Population initializers ────────────────────────────────────────────────
const SCENARIOS = {
  diverse: {
    label: "Diverse (uniform)",
    build: (rng) => Array.from({ length: 180 }, () => createAgent(rng(), rng())),
  },
  grabby: {
    label: "Pure grabby cohort",
    build: (rng) => Array.from({ length: 180 }, () =>
      createAgent(0.6 + rng() * 0.4, rng() * 0.3)),
  },
  ghost: {
    label: "Ghost cohort",
    build: (rng) => Array.from({ length: 180 }, () =>
      createAgent(rng() * 0.25, 0.6 + rng() * 0.4)),
  },
  balanced: {
    label: "Balanced partials",
    build: (rng) => Array.from({ length: 180 }, () =>
      createAgent(0.3 + rng() * 0.4, 0.3 + rng() * 0.4)),
  },
  adversarial: {
    label: "Grabby + ghost mix",
    build: (rng) => [
      ...Array.from({ length: 90 }, () =>
        createAgent(0.7 + rng() * 0.3, rng() * 0.2)),
      ...Array.from({ length: 90 }, () =>
        createAgent(rng() * 0.2, 0.7 + rng() * 0.3)),
    ],
  },
};

// ─── URL-hash serialization ─────────────────────────────────────────────────
function serializeState(s) {
  return Object.entries(s).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
function parseStateHash() {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const h = window.location.hash.slice(1);
  if (!h) return null;
  const out = {};
  for (const kv of h.split("&")) {
    const [k, v] = kv.split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

// ─── Helpers for hue continuously by (e - c) ────────────────────────────────
function agentColor(a) {
  // Continuous hue by (e - c): -1 → ghost teal; 0 → balanced green; +1 → grabby red
  // Ghost→balanced routes through luminous aquamarine so the transition blooms
  const t = (a.e - a.c + 1) / 2; // [0, 1]
  if (t < 0.25) {
    // ghost teal → bright aquamarine
    return mix([127, 175, 179], [92, 218, 200], t * 4);
  } else if (t < 0.5) {
    // bright aquamarine → balanced green
    return mix([92, 218, 200], [145, 230, 147], (t - 0.25) * 4);
  } else if (t < 0.75) {
    // balanced green → warm amber warning
    return mix([145, 230, 147], [210, 160, 90], (t - 0.5) * 4);
  } else {
    // warm amber → grabby red
    return mix([210, 160, 90], [232, 63, 63], (t - 0.75) * 4);
  }
}
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  RUNNER — a single simulation instance (used both singly and paired)
// ═══════════════════════════════════════════════════════════════════════════

function createRunner(seed, scenario, params) {
  const rng = mulberry32(seed);
  const pop = SCENARIOS[scenario].build(rng);
  return {
    pop,
    rng,
    t: 0,
    trajHistory: { grabby: [], ghost: [], balanced: [] },
    historyLog: [], // for CSV export
  };
}

function stepRunner(runner, params, stepsPerFrame) {
  if (runner.pop.length >= POP_CAP) {
    runner.capped = true;
    return;
  }
  runner.capped = false;
  for (let s = 0; s < stepsPerFrame; s++) {
    const pop = runner.pop;
    const daughters = [];
    for (let i = 0; i < pop.length; i++) {
      if (pop.length + daughters.length >= POP_CAP) {
        runner.capped = true;
        break;
      }
      const daughter = stepAgent(pop[i], params, runner.rng);
      if (daughter) daughters.push(daughter);
    }
    // Horizontal transfer: Poisson-approximated count of events per step.
    // Uses seeded RNG for determinism.
    if (params.htRate > 0 && pop.length > 1) {
      const expected = params.htRate * pop.length;
      // Cheap Poisson approximation: deterministic integer part + Bernoulli fractional
      const nIntPart = Math.floor(expected);
      const frac = expected - nIntPart;
      const nEvents = nIntPart + (runner.rng() < frac ? 1 : 0);
      for (let k = 0; k < nEvents; k++) {
        const i = Math.floor(runner.rng() * pop.length);
        const j = Math.floor(runner.rng() * pop.length);
        if (i !== j && pop[i].alive && pop[j].alive) {
          const mE = (pop[i].e + pop[j].e) / 2;
          const mC = (pop[i].c + pop[j].c) / 2;
          pop[i].e = pop[i].e + (mE - pop[i].e) * params.htStrength;
          pop[i].c = pop[i].c + (mC - pop[i].c) * params.htStrength;
          pop[j].e = pop[j].e + (mE - pop[j].e) * params.htStrength;
          pop[j].c = pop[j].c + (mC - pop[j].c) * params.htStrength;
        }
      }
    }
    for (const d of daughters) {
      d.bornAt = runner.t;
      runner.pop.push(d);
    }
    runner.t++;

    // Sample trajectories every 4 steps
    if (runner.t % 4 === 0) {
      let gSum = 0, gN = 0, hSum = 0, hN = 0, bSum = 0, bN = 0;
      let alive = 0, grabbyAlive = 0, ghostAlive = 0;
      let meanE = 0, meanC = 0;
      let totalFissions = 0;
      for (const a of runner.pop) {
        if (!a.alive || !Number.isFinite(a.R)) continue;
        alive++;
        meanE += a.e; meanC += a.c;
        totalFissions += a.fissions;
        if (a.e > 0.5 && a.c < 0.3) grabbyAlive++;
        if (a.e < 0.3 && a.c > 0.5) ghostAlive++;
        if (a.e > 0.6 && a.c < 0.3) { gSum += a.R; gN++; }
        if (a.e < 0.3 && a.c > 0.6) { hSum += a.R; hN++; }
        if (Math.abs(a.e - a.c) < 0.2) { bSum += a.R; bN++; }
      }
      if (alive > 0) { meanE /= alive; meanC /= alive; }
      runner.trajHistory.grabby.push({ t: runner.t, R: gN ? gSum / gN : 0 });
      runner.trajHistory.ghost.push({ t: runner.t, R: hN ? hSum / hN : 0 });
      runner.trajHistory.balanced.push({ t: runner.t, R: bN ? bSum / bN : 0 });
      const MAX_HIST = 500;
      for (const k of ["grabby", "ghost", "balanced"]) {
        const h = runner.trajHistory[k];
        if (h.length > MAX_HIST) h.splice(0, h.length - MAX_HIST);
      }

      // Add to CSV history every 20 steps
      if (runner.t % 20 === 0) {
        const lineages = new Set();
        for (const a of runner.pop) if (a.alive) lineages.add(a.lineageRoot);
        runner.historyLog.push({
          t: runner.t, alive, grabbyAlive, ghostAlive,
          meanE, meanC,
          lineages: lineages.size,
          fissions: totalFissions,
          total: runner.pop.length,
        });
      }
    }
  }
}

// Render a single population canvas from a runner
function renderRunner(ctx, W, H, runner, { selectedAgentId, showTrails }) {
  ctx.fillStyle = "#060a12";
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = "#0f1520";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W, y = (i / 10) * H;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Region shading
  ctx.fillStyle = `rgba(${GRABBY_COLOR}, 0.045)`;
  ctx.fillRect(0.5 * W, 0.7 * H, 0.5 * W, 0.3 * H);
  ctx.fillStyle = `rgba(${GHOST_COLOR}, 0.045)`;
  ctx.fillRect(0, 0, 0.3 * W, 0.5 * H);

  // Axis labels
  ctx.fillStyle = "#5a6b8a";
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillText("expansion tendency  e →", W - 170, H - 6);
  ctx.save();
  ctx.translate(12, 170); ctx.rotate(-Math.PI / 2);
  ctx.fillText("substrate coupling  c →", 0, 0);
  ctx.restore();
  ctx.fillStyle = `rgba(${GRABBY_COLOR}, 0.6)`;
  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.fillText("GRABBY", W * 0.75, H * 0.85);
  ctx.fillStyle = `rgba(${GHOST_COLOR}, 0.6)`;
  ctx.fillText("GHOST", W * 0.15, H * 0.25);

  let alive = 0, dead = 0, burnout = 0, shock = 0;
  let grabbyAlive = 0, ghostAlive = 0, deathAgeSum = 0, deathCount = 0;
  let totalFissions = 0;
  const lineageRoots = new Set();

  // Trails first (so they render behind agents)
  // Lineage links: draw a fading line from each daughter to its parent's
  // (e,c) position, for agents born in the last LINK_WINDOW Myr. This makes
  // fission events visible as genealogy arcs in phase space.
  if (showTrails) {
    const LINK_WINDOW = 150; // Myr
    for (const a of runner.pop) {
      if (!a.alive || a.parentId === null || a.parentE === null) continue;
      const age = runner.t - a.bornAt;
      if (age > LINK_WINDOW) continue;
      const fade = 1 - age / LINK_WINDOW;
      const rgb = agentColor(a);
      ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.35 * fade})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a.parentE * W, (1 - a.parentC) * H);
      ctx.lineTo(a.e * W, (1 - a.c) * H);
      ctx.stroke();
    }
  }

  // Agents
  for (const a of runner.pop) {
    if (!Number.isFinite(a.e) || !Number.isFinite(a.c)) continue;
    const x = a.e * W, y = (1 - a.c) * H;

    if (a.alive) {
      alive++;
      totalFissions += a.fissions;
      lineageRoots.add(a.lineageRoot);
      if (a.e > 0.5 && a.c < 0.3) grabbyAlive++;
      if (a.e < 0.3 && a.c > 0.5) ghostAlive++;
      const intensity = Math.min(1, a.R / 0.5);
      const rgb = agentColor(a);
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.35 + intensity * 0.65})`;
      ctx.beginPath();
      ctx.arc(x, y, 3 + intensity * 2, 0, Math.PI * 2);
      ctx.fill();
      if (intensity > 0.5) {
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.08)`;
        ctx.beginPath();
        ctx.arc(x, y, 10 + intensity * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Highlight selected
      if (selectedAgentId === a.id) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (a.opacity > 0) {
      dead++;
      if (a.deathMode === "burnout") burnout++;
      else shock++;
      deathAgeSum += a.deathAge || 0; deathCount++;
      const color = a.deathMode === "burnout" ? GRABBY_COLOR : "131, 109, 201";
      ctx.fillStyle = `rgba(${color}, ${a.opacity * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      dead++;
    }
  }

  // Time / alive indicator
  ctx.fillStyle = "#8a9bba";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.fillText(`t = ${runner.t} Myr`, 12, 20);
  ctx.fillStyle = ACCENT;
  ctx.fillText(`alive: ${alive}/${runner.pop.length}`, W - 140, 20);

  // Pop-cap warning
  if (runner.capped) {
    ctx.fillStyle = "rgba(232, 63, 63, 0.15)";
    ctx.fillRect(W / 2 - 130, H / 2 - 18, 260, 36);
    ctx.fillStyle = "#e83f3f";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`⚠ POP CAP ${POP_CAP} REACHED`, W / 2, H / 2 + 4);
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#e83f3fbb";
    ctx.fillText("fission paused — RESET or raise L_fiss", W / 2, H / 2 + 16);
    ctx.textAlign = "left";
  }

  return {
    alive, dead, burnout, shock, grabbyAlive, ghostAlive,
    meanDeathAge: deathCount ? deathAgeSum / deathCount : 0,
    lineages: lineageRoots.size, totalFissions,
  };
}

// Render trajectory
function renderTraj(tctx, TW, TH, trajHistory) {
  tctx.fillStyle = "#060a12";
  tctx.fillRect(0, 0, TW, TH);
  tctx.strokeStyle = "#1a2236"; tctx.lineWidth = 1;
  tctx.strokeRect(30, 10, TW - 40, TH - 30);
  tctx.strokeStyle = "#1a2236";
  for (const level of [0.25, 0.5, 0.75, 1.0]) {
    const y = 10 + (TH - 40) * (1 - level);
    tctx.beginPath(); tctx.moveTo(30, y); tctx.lineTo(TW - 10, y); tctx.stroke();
    tctx.fillStyle = "#3a4b6a";
    tctx.font = "8px 'JetBrains Mono', monospace";
    tctx.fillText(level.toFixed(2), 4, y + 3);
  }
  const drawTraj = (h, color) => {
    if (h.length < 2) return;
    tctx.strokeStyle = color; tctx.lineWidth = 1.3; tctx.beginPath();
    const tmin = h[0].t, tmax = Math.max(h[h.length - 1].t, tmin + 50);
    for (let i = 0; i < h.length; i++) {
      const x = 30 + ((TW - 40) * (h[i].t - tmin)) / (tmax - tmin);
      const y = 10 + (TH - 40) * (1 - Math.min(1, Math.max(0, h[i].R)));
      if (i === 0) tctx.moveTo(x, y); else tctx.lineTo(x, y);
    }
    tctx.stroke();
  };
  drawTraj(trajHistory.grabby, `rgba(${GRABBY_COLOR}, 0.85)`);
  drawTraj(trajHistory.ghost, `rgba(${GHOST_COLOR}, 0.85)`);
  drawTraj(trajHistory.balanced, `rgba(${BALANCED_COLOR}, 0.85)`);

  // Legend with matching color squares
  tctx.font = "9px 'JetBrains Mono', monospace";
  const legendY = TH - 10;
  let lx = 36;
  const drawDot = (color, label) => {
    tctx.fillStyle = color;
    tctx.beginPath();
    tctx.arc(lx, legendY - 3, 3, 0, Math.PI * 2);
    tctx.fill();
    tctx.fillStyle = "#8a9bba";
    tctx.fillText(label, lx + 8, legendY);
    lx += tctx.measureText(label).width + 24;
  };
  drawDot(`rgb(${GRABBY_COLOR})`, "grabby");
  drawDot(`rgb(${GHOST_COLOR})`, "ghost");
  drawDot(`rgb(${BALANCED_COLOR})`, "balanced");
  tctx.fillStyle = "#5a6b8a";
  tctx.fillText("mean R over time (rolling 500-sample window)", lx + 4, legendY);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function FilterSimulation() {
  // ─── State: parameters ──────────────────────────────────────────────────
  const initial = useMemo(() => {
    const h = parseStateHash();
    const get = (k, fallback, parse = parseFloat) =>
      h && h[k] !== undefined ? parse(h[k]) : fallback;
    return {
      alpha: get("a", 0.5),
      beta: get("b", 0.01),
      gamma: get("g", 0.8),
      shockRate: get("sr", 0.1),
      shockSigma: get("ss", 0.3),
      speed: get("sp", 8, parseInt),
      scenario: (h && h.sc) || "diverse",
      seed: get("sd", 42, parseInt),
      fissionMode: (h && h.fm) || "off",
      lFiss: get("lf", 0.25),
      etaE: get("ee", 0.03),
      etaC: get("ec", 0.03),
      alphaReduction: get("ar", 0.3),
      htRate: get("hr", 0),
      htStrength: get("hs", 0.1),
      compareMode: (h && h.cmp) === "1",
      showTrails: (h && h.tr) !== "0",
    };
  }, []);

  const [alpha, setAlpha] = useState(initial.alpha);
  const [beta, setBeta] = useState(initial.beta);
  const [gamma, setGamma] = useState(initial.gamma);
  const [shockRate, setShockRate] = useState(initial.shockRate);
  const [shockSigma, setShockSigma] = useState(initial.shockSigma);
  const [speed, setSpeed] = useState(initial.speed);
  const [scenario, setScenario] = useState(initial.scenario);
  const [seed, setSeed] = useState(initial.seed);

  const [fissionMode, setFissionMode] = useState(initial.fissionMode);
  const [lFiss, setLFiss] = useState(initial.lFiss);
  const [etaE, setEtaE] = useState(initial.etaE);
  const [etaC, setEtaC] = useState(initial.etaC);
  const [alphaReduction, setAlphaReduction] = useState(initial.alphaReduction);

  const [htRate, setHtRate] = useState(initial.htRate);
  const [htStrength, setHtStrength] = useState(initial.htStrength);

  const [running, setRunning] = useState(true);
  const [compareMode, setCompareMode] = useState(initial.compareMode);
  const [showTrails, setShowTrails] = useState(initial.showTrails);

  // Comparison run parameters (only used when compareMode is on)
  const [compareAlpha, setCompareAlpha] = useState(initial.alpha);
  const [compareFissionMode, setCompareFissionMode] = useState("off");
  const [compareScenario, setCompareScenario] = useState(initial.scenario);

  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedAgentData, setSelectedAgentData] = useState(null);

  // ─── Live stats ─────────────────────────────────────────────────────────
  const emptyStats = () => ({
    t: 0, alive: 0, dead: 0, burnout: 0, shock: 0,
    grabbyAlive: 0, ghostAlive: 0, meanDeathAge: 0,
    lineages: 0, totalFissions: 0,
  });
  const [stats, setStats] = useState(emptyStats());
  const [compareStats, setCompareStats] = useState(emptyStats());

  // ─── Refs mirror params so the render loop runs without remount ─────────
  const paramsRef = useRef({
    alpha: initial.alpha, beta: initial.beta, gamma: initial.gamma,
    shockRate: initial.shockRate, shockSigma: initial.shockSigma,
    speed: initial.speed,
    fissionMode: initial.fissionMode, lFiss: initial.lFiss,
    etaE: initial.etaE, etaC: initial.etaC,
    alphaReduction: initial.alphaReduction,
    htRate: initial.htRate, htStrength: initial.htStrength,
  });
  const compareParamsRef = useRef({
    ...paramsRef.current,
    alpha: initial.alpha,
    fissionMode: "off",
  });
  const runningRef = useRef(running);
  const lastStatsUpdateRef = useRef(0);
  useEffect(() => {
    paramsRef.current = {
      alpha, beta, gamma, shockRate, shockSigma, speed,
      fissionMode, lFiss, etaE, etaC, alphaReduction,
      htRate, htStrength,
    };
  }, [alpha, beta, gamma, shockRate, shockSigma, speed,
      fissionMode, lFiss, etaE, etaC, alphaReduction, htRate, htStrength]);
  useEffect(() => {
    compareParamsRef.current = {
      ...paramsRef.current,
      alpha: compareAlpha,
      fissionMode: compareFissionMode,
    };
  }, [compareAlpha, compareFissionMode, alpha, beta, gamma, shockRate,
      shockSigma, speed, fissionMode, lFiss, etaE, etaC, alphaReduction,
      htRate, htStrength]);
  useEffect(() => { runningRef.current = running; }, [running]);

  // ─── Sync state to URL hash ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = {
      a: alpha.toFixed(3), b: beta.toFixed(3), g: gamma.toFixed(3),
      sr: shockRate.toFixed(3), ss: shockSigma.toFixed(3),
      sp: speed, sc: scenario, sd: seed,
      fm: fissionMode, lf: lFiss.toFixed(3),
      ee: etaE.toFixed(3), ec: etaC.toFixed(3),
      ar: alphaReduction.toFixed(3),
      hr: htRate.toFixed(4), hs: htStrength.toFixed(3),
      cmp: compareMode ? "1" : "0",
      tr: showTrails ? "1" : "0",
    };
    const newHash = "#" + serializeState(s);
    if (window.location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }, [alpha, beta, gamma, shockRate, shockSigma, speed, scenario, seed,
      fissionMode, lFiss, etaE, etaC, alphaReduction, htRate, htStrength,
      compareMode, showTrails]);

  // ─── Runners ────────────────────────────────────────────────────────────
  const runnerA = useRef(null);
  const runnerB = useRef(null);
  const popCanvasARef = useRef(null);
  const popCanvasBRef = useRef(null);
  const trajCanvasRef = useRef(null);
  const trajCanvasBRef = useRef(null);

  const rebuildRunnerA = useCallback(() => {
    runnerA.current = createRunner(seed, scenario, paramsRef.current);
    setStats(emptyStats());
    setSelectedAgentId(null);
    setSelectedAgentData(null);
  }, [seed, scenario]);

  const rebuildRunnerB = useCallback(() => {
    // B uses same seed as A for reproducible comparison
    runnerB.current = createRunner(seed, compareScenario, compareParamsRef.current);
    setCompareStats(emptyStats());
  }, [seed, compareScenario]);

  const resetAll = useCallback(() => {
    rebuildRunnerA();
    if (compareMode) rebuildRunnerB();
  }, [rebuildRunnerA, rebuildRunnerB, compareMode]);

  // Rebuild A when seed or scenario changes
  useEffect(() => { rebuildRunnerA(); }, [rebuildRunnerA]);

  // Rebuild B whenever compareMode toggles on, or when compareScenario changes
  useEffect(() => {
    if (compareMode) {
      rebuildRunnerB();
    } else {
      runnerB.current = null;
      setCompareStats(emptyStats());
    }
  }, [compareMode, rebuildRunnerB]);

  // Refs for render loop — toggling compare or selecting an agent should
  // not tear down the rAF loop.
  const selectedAgentIdRef = useRef(selectedAgentId);
  const compareModeRef = useRef(compareMode);
  const showTrailsRef = useRef(showTrails);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { compareModeRef.current = compareMode; }, [compareMode]);
  useEffect(() => { showTrailsRef.current = showTrails; }, [showTrails]);

  // ─── Render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    let raf;
    const render = () => {
      const isRunning = runningRef.current;
      const { speed: stepsPerFrame } = paramsRef.current;
      const activeCompare = compareModeRef.current;
      const activeSelected = selectedAgentIdRef.current;
      const activeTrails = showTrailsRef.current;

      if (isRunning && runnerA.current) {
        stepRunner(runnerA.current, paramsRef.current, stepsPerFrame);
      }
      if (isRunning && activeCompare && runnerB.current) {
        stepRunner(runnerB.current, compareParamsRef.current, stepsPerFrame);
      }

      // Draw A
      const canvasA = popCanvasARef.current;
      if (canvasA && runnerA.current) {
        const ctx = canvasA.getContext("2d");
        const s = renderRunner(ctx, canvasA.width, canvasA.height,
          runnerA.current,
          { selectedAgentId: activeSelected, showTrails: activeTrails });
        const now = performance.now();
        if (now - lastStatsUpdateRef.current > 100) {
          lastStatsUpdateRef.current = now;
          setStats({ t: runnerA.current.t, ...s });
          if (activeCompare && runnerB.current) {
            // Calculate B stats without re-rendering
            let alive = 0, burnout = 0, shock = 0, grabbyAlive = 0, ghostAlive = 0;
            let fissions = 0;
            const lineages = new Set();
            for (const a of runnerB.current.pop) {
              if (a.alive && Number.isFinite(a.R)) {
                alive++;
                lineages.add(a.lineageRoot);
                fissions += a.fissions;
                if (a.e > 0.5 && a.c < 0.3) grabbyAlive++;
                if (a.e < 0.3 && a.c > 0.5) ghostAlive++;
              } else if (!a.alive) {
                if (a.deathMode === "burnout") burnout++; else shock++;
              }
            }
            setCompareStats({
              t: runnerB.current.t, alive, dead: runnerB.current.pop.length - alive,
              burnout, shock, grabbyAlive, ghostAlive,
              meanDeathAge: 0, lineages: lineages.size, totalFissions: fissions,
            });
          }
          // Update selected agent data if any
          if (activeSelected !== null && runnerA.current) {
            const found = runnerA.current.pop.find((a) => a.id === activeSelected);
            if (found) {
              setSelectedAgentData({
                id: found.id,
                e: found.e, c: found.c, R: found.R, L: found.L,
                age: found.age, alive: found.alive,
                deathMode: found.deathMode, deathAge: found.deathAge,
                lineageRoot: found.lineageRoot, parentId: found.parentId,
                fissions: found.fissions,
              });
            }
          }
        }
      }

      // Draw B if compare
      const canvasB = popCanvasBRef.current;
      if (activeCompare && canvasB && runnerB.current) {
        const ctx = canvasB.getContext("2d");
        renderRunner(ctx, canvasB.width, canvasB.height,
          runnerB.current, { selectedAgentId: null, showTrails: activeTrails });
      }

      // Draw trajectory
      if (trajCanvasRef.current && runnerA.current) {
        const tctx = trajCanvasRef.current.getContext("2d");
        renderTraj(tctx, trajCanvasRef.current.width, trajCanvasRef.current.height,
          runnerA.current.trajHistory);
      }
      if (activeCompare && trajCanvasBRef.current && runnerB.current) {
        const tctx = trajCanvasBRef.current.getContext("2d");
        renderTraj(tctx, trajCanvasBRef.current.width, trajCanvasBRef.current.height,
          runnerB.current.trajHistory);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once; live state via refs

  // ─── Click on canvas to select agent ────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    const canvas = popCanvasARef.current;
    if (!canvas || !runnerA.current) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const W = canvas.width, H = canvas.height;
    // Find nearest alive agent within 20px
    let best = null, bestDist = 30 * 30;
    for (const a of runnerA.current.pop) {
      if (!a.alive) continue;
      const ax = a.e * W, ay = (1 - a.c) * H;
      const d = (clickX - ax) ** 2 + (clickY - ay) ** 2;
      if (d < bestDist) { bestDist = d; best = a; }
    }
    if (best) {
      setSelectedAgentId(best.id);
      setSelectedAgentData({
        id: best.id, e: best.e, c: best.c, R: best.R, L: best.L,
        age: best.age, alive: best.alive,
        deathMode: best.deathMode, deathAge: best.deathAge,
        lineageRoot: best.lineageRoot, parentId: best.parentId,
        fissions: best.fissions,
      });
    } else {
      setSelectedAgentId(null);
      setSelectedAgentData(null);
    }
  }, []);

  // ─── Phase-diagram gallery ──────────────────────────────────────────────
  const [phaseGallery, setPhaseGallery] = useState([]); // up to 4 stored sweeps
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [phaseComputing, setPhaseComputing] = useState(false);

  const computePhaseDiagram = useCallback(() => {
    if (phaseComputing) return;
    setPhaseComputing(true);
    setPhaseProgress(0);
    const N = 22, trials = 8, maxSteps = 1000;
    const grid = new Float32Array(N * N);
    const params = { alpha, beta, gamma, shockRate, shockSigma };
    const prng = mulberry32(1234567);
    let i = 0;
    const chunk = () => {
      const startTime = performance.now();
      while (i < N * N && performance.now() - startTime < 40) {
        const ei = i % N, ci = Math.floor(i / N);
        const e = 0.01 + 0.98 * ei / (N - 1);
        const c = 0.01 + 0.98 * ci / (N - 1);
        let sum = 0;
        for (let t = 0; t < trials; t++) {
          sum += simulateLineage(e, c, params, prng, maxSteps);
        }
        grid[i] = sum / trials;
        i++;
      }
      setPhaseProgress(i / (N * N));
      if (i < N * N) requestAnimationFrame(chunk);
      else {
        let grabbySum = 0, grabbyN = 0, ghostSum = 0, ghostN = 0;
        for (let idx = 0; idx < N * N; idx++) {
          const ei = idx % N, ci = Math.floor(idx / N);
          const e = ei / (N - 1), c = ci / (N - 1);
          if (e > 0.5 && c < 0.3) { grabbySum += grid[idx]; grabbyN++; }
          if (e < 0.3 && c > 0.5) { ghostSum += grid[idx]; ghostN++; }
        }
        const grabbyMean = grabbyN ? grabbySum / grabbyN : 0;
        const ghostMean = ghostN ? ghostSum / ghostN : 0;
        setPhaseGallery((g) => [
          {
            grid, N,
            label: `α=${alpha.toFixed(2)} β=${beta.toFixed(3)} γ=${gamma.toFixed(2)}`,
            grabbyMean, ghostMean,
            ratio: ghostMean / Math.max(1, grabbyMean),
          },
          ...g,
        ].slice(0, 4));
        setPhaseComputing(false);
      }
    };
    requestAnimationFrame(chunk);
  }, [alpha, beta, gamma, shockRate, shockSigma, phaseComputing]);

  // Draw all gallery entries
  const phaseGalleryRefs = useRef([]);
  useEffect(() => {
    phaseGallery.forEach((entry, idx) => {
      const canvas = phaseGalleryRefs.current[idx];
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      const { grid, N } = entry;
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, W, H);
      let gmax = 0;
      for (let i = 0; i < grid.length; i++) gmax = Math.max(gmax, grid[i]);
      const cellW = W / N, cellH = H / N;
      for (let ci = 0; ci < N; ci++) {
        for (let ei = 0; ei < N; ei++) {
          const v = grid[ci * N + ei] / gmax;
          const r = Math.round(68 + v * 187);
          const g = Math.round(1 + v * 200);
          const b = Math.round(84 + (1 - v) * 70);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(ei * cellW, (N - 1 - ci) * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
      ctx.strokeStyle = `rgba(${GRABBY_COLOR}, 0.4)`;
      ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.strokeRect(0.5 * W, 0.7 * H, 0.5 * W, 0.3 * H);
      ctx.strokeStyle = `rgba(${GHOST_COLOR}, 0.4)`;
      ctx.strokeRect(0, 0, 0.3 * W, 0.5 * H);
      ctx.setLineDash([]);
    });
  }, [phaseGallery]);

  // ─── CSV export ─────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!runnerA.current || !runnerA.current.historyLog.length) {
      alert("No history recorded yet. Let the simulation run for a moment before exporting.");
      return;
    }
    const headers = ["t", "alive", "grabbyAlive", "ghostAlive",
                     "meanE", "meanC", "lineages", "fissions", "total"];
    const rows = runnerA.current.historyLog.map((r) =>
      [r.t, r.alive, r.grabbyAlive, r.ghostAlive,
       r.meanE.toFixed(4), r.meanC.toFixed(4),
       r.lineages, r.fissions, r.total].join(","));
    const csv = [
      `# Filter Simulation export`,
      `# seed=${seed} scenario=${scenario}`,
      `# alpha=${alpha} beta=${beta} gamma=${gamma}`,
      `# shockRate=${shockRate} shockSigma=${shockSigma}`,
      `# fissionMode=${fissionMode} lFiss=${lFiss} etaE=${etaE} etaC=${etaC}`,
      `# alphaReduction=${alphaReduction}`,
      `# htRate=${htRate} htStrength=${htStrength}`,
      headers.join(","),
      ...rows,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `filter_run_seed${seed}_${scenario}_t${runnerA.current.t}.csv`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [seed, scenario, alpha, beta, gamma, shockRate, shockSigma,
      fissionMode, lFiss, etaE, etaC, alphaReduction, htRate, htStrength]);

  // ─── Helper: randomize seed ─────────────────────────────────────────────
  const randomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 999999999));
  }, []);

  // ─── Copy share link ────────────────────────────────────────────────────
  const copyShareLink = useCallback(() => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      // Brief visual feedback
      const el = document.getElementById("share-link-btn");
      if (el) {
        const old = el.textContent;
        el.textContent = "COPIED";
        setTimeout(() => { el.textContent = old; }, 1200);
      }
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div style={{
      minHeight: "calc(100vh - 42px)", background: "#060a12",
      color: "#d4dae8", padding: "20px 24px",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20, display: "flex",
                      justifyContent: "space-between", alignItems: "flex-start",
                      flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: "1 1 500px" }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.25em", color: "#5a6b8a",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 6,
            }}>
              GENESIS · SUBSTRATE VII
            </div>
            <h1 style={{
              fontSize: 28, fontWeight: 400, letterSpacing: "0.05em",
              fontFamily: "'Cormorant Garamond', serif", margin: 0,
              color: ACCENT,
            }}>
              The Filter
            </h1>
            <div style={{
              fontSize: 12, color: "#8a9bba", marginTop: 8, lineHeight: 1.6,
              maxWidth: 820, fontWeight: 300,
            }}>
              Agent-based simulation of the selection geometry of homeostasis.
              Each dot is a civilization with inherited expansion
              tendency&nbsp;<em>e</em> and substrate coupling&nbsp;<em>c</em>.
              Expansion pays super-linear thermodynamic cost (Boyd 2022, §5.2);
              coupling reduces vulnerability to shocks. Fission allows lineages
              to split and potentially inherit reduced cost. Click any live
              agent to inspect its state.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6,
                        minWidth: 260 }}>
            <button
              id="share-link-btn"
              onClick={copyShareLink}
              style={{
                background: ACCENT + "12",
                border: `1px solid ${ACCENT}55`,
                borderRadius: 5, color: ACCENT,
                padding: "8px 14px", fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.12em", cursor: "pointer",
              }}
            >
              COPY SHARE LINK
            </button>
            <button
              onClick={exportCSV}
              style={{
                background: "#1a2236",
                border: "1px solid #2a3456",
                borderRadius: 5, color: "#8a9bba",
                padding: "8px 14px", fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.12em", cursor: "pointer",
              }}
            >
              EXPORT CSV (HISTORY)
            </button>
          </div>
        </div>

        {/* Layout: main + sidebar */}
        <div style={{ display: "grid",
                      gridTemplateColumns: "1fr 340px", gap: 20 }}>

          {/* Main visualization area */}
          <div>
            {/* Population canvas(es) */}
            <div style={{ display: "grid",
                          gridTemplateColumns: compareMode ? "1fr 1fr" : "1fr",
                          gap: 14 }}>
              <div>
                {compareMode && (
                  <div style={{
                    fontSize: 9, color: ACCENT, marginBottom: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.12em",
                  }}>
                    RUN A · α={alpha.toFixed(2)} · fission={fissionMode}
                  </div>
                )}
                <div style={{
                  position: "relative", background: "#0b1018",
                  border: "1px solid #1a2236", borderRadius: 8,
                  overflow: "hidden",
                }}>
                  <canvas
                    ref={popCanvasARef}
                    onClick={handleCanvasClick}
                    width={compareMode ? 520 : 800}
                    height={compareMode ? 400 : 520}
                    style={{
                      display: "block", width: "100%", height: "auto",
                      cursor: "crosshair",
                    }}
                  />
                </div>
                <div style={{
                  background: "#0b1018", border: "1px solid #1a2236",
                  borderRadius: 8, padding: 10, marginTop: 10,
                }}>
                  <canvas
                    ref={trajCanvasRef}
                    width={compareMode ? 520 : 800}
                    height={140}
                    style={{ display: "block", width: "100%", height: "auto" }}
                  />
                </div>
              </div>

              {compareMode && (
                <div>
                  <div style={{
                    fontSize: 9, color: "#7FAFB3", marginBottom: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.12em",
                  }}>
                    RUN B · α={compareAlpha.toFixed(2)} · fission={compareFissionMode}
                  </div>
                  <div style={{
                    position: "relative", background: "#0b1018",
                    border: "1px solid #1a2236", borderRadius: 8,
                    overflow: "hidden",
                  }}>
                    <canvas
                      ref={popCanvasBRef}
                      width={520} height={400}
                      style={{ display: "block", width: "100%", height: "auto" }}
                    />
                  </div>
                  <div style={{
                    background: "#0b1018", border: "1px solid #1a2236",
                    borderRadius: 8, padding: 10, marginTop: 10,
                  }}>
                    <canvas
                      ref={trajCanvasBRef}
                      width={520} height={140}
                      style={{ display: "block", width: "100%", height: "auto" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Agent inspector panel */}
            {selectedAgentData && (
              <div style={{
                marginTop: 14, background: "#0b1018",
                border: `1px solid ${ACCENT}55`, borderRadius: 8,
                padding: 14,
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 10,
                }}>
                  <div style={{
                    fontSize: 11, color: ACCENT,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.12em",
                  }}>
                    AGENT INSPECTOR · #{selectedAgentData.id}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAgentId(null);
                      setSelectedAgentData(null);
                    }}
                    style={{
                      background: "none", border: "1px solid #2a3456",
                      borderRadius: 4, color: "#8a9bba",
                      padding: "3px 8px", fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                    }}
                  >
                    CLOSE ✕
                  </button>
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10, fontSize: 11,
                }}>
                  <InspectorField label="expansion e" value={selectedAgentData.e.toFixed(3)} />
                  <InspectorField label="coupling c" value={selectedAgentData.c.toFixed(3)} />
                  <InspectorField label="resources R" value={selectedAgentData.R.toFixed(3)} />
                  <InspectorField label="reach L" value={selectedAgentData.L.toFixed(3)} />
                  <InspectorField label="age (Myr)" value={selectedAgentData.age.toString()} />
                  <InspectorField label="lineage root" value={`#${selectedAgentData.lineageRoot}`} />
                  <InspectorField
                    label="parent"
                    value={selectedAgentData.parentId === null ? "founder"
                                                               : `#${selectedAgentData.parentId}`}
                  />
                  <InspectorField label="fissions" value={selectedAgentData.fissions.toString()} />
                  <InspectorField
                    label="status"
                    value={selectedAgentData.alive ? "alive"
                      : `died (${selectedAgentData.deathMode}) t=${selectedAgentData.deathAge}`}
                    color={selectedAgentData.alive ? "#7FAFB3" : "#e83f3f"}
                  />
                </div>
              </div>
            )}

            {/* Phase diagram gallery */}
            <div style={{
              marginTop: 14, background: "#0b1018",
              border: "1px solid #1a2236", borderRadius: 8, padding: 16,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 12,
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.08em", color: "#d4dae8", marginBottom: 3,
                  }}>
                    PHASE DIAGRAM GALLERY — (e, c) SWEEPS
                  </div>
                  <div style={{ fontSize: 10, color: "#5a6b8a" }}>
                    22×22 grid · 8 trials/cell · 1000-Myr horizon · stores last 4 sweeps for comparison
                  </div>
                </div>
                <button
                  onClick={computePhaseDiagram}
                  disabled={phaseComputing}
                  style={{
                    background: phaseComputing ? "#1a2236" : ACCENT + "22",
                    border: `1px solid ${phaseComputing ? "#2a3456" : ACCENT + "66"}`,
                    borderRadius: 5,
                    color: phaseComputing ? "#5a6b8a" : ACCENT,
                    padding: "6px 14px", fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.08em",
                    cursor: phaseComputing ? "not-allowed" : "pointer",
                  }}
                >
                  {phaseComputing ? `COMPUTING ${Math.round(phaseProgress * 100)}%` : "+ ADD SWEEP"}
                </button>
              </div>

              {phaseGallery.length === 0 ? (
                <div style={{ color: "#5a6b8a", fontSize: 11, lineHeight: 1.6 }}>
                  Click <span style={{ color: ACCENT }}>+ ADD SWEEP</span> to run a
                  phase-diagram calculation for the current parameter settings.
                  Expected runtime: ~5 seconds per sweep. Stored sweeps persist
                  for side-by-side comparison across parameter changes.
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(4, phaseGallery.length)}, 1fr)`,
                  gap: 10,
                }}>
                  {phaseGallery.map((entry, idx) => (
                    <div key={idx} style={{
                      background: "#060a12", border: "1px solid #1a2236",
                      borderRadius: 4, padding: 6,
                    }}>
                      <canvas
                        ref={(el) => (phaseGalleryRefs.current[idx] = el)}
                        width={180} height={180}
                        style={{
                          background: "#060a12", display: "block",
                          width: "100%", height: "auto",
                        }}
                      />
                      <div style={{
                        fontSize: 8, marginTop: 5, color: "#8a9bba",
                        fontFamily: "'JetBrains Mono', monospace",
                        textAlign: "center", lineHeight: 1.5,
                      }}>
                        {entry.label}<br />
                        <span style={{ color: "#7FAFB3" }}>ghost:</span>&nbsp;
                        {entry.ghostMean.toFixed(0)}&nbsp;·&nbsp;
                        <span style={{ color: "#e83f3f" }}>grabby:</span>&nbsp;
                        {entry.grabbyMean.toFixed(0)}<br />
                        <span style={{ color: ACCENT }}>{entry.ratio.toFixed(1)}× separation</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{
            background: "#0b1018", border: "1px solid #1a2236",
            borderRadius: 8, padding: 16, height: "fit-content",
          }}>
            {/* Run / pause / reset */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setRunning((r) => !r)}
                style={{
                  flex: 1,
                  background: running ? ACCENT + "22" : "#1a2236",
                  border: `1px solid ${running ? ACCENT + "66" : "#2a3456"}`,
                  borderRadius: 5, color: running ? ACCENT : "#8a9bba",
                  padding: "6px 10px", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                {running ? "PAUSE" : "RESUME"}
              </button>
              <button
                onClick={resetAll}
                style={{
                  flex: 1, background: "#1a2236",
                  border: "1px solid #2a3456", borderRadius: 5,
                  color: "#8a9bba", padding: "6px 10px", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                RESET
              </button>
            </div>

            {/* Seed */}
            <ParamSection title="REPRODUCIBILITY">
              <div style={{
                display: "flex", gap: 6, alignItems: "center", marginBottom: 8,
              }}>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  style={{
                    flex: 1, background: "#060a12",
                    border: "1px solid #2a3456", borderRadius: 4,
                    color: "#d4dae8", padding: "5px 8px", fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
                <button
                  onClick={randomizeSeed}
                  style={{
                    background: "#1a2236", border: "1px solid #2a3456",
                    borderRadius: 4, color: "#8a9bba",
                    padding: "5px 10px", fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
                  }}
                >
                  ⟲
                </button>
              </div>
              <div style={{
                fontSize: 8, color: "#3a4b6a",
                fontFamily: "'JetBrains Mono', monospace",
                fontStyle: "italic", marginBottom: 4,
              }}>
                seed controls full RNG stream; same seed + params = identical run
              </div>
              <label style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, color: "#8a9bba",
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>
                <input
                  type="checkbox" checked={showTrails}
                  onChange={(e) => setShowTrails(e.target.checked)}
                />
                show fission lineage links
              </label>
            </ParamSection>

            {/* Scenario */}
            <ParamSection title="INITIAL POPULATION">
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                style={{
                  width: "100%", background: "#060a12",
                  border: "1px solid #2a3456", borderRadius: 4,
                  color: "#d4dae8", padding: "6px 8px", fontSize: 11,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                }}
              >
                {Object.entries(SCENARIOS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </ParamSection>

            {/* Dynamics */}
            <ParamSection title="DYNAMICS">
              <Slider label="α  expansion cost" value={alpha}
                min={0} max={2} step={0.01} onChange={setAlpha}
                hint="Boyd (2022) counterdiabatic coefficient" />
              <Slider label="β  reach rate" value={beta}
                min={0.001} max={0.05} step={0.001} onChange={setBeta}
                hint="how fast L accumulates with expansion" />
              <Slider label="γ  coupling benefit" value={gamma}
                min={0} max={1} step={0.01} onChange={setGamma}
                hint="shock-damping from substrate coupling" />
            </ParamSection>

            {/* Environment */}
            <ParamSection title="ENVIRONMENT">
              <Slider label="shock rate" value={shockRate}
                min={0} max={0.5} step={0.01} onChange={setShockRate}
                hint="probability per Myr of a disruption" />
              <Slider label="shock σ" value={shockSigma}
                min={0} max={1} step={0.01} onChange={setShockSigma}
                hint="magnitude distribution width" />
            </ParamSection>

            {/* Fission */}
            <ParamSection title="FISSION">
              <div style={{
                display: "flex", gap: 4, marginBottom: 8,
              }}>
                {["off", "naive", "architected"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFissionMode(mode)}
                    style={{
                      flex: 1,
                      background: fissionMode === mode ? ACCENT + "22" : "#1a2236",
                      border: `1px solid ${fissionMode === mode ? ACCENT + "66" : "#2a3456"}`,
                      borderRadius: 4,
                      color: fissionMode === mode ? ACCENT : "#8a9bba",
                      padding: "4px 6px", fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.06em", cursor: "pointer",
                    }}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
              {fissionMode !== "off" && (
                <>
                  <Slider label="L_fiss threshold" value={lFiss}
                    min={0.05} max={1.5} step={0.01} onChange={setLFiss}
                    hint="reach at which lineage splits" />
                  <Slider label="η_e drift" value={etaE}
                    min={0} max={0.2} step={0.005} onChange={setEtaE}
                    hint="daughter expansion-tendency mutation σ" />
                  <Slider label="η_c drift" value={etaC}
                    min={0} max={0.2} step={0.005} onChange={setEtaC}
                    hint="daughter coupling mutation σ" />
                  {fissionMode === "architected" && (
                    <Slider label="daughter α reduction" value={alphaReduction}
                      min={0.05} max={1} step={0.01} onChange={setAlphaReduction}
                      hint="architected daughters pay α × reduction; 1 = same as parent" />
                  )}
                </>
              )}
              <div style={{
                fontSize: 8, color: "#3a4b6a",
                fontFamily: "'JetBrains Mono', monospace",
                fontStyle: "italic", lineHeight: 1.5, marginTop: 4,
              }}>
                {fissionMode === "off" && "lineages cannot fragment; §5.1 baseline"}
                {fissionMode === "naive" && "daughters inherit traits but pay full α; §5.3 result: filter holds"}
                {fissionMode === "architected" && "infrastructure-sharing daughters inherit reduced α; §5.3 open question"}
              </div>
            </ParamSection>

            {/* Horizontal transfer */}
            <ParamSection title="HORIZONTAL TRANSFER">
              <Slider label="HT rate" value={htRate}
                min={0} max={0.005} step={0.0001} onChange={setHtRate}
                hint="per-agent per-Myr trait-crossover probability" />
              {htRate > 0 && (
                <Slider label="HT strength" value={htStrength}
                  min={0} max={1} step={0.01} onChange={setHtStrength}
                  hint="how far traits move toward partner's" />
              )}
            </ParamSection>

            {/* Observation */}
            <ParamSection title="OBSERVATION">
              <Slider label="steps / frame" value={speed}
                min={1} max={20} step={1} onChange={setSpeed}
                hint="1 Myr per step; higher = faster convergence" />
            </ParamSection>

            {/* Compare mode */}
            <ParamSection title="COMPARISON">
              <label style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, color: "#8a9bba",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer", marginBottom: 8,
              }}>
                <input
                  type="checkbox" checked={compareMode}
                  onChange={(e) => setCompareMode(e.target.checked)}
                />
                split-screen mode (A vs B)
              </label>
              {compareMode && (
                <>
                  <Slider label="B: α expansion cost" value={compareAlpha}
                    min={0} max={2} step={0.01} onChange={setCompareAlpha}
                    hint="independent α for Run B" />
                  <div style={{
                    display: "flex", gap: 4, marginTop: 6,
                  }}>
                    {["off", "naive", "architected"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setCompareFissionMode(mode)}
                        style={{
                          flex: 1,
                          background: compareFissionMode === mode ? "#7FAFB322" : "#1a2236",
                          border: `1px solid ${compareFissionMode === mode ? "#7FAFB366" : "#2a3456"}`,
                          borderRadius: 4,
                          color: compareFissionMode === mode ? "#7FAFB3" : "#8a9bba",
                          padding: "4px 6px", fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.06em", cursor: "pointer",
                        }}
                      >
                        B: {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div style={{
                    fontSize: 8, color: "#3a4b6a", marginTop: 5,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontStyle: "italic",
                  }}>
                    Run B uses same seed and scenario; diff α and fission only
                  </div>
                </>
              )}
            </ParamSection>

            {/* Live stats */}
            <div style={{
              marginTop: 16, paddingTop: 14,
              borderTop: "1px solid #1a2236",
            }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.1em", color: "#5a6b8a",
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
              }}>
                LIVE STATISTICS {compareMode ? "(RUN A)" : ""}
              </div>
              <StatRow label="time (Myr)" value={stats.t.toString()} />
              <StatRow label="alive" value={`${stats.alive}`} />
              <StatRow label="lineages alive" value={stats.lineages.toString()} color={ACCENT} />
              <StatRow label="fissions (cum.)" value={stats.totalFissions.toString()} />
              <StatRow label="dead (burnout)" value={stats.burnout.toString()} color="#e83f3f" />
              <StatRow label="dead (shock)" value={stats.shock.toString()} color="#a78bfa" />
              <StatRow label="ghost-region alive" value={stats.ghostAlive.toString()} color="#7FAFB3" />
              <StatRow label="grabby-region alive" value={stats.grabbyAlive.toString()} color="#e83f3f" />
              {stats.meanDeathAge > 0 && (
                <StatRow label="mean death age" value={`${stats.meanDeathAge.toFixed(0)} Myr`} />
              )}
            </div>

            {compareMode && (
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: "1px solid #1a2236",
              }}>
                <div style={{
                  fontSize: 9, letterSpacing: "0.1em", color: "#7FAFB3",
                  fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
                }}>
                  LIVE STATISTICS (RUN B)
                </div>
                <StatRow label="time (Myr)" value={compareStats.t.toString()} />
                <StatRow label="alive" value={compareStats.alive.toString()} />
                <StatRow label="lineages alive" value={compareStats.lineages.toString()} color={ACCENT} />
                <StatRow label="fissions (cum.)" value={compareStats.totalFissions.toString()} />
                <StatRow label="ghost-region alive" value={compareStats.ghostAlive.toString()} color="#7FAFB3" />
                <StatRow label="grabby-region alive" value={compareStats.grabbyAlive.toString()} color="#e83f3f" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 30, padding: "16px 0",
          borderTop: "1px solid #0f1520",
          fontSize: 10, color: "#3a4b6a", textAlign: "center",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.06em", lineHeight: 1.8,
        }}>
          Instantiates Sebastian &amp; Claude (2026) §5 · filter geometry as selection · Boyd et al. (2022), Wong &amp; Bartlett (2022)<br />
          v2 extensions preempt the Darwinian objection (§5.3 naive fission) and enable the architected-fission open question.
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function ParamSection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.1em", color: "#5a6b8a",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "#8a9bba", marginBottom: 3,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span>{label}</span>
        <span style={{ color: "#d4dae8" }}>{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: ACCENT, background: "transparent" }}
      />
      {hint && (
        <div style={{
          fontSize: 8, color: "#3a4b6a", marginTop: 2,
          fontFamily: "'JetBrains Mono', monospace", fontStyle: "italic",
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: 10, marginBottom: 5,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <span style={{ color: "#5a6b8a" }}>{label}</span>
      <span style={{ color: color || "#d4dae8" }}>{value}</span>
    </div>
  );
}

function InspectorField({ label, value, color }) {
  return (
    <div>
      <div style={{
        fontSize: 8, color: "#5a6b8a",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.08em", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 12, color: color || "#d4dae8",
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
      }}>
        {value}
      </div>
    </div>
  );
}