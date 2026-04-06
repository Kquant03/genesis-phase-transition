# ◈ Genesis — Artificial Life Laboratory

<div align="center">

**Five substrates. One garden. Infinite structures.**

A browser-based, real-time artificial life laboratory spanning statistical mechanics, continuous cellular automata, reaction-diffusion morphogenesis, particle ecology, and self-organizing particle systems.

[![License: MIT](https://img.shields.io/badge/License-MIT-4ecdc4.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)

</div>

---

## What is this?

Genesis is a multi-dimensional artificial life laboratory that implements five distinct simulation substrates in a single browser application. Each substrate reveals a different mechanism by which complex, lifelike behavior emerges from simple mathematical rules:

| Substrate | Mechanism | Key Insight |
|-----------|-----------|-------------|
| **Ising Model** | Spin-lattice phase transitions | Order emerges from disorder at a critical temperature |
| **Particle Lenia** | Gradient-based particle dynamics | Lifelike organisms from Gaussian shell kernels |
| **Gray-Scott RD** | Reaction-diffusion PDEs | Pattern formation from chemical instability |
| **Particle Life** | Asymmetric force matrices | Predation and symbiosis from broken symmetry |
| **Primordial Particles** | One turning equation | Complete cell lifecycle from two parameters |

Every simulation runs entirely in the browser with zero backend dependencies. No WebGL, no WebGPU — pure canvas rendering for maximum compatibility. All simulations are interactive with real-time parameter control.

## Quick Start

```bash
git clone https://github.com/Kquant03/genesis-alife.git
cd genesis-alife
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## The Five Substrates

### ◈ Ising Model — Phase Transitions

The 2D Ising model on a square lattice, the cornerstone of statistical mechanics. Features dual Monte Carlo algorithms (Metropolis-Hastings and Wolff cluster), Hoshen-Kopelman cluster decomposition, four visualization modes, six thermodynamic observables, and a social interpretation layer based on Tsarev et al. (2019).

**Critical temperature:** T_c = 2/ln(1+√2) ≈ 2.269 J/k_B

**Exact critical exponents:** β = 1/8, γ = 7/4, ν = 1, α = 0 (log), η = 1/4, δ = 15

### ◉ Particle Lenia — Mathematical Life Forms

After Mordvintsev, Niklasson & Randazzo (Google Research, 2022). Discrete particles interact through a Gaussian shell kernel K(r) = w·exp(−(r−μ)²/2σ²), move via gradient ascent on a growth field, and self-organize into gliders, rotors, and multi-species ecologies. Includes four species presets.

### ◎ Gray-Scott Reaction-Diffusion — Morphogenesis

The Gray-Scott model (Pearson, 1993) with eight parameter presets spanning the full Pearson classification: mitosis (self-replicating spots), coral growth, spirals, worms, solitons, U-skate gliders, expanding waves, and negative bubbles. Click to seed new patterns. Three color modes.

**Equations:** ∂u/∂t = D_u∇²u − uv² + F(1−u), ∂v/∂t = D_v∇²v + uv² − (F+k)v

### ◆ Particle Life — Emergent Ecology

Asymmetric N×N force matrices between particle types. When A→B attraction ≠ B→A attraction, Newton's third law breaks and net energy enters the system — creating predator-prey dynamics, orbital capture, cell membranes, and symbiotic clusters. Four matrix presets: Random, Predator-Prey, Symbiosis, and Chaos.

### ◇ Primordial Particle Systems — Life from Turning

After Schmickl et al. (2016, Scientific Reports). The simplest known model producing a complete cell lifecycle. Each particle follows one equation:

**Δφᵢ = α + β · Nᵢ · sign(Rᵢ − Lᵢ)**

From this alone: cells form, grow, divide, produce spores, migrate, self-repair, and exhibit logistic population dynamics. The "Region of Life" exists at α ≈ 180°, β ≈ 17°.

## Connection to Broader Research

This repository is part of the **Teármann Research Ecosystem**, which includes:

- **Social Phase Transition Lab** — The Ising substrate connects to Tsarev et al.'s Dicke model mapping of quantum optics to social opinion dynamics
- **Shoal-Broadcast Architecture** — The Particle Lenia formulation IS the shoal-broadcast pattern: agents swimming through continuous scalar fields rather than passing discrete messages
- **Cúramóir** — Colony simulation agents could be seeded with parameters discovered by Genesis's evolution
- **CLAIRE/Teármann Thesis** — Mechanistically transparent simulation data formally collapses underspecification in ML training

## References

- **Ising Model:** Onsager (1944); Wolff (1989); Tsarev et al. "Phase transitions, collective emotions and decision-making" *Sci. Rep.* **9**, 18039 (2019)
- **Lenia:** Chan, "Lenia — Biology of Artificial Life" (2018); Mordvintsev et al., "Particle Lenia and the energy-based formulation" (2022)
- **Flow-Lenia:** Plantec et al., "Flow-Lenia: Mass conservation and parameter localization" (2023, ALIFE Best Paper)
- **Gray-Scott:** Pearson, "Complex patterns in a simple system" *Science* **261** (1993)
- **Particle Life:** Ahmad/Mohr (2022)
- **Primordial Particles:** Schmickl et al., "How a life-like system emerges from a simplistic particle motion law" *Sci. Rep.* **6** (2016)
- **Neural CA:** Mordvintsev et al., "Growing Neural Cellular Automata" *Distill* (2020)
- **ASAL:** Sakana AI, "Automating the Search for Artificial Life with Foundation Models" (2025)

## Build & Deploy

```bash
npm run dev       # Development server with hot reload
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

For GitHub Pages deployment:

```bash
npm run build
# Deploy dist/ folder to gh-pages branch
```

## License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Kquant03">Stanley (Kquant03)</a> · Replete AI</sub><br />
  <sub>The garden that builds itself is not a metaphor. It is a technical specification.</sub>
</div>
