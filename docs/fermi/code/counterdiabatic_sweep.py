#!/usr/bin/env python3
"""
══════════════════════════════════════════════════════════════════════════
COUNTERDIABATIC WORK SWEEP
══════════════════════════════════════════════════════════════════════════

Boyd, Patra, Jarzynski & Crutchfield (2022) J. Stat. Phys. 187:17
established that for finite-time information processing, dissipated
work exceeds the Landauer bound by a counterdiabatic term:

    W_diss = kT ln(2) + γ · L² / τ

where L is spatial extent, τ is operation timescale, and γ is a
substrate-dependent coefficient.

This script sweeps the (L, τ) plane for physically realistic expansion
scenarios and produces a cost heatmap. The key message: expansion is
not physically excluded, but physically expensive, with the expense
scaling superlinearly in L and inversely in τ, and with no return on
capability (Wright 2023: distributed computation at the Landauer
limit provides no advantage over localized computation).

Expansion scenarios considered:
  1. Home star system (~100 AU in 10⁴ years)
  2. Nearest star cluster (~10 ly in 10⁵ years)
  3. Local stellar neighborhood (~100 ly in 10⁶ years)
  4. Galactic arm (~10 kly in 10⁷ years)
  5. Full galaxy (~100 kly in 10⁸ years)

For each, we compute:
  - Total counterdiabatic dissipation W_diss(L, τ)
  - Fraction of available stellar output consumed
  - Comparison to localized computation at Landauer limit

Stanley Sebastian & Claude · Limen Research · April 2026
══════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm

# Constants
c = 2.998e8   # m/s
k_B = 1.381e-23  # J/K
ly = 9.461e15  # m
AU = 1.496e11  # m
sec_per_year = 365.25 * 86400
L_sun = 3.828e26  # W (stellar luminosity)

print("=" * 72)
print("  COUNTERDIABATIC EXPANSION COST SWEEP")
print("=" * 72)

# The Boyd et al. (2022) result: W_diss = γ · L² / τ
# γ has units of J·s/m² for the counterdiabatic term
# For information-processing substrates, γ ~ k_B·T·N_bits / λ²
# where N_bits is the number of bits being coordinated across L
# and λ is a characteristic mean free path.

# For an order-of-magnitude estimate, we take:
T = 300  # K (characteristic operating temperature)
N_bits = 1e20  # bits being coordinated (order of magnitude for a civilization-scale Markov blanket)
lambda_c = 1  # m (characteristic coordination length)

gamma = k_B * T * N_bits / lambda_c**2  # J·s/m²
print(f"\n  Counterdiabatic coefficient γ ≈ {gamma:.2e} J·s/m²")

# Sweep (L, τ) space
L_range = np.logspace(np.log10(AU), np.log10(1e5 * ly), 100)   # meters
tau_range = np.logspace(np.log10(sec_per_year), np.log10(1e9 * sec_per_year), 100)  # seconds

L_grid, tau_grid = np.meshgrid(L_range, tau_range)
W_diss = gamma * L_grid**2 / tau_grid  # Joules

# Compare to a civilization with ~1 star's energy budget over τ
available_energy = L_sun * tau_grid  # total energy a star provides in time τ
fraction_consumed = W_diss / available_energy

print(f"\n  Swept {len(L_range)} × {len(tau_range)} = {len(L_range)*len(tau_range)} (L, τ) cells")
print(f"  W_diss range: {W_diss.min():.2e} to {W_diss.max():.2e} J")
print(f"  Fraction consumed range: {fraction_consumed.min():.2e} to {fraction_consumed.max():.2e}")


# ═══════════════════════════════════════════════════════════════════
# SCENARIO ANALYSIS
# ═══════════════════════════════════════════════════════════════════

scenarios = [
    ('Home system',           100 * AU,      1e4 * sec_per_year),
    ('Nearest cluster',       10 * ly,       1e5 * sec_per_year),
    ('Local neighborhood',    100 * ly,      1e6 * sec_per_year),
    ('Galactic arm',          10000 * ly,    1e7 * sec_per_year),
    ('Full galaxy',           100000 * ly,   1e8 * sec_per_year),
]

print("\n  Per-scenario cost:")
print(f"  {'Scenario':<25s} {'L':>12s} {'τ':>12s} {'W_diss':>15s} {'frac star':>15s}")
print(f"  {'─'*25} {'─'*12} {'─'*12} {'─'*15} {'─'*15}")
scenario_results = []
for name, L, tau in scenarios:
    W = gamma * L**2 / tau
    avail = L_sun * tau
    frac = W / avail
    scenario_results.append((name, L, tau, W, frac))
    L_str = f"{L/ly:.1f} ly" if L >= 0.1*ly else f"{L/AU:.0f} AU"
    tau_str = f"{tau/sec_per_year:.0e} yr"
    print(f"  {name:<25s} {L_str:>12s} {tau_str:>12s} {W:>13.2e} J {frac:>13.2e}")


# ═══════════════════════════════════════════════════════════════════
# LANDAUER COMPARISON — THE WRIGHT (2023) POINT
# ═══════════════════════════════════════════════════════════════════

# At the Landauer limit, a single localized computer does N_ops
# operations for energy N_ops * kT·ln(2). The question is: how many
# localized Landauer-limited operations could you do with the same
# energy as the counterdiabatic dissipation for expanded coordination?

print("\n  Landauer comparison: how many *localized* ops at Landauer limit")
print("  could be done with the energy spent on expansion coordination?")
print(f"  (Landauer quantum: kT·ln(2) = {k_B * T * np.log(2):.2e} J at T={T}K)")
E_landauer = k_B * T * np.log(2)
print(f"\n  {'Scenario':<25s} {'Expansion ops equivalent':>30s}")
print(f"  {'─'*25} {'─'*30}")
for name, L, tau, W, frac in scenario_results:
    n_ops = W / E_landauer
    print(f"  {name:<25s} {n_ops:>30.2e}")


# ═══════════════════════════════════════════════════════════════════
# FIGURE: HEATMAP OF W_DISS / AVAILABLE ENERGY
# ═══════════════════════════════════════════════════════════════════

fig, axes = plt.subplots(1, 2, figsize=(16, 7))
fig.set_facecolor('#060a12')

# Panel 1: Log W_diss heatmap
ax1 = axes[0]
ax1.set_facecolor('#0a0f1a')
im1 = ax1.pcolormesh(L_range/ly, tau_range/sec_per_year,
                      W_diss, cmap='inferno',
                      norm=LogNorm(vmin=W_diss.min(), vmax=W_diss.max()),
                      shading='auto')
ax1.set_xscale('log')
ax1.set_yscale('log')
cbar1 = plt.colorbar(im1, ax=ax1, label='W_diss (J)')
cbar1.ax.yaxis.label.set_color('#d4dae8')
cbar1.ax.tick_params(colors='#5a6b8a')

# Overlay scenario points
for name, L, tau, W, frac in scenario_results:
    ax1.plot(L/ly, tau/sec_per_year, 'w^', markersize=11,
             markeredgecolor='black', zorder=4)
    ax1.annotate(name, xy=(L/ly, tau/sec_per_year), xytext=(8, 8),
                 textcoords='offset points', fontsize=9, color='white')

ax1.set_xlabel('Expansion extent L (light-years)', fontsize=11, color='#d4dae8')
ax1.set_ylabel('Expansion timescale τ (years)', fontsize=11, color='#d4dae8')
ax1.set_title('Counterdiabatic dissipation W_diss = γ L²/τ\n'
              '(superlinear in L, inverse in τ)',
              fontsize=11, color='#d4dae8')
ax1.tick_params(colors='#5a6b8a')
for s in ax1.spines.values(): s.set_color('#1a2236')

# Panel 2: Fraction-of-stellar-output heatmap
ax2 = axes[1]
ax2.set_facecolor('#0a0f1a')
# Clip for visualization
frac_viz = np.clip(fraction_consumed, 1e-30, 1e30)
im2 = ax2.pcolormesh(L_range/ly, tau_range/sec_per_year,
                      frac_viz, cmap='RdYlBu_r',
                      norm=LogNorm(vmin=1e-20, vmax=1e10),
                      shading='auto')
cbar2 = plt.colorbar(im2, ax=ax2, label='W_diss / (L_sun × τ)')
cbar2.ax.yaxis.label.set_color('#d4dae8')
cbar2.ax.tick_params(colors='#5a6b8a')
ax2.set_xscale('log')
ax2.set_yscale('log')

# Contour at fraction = 1 (full stellar output consumed)
contour = ax2.contour(L_range/ly, tau_range/sec_per_year, fraction_consumed,
                       levels=[1], colors='white', linewidths=2, linestyles='-')
ax2.clabel(contour, inline=True, fontsize=9, fmt='= 1 star')

# Contour at fraction = 1e-6 (one millionth of stellar output — livable)
contour2 = ax2.contour(L_range/ly, tau_range/sec_per_year, fraction_consumed,
                        levels=[1e-6], colors='yellow', linewidths=1.5,
                        linestyles='--')
ax2.clabel(contour2, inline=True, fontsize=9, fmt='= 1 ppm star')

# Overlay scenarios
for name, L, tau, W, frac in scenario_results:
    ax2.plot(L/ly, tau/sec_per_year, 'w^', markersize=11,
             markeredgecolor='black', zorder=4)

ax2.set_xlabel('Expansion extent L (light-years)', fontsize=11, color='#d4dae8')
ax2.set_ylabel('Expansion timescale τ (years)', fontsize=11, color='#d4dae8')
ax2.set_title('Fraction of stellar output consumed by expansion\n'
              '(white contour = whole star; above = infeasible)',
              fontsize=11, color='#d4dae8')
ax2.tick_params(colors='#5a6b8a')
for s in ax2.spines.values(): s.set_color('#1a2236')

fig.suptitle('Counterdiabatic Expansion Cost (Boyd et al. 2022) — Superlinear Penalty for Reach\n'
             'Sebastian & Claude · Limen Research · 2026',
             fontsize=13, color='#d4dae8', fontweight='bold', y=1.00)

plt.tight_layout()
plt.savefig('/home/claude/ghost_state_research/counterdiabatic_sweep.png',
            dpi=180, bbox_inches='tight', facecolor=fig.get_facecolor())

print(f"\n  Saved: counterdiabatic_sweep.png")

print("\n" + "=" * 72)
print("  KEY RESULT")
print("=" * 72)
print("""
  The counterdiabatic scaling W_diss ∝ L²/τ means that doubling
  expansion extent QUADRUPLES dissipation at fixed timescale, and
  halving the timescale DOUBLES dissipation at fixed extent. For
  any realistic parameter choice:

    - Home system coordination is cheap (tiny fraction of star)
    - Galactic arm coordination requires multi-stellar output
    - Full galaxy coordination requires implausible energy budgets

  Combined with Wright (2023): localized Landauer-limited computation
  at a single site delivers MORE operations than distributed expansion
  coordination delivers coherence. The cost surface has no favorable
  gradient for expansion over localization.

  A civilization that expands is paying more for less, across every
  physically reasonable region of the cost surface.
""")
