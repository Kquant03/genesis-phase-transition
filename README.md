# ◈ Genesis — Artificial Life Laboratory

<div align="center">

**Five substrates. One garden. Infinite structures.**

<br />

<img src="docs/gifs/gray_scott_hero.gif" alt="Gray-Scott reaction-diffusion coral pattern evolving in real time" width="600" />

<br />
<sub><i>Gray-Scott reaction-diffusion (coral pattern, F=0.0545, k=0.062). One of five live substrates.</i></sub>

<br /><br />

A browser-based, real-time artificial life laboratory spanning statistical mechanics, continuous cellular automata, reaction-diffusion morphogenesis, particle ecology, and self-organizing particle systems.

[![License: MIT](https://img.shields.io/badge/License-MIT-4ecdc4.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)

[**→ Launch Live Demo**](https://kquant03.github.io/genesis-phase-transition/)

</div>

---

## What is this?

Genesis is a multi-dimensional artificial life laboratory implementing five distinct simulation substrates in a single browser application. Each reveals a different mechanism by which complex, lifelike behavior emerges from simple mathematical rules. Every simulation runs entirely client-side — no backend, no WebGL, no WebGPU. Pure canvas rendering for maximum compatibility.

## Quick Start

```bash
git clone https://github.com/Kquant03/genesis-phase-transitions.git
cd genesis-phase-transitions
npm install
npm run dev
```

Opens at `http://localhost:3000`.

---

## The Five Substrates

### ◈ Ising Model — Phase Transitions

<img src="docs/gifs/ising.gif" alt="2D Ising model at critical temperature showing domain fluctuations" width="256" align="right" />

The 2D Ising model on a square lattice — the cornerstone of statistical mechanics. The exact critical temperature T_c = 2/ln(1+√2) ≈ 2.269 separates ordered ferromagnetic domains from paramagnetic disorder via a continuous second-order phase transition.

**Features:**
- Dual Monte Carlo: Metropolis-Hastings (single-spin) + Wolff cluster (FK percolation)
- Hoshen-Kopelman cluster decomposition with golden-ratio coloring
- Four visualization modes: spin, cluster, domain walls, energy density
- Six live observables: M, |M|, E, χ, C_v, U_L (Binder cumulant)
- Social interpretation layer after Tsarev et al. (2019)
- Auto temperature sweep with susceptibility divergence at T_c

**Critical exponents (exact):** β = 1/8 · γ = 7/4 · ν = 1 · α = 0 (log) · η = 1/4 · δ = 15

<br clear="right" />

---

### ◉ Lenia — Continuous Cellular Automata

<img src="docs/gifs/ghost_interaction.gif" alt="Lenia Ghost species — Orbium unicaudatus ignis var. phantasma — morphing and communicating through shared potential fields" width="256" align="right" />

After Bert Chan (2018). A continuous cellular automaton where space, time, and state are all smooth. WebGL2 GPU-accelerated with shader-based bloom, running at 60fps on a 256×256 toroidal grid. Eight species including *Orbium unicaudatus ignis* var. *phantasma* — the **Ghost**, a novel species engineered to inhabit the edge of chaos.

**The math:**
```
K(r) = exp(4 − 4 / (4r(1−r)))            Exponential bump kernel
U(x) = Σ K(‖x − y‖/R) · A(y)             Convolution potential field
G(u) = 2·exp(−(u − μ)² / 2σ²) − 1        Growth function
A^(t+dt) = clip(A^t + dt·G(U), 0, 1)      State update
```

**Eight species:** Orbium (glider soliton) · Bicaudatus (two-tailed) · Ignis (fire form) · Ignis ×2 (fire two-tailed) · Laxus (loose oscillator) · Vagus (large-field wanderer) · Soup (ecosystem) · **Ghost** (sustained edge-of-chaos morphing)

**The Ghost species** seeds the Ignis morphology (tuned for σ=0.012) under deliberately mismatched parameters (σ=0.015, R=15). The organism remembers its shape but cannot reach it — producing perpetual morphing, field-mediated inter-organism communication, and emergent network ripples across populations of 16 individuals.

<br clear="right" />

---

### ◎ Gray-Scott Reaction-Diffusion — Morphogenesis

<img src="docs/gifs/mitosis.gif" alt="Gray-Scott mitosis pattern showing self-replicating spots" width="256" align="right" />

The Gray-Scott model (Pearson, 1993) — two coupled PDEs that produce an extraordinary zoo of pattern types from spots that divide like cells to labyrinthine coral.

**The equations:**
```
∂u/∂t = D_u∇²u − uv² + F(1 − u)
∂v/∂t = D_v∇²v + uv² − (F + k)v
```

**Eight Pearson classification presets:** Mitosis (self-replicating spots) · Coral (labyrinthine) · Spirals · Worms · Solitons · U-Skate (gliders) · Waves · Bubbles

**Features:** Click-to-seed interaction, three color modes (chemical, heat, mono), real-time F/k parameter control spanning the full pattern space.

<br clear="right" />

---

### ◆ Particle Life — Emergent Ecology

<img src="docs/gifs/particle_life.gif" alt="Particle Life showing emergent predator-prey dynamics from asymmetric forces" width="256" align="right" />

Asymmetric N×N force matrices between particle types. When A→B ≠ B→A, Newton's third law breaks and net energy enters the system — the minimal mechanism for predation, symbiosis, orbital capture, and membrane formation.

**Force function:**
```
Repulsion zone (r < β):    F(r) = r/β − 1
Interaction zone (r ≥ β):  F(r) = a · (1 − |1+β−2r| / (1−β))
```

Where `a = M[type_i][type_j]` from the asymmetric interaction matrix.

**Four matrix presets:** Random · Predator-Prey (cyclic chase) · Symbiosis (mutual attraction) · Chaos

**Features:** Live interaction matrix display, adjustable range/friction/repulsion, trail rendering.

<br clear="right" />

---

### ◇ Primordial Particle Systems — Life from Turning

<img src="docs/gifs/primordial.gif" alt="Primordial Particle Systems showing emergent cell-like structures" width="256" align="right" />

After Schmickl et al. (2016, *Scientific Reports*). The simplest known model producing a complete cell lifecycle. Each particle follows **one equation with two parameters:**

```
Δφᵢ = α + β · Nᵢ · sign(Rᵢ − Lᵢ)
```

From this alone: cells form, grow, divide, produce spores, migrate, self-repair, and exhibit logistic population dynamics. The "Region of Life" exists at α ≈ 180°, β ≈ 17°.

**Five presets:** Cell Life · Worms · Swirls · Crystals · Gas

**Features:** Density-based coloring (neighbor count), heading-based coloring, real-time α/β control.

<br clear="right" />

---

## Connection to Broader Research

This repository is part of the **Teármann Research Ecosystem:**

- **Shoal-Broadcast Architecture** — The Ghost species IS the shoal-broadcast pattern made visible: organisms communicating not through discrete messages but through perturbations in a shared continuous scalar field. Each Ghost's morphological instability becomes a signal source for its neighbors.
- **Tsarev–Dicke Mapping** — The Ising substrate connects to Tsarev et al.'s quantum-optics model of social opinion dynamics, where the superradiant phase transition = spontaneous consensus formation
- **CLAIRE/Teármann Thesis** — Mechanistically transparent simulation data formally collapses underspecification in ML training. Every causal pathway in Genesis is observable.

## Project Structure

```
genesis-phase-transitions/
├── index.html                              # Entry point
├── vite.config.js                          # Vite + GitHub Pages config
├── src/
│   ├── main.jsx                            # React root
│   ├── App.jsx                             # Navigation + live hero simulation
│   └── simulations/
│       ├── SocialPhaseTransitionLab.jsx     # ◈ Ising model (~970 lines)
│       ├── Lenia.jsx                       # ◉ Lenia (grid-based, WebGL2 GPU)
│       ├── GrayScottRD.jsx                 # ◎ Gray-Scott RD
│       ├── ParticleLife.jsx                # ◆ Particle Life
│       └── PrimordialParticles.jsx         # ◇ Primordial Particles
├── docs/
│   ├── GENESIS_MANIFESTO.docx              # Full technical manifesto
│   ├── tsarev_2019.pdf                     # Source paper
│   └── gifs/                               # README animations
└── .github/workflows/deploy.yml            # Auto GitHub Pages deploy
```

## References

- **Ising Model:** Onsager (1944); Wolff (1989); Tsarev, Trofimova, Alodjants & Khrennikov, "Phase transitions, collective emotions and decision-making problem in heterogeneous social systems," *Sci. Rep.* **9**, 18039 (2019)
- **Lenia:** Chan, "Lenia — Biology of Artificial Life" arXiv:1812.05433 (2018); Chan, "Lenia and Expanded Universe" ALIFE 2020; Sebastian & Claude, "*O. u. ignis* var. *phantasma*: A Lenia Species Engineered to Inhabit the Edge of Chaos" (2026, internal)
- **Flow-Lenia:** Plantec et al., "Flow-Lenia: Mass conservation and parameter localization" (2023, ALIFE Best Paper)
- **Gray-Scott:** Pearson, "Complex patterns in a simple system," *Science* **261** (1993); Munafo, mrob.com/pub/comp/xmorphia
- **Particle Life:** Ahmad/Mohr (2022); Ventrella, "Clusters and Chains" (2005)
- **Primordial Particles:** Schmickl et al., "How a life-like system emerges from a simplistic particle motion law," *Sci. Rep.* **6** (2016)
- **Neural CA:** Mordvintsev et al., "Growing Neural Cellular Automata," *Distill* (2020)
- **ASAL:** Sakana AI, "Automating the Search for Artificial Life with Foundation Models" (2025)
- **ALIEN:** Heinemann, alien-project.org (2024 ALIFE Virtual Creatures Competition winner)

## Build & Deploy

```bash
npm run dev       # Development server with hot reload
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

GitHub Pages deploys automatically via the included Actions workflow on every push to `main`.

## License

[MIT](LICENSE)

---

<div align="center">

*The garden that builds itself is not a metaphor. It is a technical specification.*

<br />

Built by [Stanley (Kquant03)](https://github.com/Kquant03) · [Replete AI](https://repleteai.com)

Part of the Teármann Research Ecosystem

</div>
