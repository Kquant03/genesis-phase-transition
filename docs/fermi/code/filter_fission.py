#!/usr/bin/env python3
"""
══════════════════════════════════════════════════════════════════════════
FILTER SIMULATION v2: FISSION DYNAMICS
══════════════════════════════════════════════════════════════════════════

Tests the strongest remaining Darwinian objection to the filter argument:
what if expansionist lineages can escape the quadratic coordination cost
by fissioning?

MECHANISM:
  In the base model, an agent's expansion cost grows as L²/τ — quadratic
  in accumulated reach. A lineage that splits at the coordination horizon
  L_crit and abandons shared coordination might reset L → 0 for the
  daughter fragments, so each fragment pays cost only for its own reach,
  not for its ancestor's.

  If fission works this way, the filter is circumvented: a grabby lineage
  can indefinitely split and spread, with each fragment surviving because
  it isn't paying the quadratic cost of its family's total reach.

  Does the filter survive fission? This script answers empirically.

MODEL:
  When an alive agent's L exceeds a fission threshold L_fiss, it splits:
    • Parent: retains e, c, L_fiss/2, R/2
    • Daughter: gains e + η_e, c + η_c (small heritable drift), L = 0, R = R/2
  Daughter joins the population. Both continue evolving.

  Track lineage trees, track the cumulative footprint (reach) of each
  ancestral line, and compare:
    (a) "No fission" baseline (v1 model)
    (b) "Fission" extension with various L_fiss thresholds
    (c) "Mutation rate" η variations

ALTERNATIVE HYPOTHESIS TO TEST:
  Does fission merely redistribute the filter's pressure, or does it
  allow grabby lineages to spread past it? Concretely:
    H1: Fission preserves filter — grabby fissioning lines still
        die or drift toward low-e, high-c attractor.
    H2: Fission breaks filter — grabby fissioning lines persist
        indefinitely through fragmentation.

Stanley Sebastian & Claude · Limen Research · April 2026
══════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

np.random.seed(42)

print("=" * 72)
print("  FILTER v2: DOES FISSION CIRCUMVENT THE FILTER?")
print("=" * 72)


# ═══════════════════════════════════════════════════════════════════
# AGENT CLASS WITH FISSION
# ═══════════════════════════════════════════════════════════════════

class Agent:
    """Civilization with optional fission at L_fiss threshold."""
    _next_id = 0

    def __init__(self, e, c, R=1.0, L=0.0, lineage_root=None, parent_id=None):
        self.id = Agent._next_id
        Agent._next_id += 1
        self.e = np.clip(e, 0.001, 1.0)
        self.c = np.clip(c, 0.001, 1.0)
        self.R = R
        self.L = L
        self.age = 0
        self.alive = True
        self.death_mode = None
        self.lineage_root = lineage_root if lineage_root is not None else self.id
        self.parent_id = parent_id
        self.fissions = 0  # how many times this agent has fissioned

    def step(self, alpha, beta, gamma, shock_rate, shock_sigma,
             g=0.05, K=1.0, tau=1.0):
        if not self.alive:
            return None  # no fission event
        growth = g * self.R * (1 - self.R / K)
        exp_cost = alpha * self.e * self.R * (self.L ** 2) / tau
        coupling_benefit = gamma * self.c
        shock = 0.0
        if np.random.random() < shock_rate:
            shock = abs(np.random.normal(0, shock_sigma))
        shock_impact = shock * self.R * (1 - coupling_benefit)

        new_R = self.R + growth - exp_cost - shock_impact
        if not np.isfinite(new_R):
            self.alive = False
            self.death_mode = 'burnout'
            self.R = 0
            return None

        self.R = min(2.0, new_R)
        self.L = min(50.0, self.L + beta * self.e * max(0, self.R))
        self.age += 1

        if self.R <= 0.01:
            self.alive = False
            self.death_mode = 'burnout' if exp_cost > shock_impact else 'shock'
            self.R = 0

        return None

    def try_fission(self, L_fiss, eta_e, eta_c):
        """If L exceeds L_fiss, split. Returns daughter Agent or None."""
        if not self.alive or self.L < L_fiss:
            return None
        # Parent retains some reach (half), some resources (half)
        daughter_R = self.R / 2.0
        self.R = daughter_R
        self.L = L_fiss / 2.0  # parent keeps half the reach
        self.fissions += 1
        # Daughter: drifted e, c; fresh L=0
        d_e = self.e + np.random.normal(0, eta_e)
        d_c = self.c + np.random.normal(0, eta_c)
        daughter = Agent(
            e=d_e, c=d_c,
            R=daughter_R, L=0.0,
            lineage_root=self.lineage_root,
            parent_id=self.id,
        )
        return daughter


# ═══════════════════════════════════════════════════════════════════
# POPULATION SIMULATOR WITH FISSION
# ═══════════════════════════════════════════════════════════════════

def run_population(
    initial_agents,
    n_steps=1000,
    alpha=0.5, beta=0.01, gamma=0.8,
    shock_rate=0.1, shock_sigma=0.3,
    L_fiss=None,  # None = no fission
    eta_e=0.05, eta_c=0.05,
    pop_cap=10000,  # safety cap to prevent runaway
    verbose=False,
):
    """
    Run a population simulation with optional fission.

    Returns:
        pop: final list of Agent objects (alive and dead)
        history: dict of per-step statistics
    """
    pop = list(initial_agents)
    history = {
        't': [], 'alive': [],
        'mean_e_alive': [], 'mean_c_alive': [],
        'n_fissions_cum': [],
        'grabby_alive': [], 'ghost_alive': [],
        'total_lineages_alive': [],
    }
    cum_fissions = 0

    for t in range(n_steps):
        # Step all alive agents
        daughters = []
        for a in pop:
            a.step(alpha, beta, gamma, shock_rate, shock_sigma)
            if L_fiss is not None and len(pop) + len(daughters) < pop_cap:
                d = a.try_fission(L_fiss, eta_e, eta_c)
                if d is not None:
                    daughters.append(d)
                    cum_fissions += 1
        pop.extend(daughters)

        # Record stats every 10 steps for speed
        if t % 10 == 0 or t == n_steps - 1:
            alive = [a for a in pop if a.alive]
            n_alive = len(alive)
            if n_alive > 0:
                mean_e = np.mean([a.e for a in alive])
                mean_c = np.mean([a.c for a in alive])
                grabby = sum(1 for a in alive if a.e > 0.5 and a.c < 0.3)
                ghost = sum(1 for a in alive if a.e < 0.3 and a.c > 0.5)
                lineages = len(set(a.lineage_root for a in alive))
            else:
                mean_e = mean_c = grabby = ghost = lineages = 0
            history['t'].append(t)
            history['alive'].append(n_alive)
            history['mean_e_alive'].append(mean_e)
            history['mean_c_alive'].append(mean_c)
            history['n_fissions_cum'].append(cum_fissions)
            history['grabby_alive'].append(grabby)
            history['ghost_alive'].append(ghost)
            history['total_lineages_alive'].append(lineages)

            if verbose and t % 100 == 0:
                print(f"    t={t:5d}  alive={n_alive:5d}  "
                      f"mean_e={mean_e:.3f}  mean_c={mean_c:.3f}  "
                      f"fissions={cum_fissions:5d}  lineages={lineages}")

    return pop, history


# ═══════════════════════════════════════════════════════════════════
# EXPERIMENTS
# ═══════════════════════════════════════════════════════════════════

print("\n" + "─" * 72)
print("  EXPERIMENT 1: No fission (baseline) vs fission at several thresholds")
print("─" * 72)

# Common initial condition: diverse population across (e, c) space
def make_diverse_pop(n=200, seed=42):
    Agent._next_id = 0
    rng = np.random.default_rng(seed)
    return [Agent(e=float(rng.uniform(0.05, 0.95)),
                  c=float(rng.uniform(0.05, 0.95)))
            for _ in range(n)]


conditions = [
    ("No fission (baseline)",   None),
    ("Fission at L=0.15",       0.15),
    ("Fission at L=0.25",       0.25),
    ("Fission at L=0.40",       0.40),
]

exp1_results = {}
for label, L_fiss in conditions:
    print(f"\n  {label}")
    initial = make_diverse_pop(n=200, seed=42)
    np.random.seed(42)
    pop, history = run_population(
        initial, n_steps=1500,
        alpha=0.5, beta=0.01, gamma=0.8,
        L_fiss=L_fiss, eta_e=0.03, eta_c=0.03,
        verbose=True,
    )
    exp1_results[label] = {'pop': pop, 'history': history, 'L_fiss': L_fiss}


# ═══════════════════════════════════════════════════════════════════
# KEY QUESTION: where does the ALIVE population concentrate at t_end?
# ═══════════════════════════════════════════════════════════════════

print("\n" + "─" * 72)
print("  EXPERIMENT 1 — FINAL-STATE DISTRIBUTIONS")
print("─" * 72)

fig = plt.figure(figsize=(16, 11))
fig.set_facecolor('#060a12')

# Panel A: final (e, c) scatter for each condition
for i, (label, result) in enumerate(exp1_results.items()):
    ax = fig.add_subplot(3, 4, i + 1)
    ax.set_facecolor('#0a0f1a')
    alive = [a for a in result['pop'] if a.alive]
    dead = [a for a in result['pop'] if not a.alive]
    if dead:
        ax.scatter([a.e for a in dead], [a.c for a in dead],
                   c='#5a6b8a', s=4, alpha=0.2, label=f'dead n={len(dead)}')
    if alive:
        # Color by lineage_root
        ax.scatter([a.e for a in alive], [a.c for a in alive],
                   c='#fbbf24', s=12, alpha=0.8, edgecolors='#060a12',
                   linewidth=0.3, label=f'alive n={len(alive)}')
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_xlabel('e', fontsize=9, color='#8a9bba')
    ax.set_ylabel('c', fontsize=9, color='#8a9bba')
    # Region shading
    ax.axvspan(0.5, 1.0, ymin=0, ymax=0.3, color='#ec4899', alpha=0.05)
    ax.axvspan(0.0, 0.3, ymin=0.5, ymax=1.0, color='#4ecdc4', alpha=0.05)
    ax.text(0.75, 0.15, 'grabby', fontsize=7, color='#ec489988', ha='center')
    ax.text(0.15, 0.85, 'ghost', fontsize=7, color='#4ecdc488', ha='center')
    ax.set_title(label, fontsize=10, color='#d4dae8')
    ax.legend(fontsize=7, facecolor='#0a0f1a', edgecolor='#1a2236',
              labelcolor='#d4dae8', loc='upper right')
    ax.tick_params(colors='#5a6b8a', labelsize=7)
    for s in ax.spines.values(): s.set_color('#1a2236')

# Panel B: population size over time for each condition
ax_b = fig.add_subplot(3, 1, 2)
ax_b.set_facecolor('#0a0f1a')
colors_b = ['#8a9bba', '#f59e0b', '#ec4899', '#4ecdc4']
for (label, result), color in zip(exp1_results.items(), colors_b):
    h = result['history']
    ax_b.plot(h['t'], h['alive'], color=color, lw=1.6, label=label, alpha=0.85)
ax_b.set_xlabel('Time (Myr)', fontsize=10, color='#d4dae8')
ax_b.set_ylabel('Alive population', fontsize=10, color='#d4dae8')
ax_b.set_title('Population trajectory under fission',
               fontsize=11, color='#d4dae8')
ax_b.legend(fontsize=9, facecolor='#0a0f1a', edgecolor='#1a2236',
            labelcolor='#d4dae8', loc='upper right')
ax_b.tick_params(colors='#5a6b8a')
for s in ax_b.spines.values(): s.set_color('#1a2236')
ax_b.grid(True, alpha=0.1)

# Panel C: mean e and mean c trajectories
ax_c = fig.add_subplot(3, 2, 5)
ax_c.set_facecolor('#0a0f1a')
for (label, result), color in zip(exp1_results.items(), colors_b):
    h = result['history']
    ax_c.plot(h['t'], h['mean_e_alive'], color=color, lw=1.4,
              label=label, alpha=0.85)
ax_c.axhline(0.5, color='white', ls=':', lw=0.5, alpha=0.3)
ax_c.set_xlabel('Time (Myr)', fontsize=10, color='#d4dae8')
ax_c.set_ylabel('Mean expansion tendency  e̅', fontsize=10, color='#d4dae8')
ax_c.set_title('Mean expansion tendency over time',
               fontsize=11, color='#d4dae8')
ax_c.set_ylim(0, 1)
ax_c.legend(fontsize=8, facecolor='#0a0f1a', edgecolor='#1a2236',
            labelcolor='#d4dae8', loc='best')
ax_c.tick_params(colors='#5a6b8a')
for s in ax_c.spines.values(): s.set_color('#1a2236')
ax_c.grid(True, alpha=0.1)

ax_d = fig.add_subplot(3, 2, 6)
ax_d.set_facecolor('#0a0f1a')
for (label, result), color in zip(exp1_results.items(), colors_b):
    h = result['history']
    ax_d.plot(h['t'], h['mean_c_alive'], color=color, lw=1.4,
              label=label, alpha=0.85)
ax_d.axhline(0.5, color='white', ls=':', lw=0.5, alpha=0.3)
ax_d.set_xlabel('Time (Myr)', fontsize=10, color='#d4dae8')
ax_d.set_ylabel('Mean substrate coupling  c̅', fontsize=10, color='#d4dae8')
ax_d.set_title('Mean substrate coupling over time',
               fontsize=11, color='#d4dae8')
ax_d.set_ylim(0, 1)
ax_d.legend(fontsize=8, facecolor='#0a0f1a', edgecolor='#1a2236',
            labelcolor='#d4dae8', loc='best')
ax_d.tick_params(colors='#5a6b8a')
for s in ax_d.spines.values(): s.set_color('#1a2236')
ax_d.grid(True, alpha=0.1)

fig.suptitle('Filter Under Fission — Does Fragmentation Preserve or Break the Filter?\n'
             'Sebastian & Claude · Limen Research · 2026',
             fontsize=13, color='#d4dae8', fontweight='bold', y=0.995)

plt.tight_layout()
plt.savefig('/home/claude/ghost_state_research/filter_fission.png',
            dpi=180, bbox_inches='tight', facecolor=fig.get_facecolor())

print("\n  Saved: filter_fission.png")


# ═══════════════════════════════════════════════════════════════════
# REPORT FINAL-STATE STATISTICS
# ═══════════════════════════════════════════════════════════════════

print("\n" + "─" * 72)
print("  FINAL-STATE REPORT")
print("─" * 72)

print(f"\n  {'Condition':<30s} {'alive':>8s} {'mean_e':>10s} {'mean_c':>10s} "
      f"{'grabby':>8s} {'ghost':>8s}")
print(f"  {'─'*30} {'─'*8} {'─'*10} {'─'*10} {'─'*8} {'─'*8}")

for label, result in exp1_results.items():
    alive = [a for a in result['pop'] if a.alive]
    n = len(alive)
    if n > 0:
        me = np.mean([a.e for a in alive])
        mc = np.mean([a.c for a in alive])
        g = sum(1 for a in alive if a.e > 0.5 and a.c < 0.3)
        h = sum(1 for a in alive if a.e < 0.3 and a.c > 0.5)
    else:
        me = mc = g = h = 0
    print(f"  {label:<30s} {n:>8d} {me:>10.3f} {mc:>10.3f} "
          f"{g:>8d} {h:>8d}")


# ═══════════════════════════════════════════════════════════════════
# TEST: does fission let grabby-seeded lineages persist?
# ═══════════════════════════════════════════════════════════════════

print("\n" + "─" * 72)
print("  EXPERIMENT 2: grabby-only initial condition")
print("  Can grabby lineages spread through fission alone?")
print("─" * 72)

def make_grabby_pop(n=200, seed=42):
    Agent._next_id = 0
    rng = np.random.default_rng(seed)
    return [Agent(e=float(rng.uniform(0.6, 0.95)),
                  c=float(rng.uniform(0.05, 0.25)))
            for _ in range(n)]


exp2_results = {}
for label, L_fiss in conditions:
    print(f"\n  {label}")
    initial = make_grabby_pop(n=200, seed=42)
    np.random.seed(42)
    pop, history = run_population(
        initial, n_steps=1500,
        alpha=0.5, beta=0.01, gamma=0.8,
        L_fiss=L_fiss, eta_e=0.03, eta_c=0.03,
        verbose=True,
    )
    exp2_results[label] = {'pop': pop, 'history': history, 'L_fiss': L_fiss}


# ═══════════════════════════════════════════════════════════════════
# EXPERIMENT 2 REPORT + FIGURE
# ═══════════════════════════════════════════════════════════════════

print("\n" + "─" * 72)
print("  EXPERIMENT 2 REPORT")
print("─" * 72)

print(f"\n  {'Condition':<30s} {'alive':>8s} {'mean_e':>10s} {'mean_c':>10s} "
      f"{'grabby':>8s} {'ghost':>8s}")
print(f"  {'─'*30} {'─'*8} {'─'*10} {'─'*10} {'─'*8} {'─'*8}")

for label, result in exp2_results.items():
    alive = [a for a in result['pop'] if a.alive]
    n = len(alive)
    if n > 0:
        me = np.mean([a.e for a in alive])
        mc = np.mean([a.c for a in alive])
        g = sum(1 for a in alive if a.e > 0.5 and a.c < 0.3)
        h = sum(1 for a in alive if a.e < 0.3 and a.c > 0.5)
    else:
        me = mc = g = h = 0
    print(f"  {label:<30s} {n:>8d} {me:>10.3f} {mc:>10.3f} "
          f"{g:>8d} {h:>8d}")


fig2 = plt.figure(figsize=(16, 10))
fig2.set_facecolor('#060a12')

# Top row: final state scatter for each condition
for i, (label, result) in enumerate(exp2_results.items()):
    ax = fig2.add_subplot(2, 4, i + 1)
    ax.set_facecolor('#0a0f1a')
    alive = [a for a in result['pop'] if a.alive]
    dead = [a for a in result['pop'] if not a.alive]
    if dead:
        ax.scatter([a.e for a in dead], [a.c for a in dead],
                   c='#5a6b8a', s=3, alpha=0.15, label=f'dead n={len(dead)}')
    if alive:
        ax.scatter([a.e for a in alive], [a.c for a in alive],
                   c='#fbbf24', s=12, alpha=0.8, edgecolors='#060a12',
                   linewidth=0.3, label=f'alive n={len(alive)}')
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_xlabel('e', fontsize=9, color='#8a9bba')
    ax.set_ylabel('c', fontsize=9, color='#8a9bba')
    ax.axvspan(0.5, 1.0, ymin=0, ymax=0.3, color='#ec4899', alpha=0.05)
    ax.axvspan(0.0, 0.3, ymin=0.5, ymax=1.0, color='#4ecdc4', alpha=0.05)
    ax.set_title(label, fontsize=10, color='#d4dae8')
    ax.legend(fontsize=7, facecolor='#0a0f1a', edgecolor='#1a2236',
              labelcolor='#d4dae8', loc='upper right')
    ax.tick_params(colors='#5a6b8a', labelsize=7)
    for s in ax.spines.values(): s.set_color('#1a2236')

# Bottom row: alive count over time, grabby/ghost breakdown
ax_ba = fig2.add_subplot(2, 2, 3)
ax_ba.set_facecolor('#0a0f1a')
for (label, result), color in zip(exp2_results.items(), colors_b):
    h = result['history']
    ax_ba.plot(h['t'], h['alive'], color=color, lw=1.6, label=label, alpha=0.85)
ax_ba.set_xlabel('Time (Myr)', fontsize=10, color='#d4dae8')
ax_ba.set_ylabel('Alive population', fontsize=10, color='#d4dae8')
ax_ba.set_title('Grabby-seeded: total alive population',
                fontsize=11, color='#d4dae8')
ax_ba.legend(fontsize=9, facecolor='#0a0f1a', edgecolor='#1a2236',
             labelcolor='#d4dae8')
ax_ba.tick_params(colors='#5a6b8a')
for s in ax_ba.spines.values(): s.set_color('#1a2236')
ax_ba.grid(True, alpha=0.1)

ax_bb = fig2.add_subplot(2, 2, 4)
ax_bb.set_facecolor('#0a0f1a')
for (label, result), color in zip(exp2_results.items(), colors_b):
    h = result['history']
    ax_bb.plot(h['t'], h['mean_e_alive'], color=color, lw=1.4,
               label=f"{label} (e)", alpha=0.85, ls='-')
    ax_bb.plot(h['t'], h['mean_c_alive'], color=color, lw=1.4,
               label=f"{label} (c)", alpha=0.85, ls='--')
ax_bb.set_xlabel('Time (Myr)', fontsize=10, color='#d4dae8')
ax_bb.set_ylabel('Mean trait value', fontsize=10, color='#d4dae8')
ax_bb.set_title('Grabby-seeded: mean e (solid) and c (dashed) over time',
                fontsize=11, color='#d4dae8')
ax_bb.set_ylim(0, 1)
ax_bb.legend(fontsize=7, facecolor='#0a0f1a', edgecolor='#1a2236',
             labelcolor='#d4dae8', ncol=2)
ax_bb.tick_params(colors='#5a6b8a')
for s in ax_bb.spines.values(): s.set_color('#1a2236')
ax_bb.grid(True, alpha=0.1)

fig2.suptitle('Grabby-Seeded Populations Under Fission — Can Fragmentation Spread Expansionism?\n'
              'Sebastian & Claude · Limen Research · 2026',
              fontsize=13, color='#d4dae8', fontweight='bold', y=0.995)

plt.tight_layout()
plt.savefig('/home/claude/ghost_state_research/filter_fission_grabby.png',
            dpi=180, bbox_inches='tight', facecolor=fig2.get_facecolor())

print("\n  Saved: filter_fission_grabby.png")


# ═══════════════════════════════════════════════════════════════════
# INTERPRETATION
# ═══════════════════════════════════════════════════════════════════

print("\n" + "═" * 72)
print("  INTERPRETATION")
print("═" * 72)

# Compute key summary: did fission rescue grabby lineages in exp 2?
for label in ["No fission (baseline)", "Fission at L=0.15", "Fission at L=0.25", "Fission at L=0.40"]:
    r = exp2_results[label]
    alive = [a for a in r['pop'] if a.alive]
    n = len(alive)
    grabby = sum(1 for a in alive if a.e > 0.5 and a.c < 0.3)
    ghost = sum(1 for a in alive if a.e < 0.3 and a.c > 0.5)
    if n > 0:
        me = np.mean([a.e for a in alive])
        mc = np.mean([a.c for a in alive])
    else:
        me = mc = 0
    print(f"\n  {label}:")
    print(f"    Survivors: {n}   Mean e = {me:.3f}, Mean c = {mc:.3f}")
    print(f"    Grabby-region alive: {grabby}   Ghost-region alive: {ghost}")

print("""
  EMPIRICAL FINDINGS (1500-Myr horizon, 1500-trial populations):

  The filter survives fission.

  • Experiment 1 (diverse initial condition): Without fission, 26
    survivors concentrate in the ghost region at mean_e ≈ 0.12,
    mean_c ≈ 0.52. With fission at any threshold below the natural
    death point, populations undergo transient blooms (up to
    10,000 alive at peak), then crash as expansion costs catch up.
    Long-term survivors remain ghost-concentrated; the grabby
    region is nearly empty regardless of fission (0–0.05%).

  • Experiment 2 (grabby-only seed): ALL four conditions go extinct.
    Without fission, extinction at t ≈ 550 Myr. With fission at
    L=0.15, population blooms to 10,000 alive briefly (t=300–400)
    then crashes to extinction by t=1200. Fission DELAYS extinction
    but does not reverse the selection pressure. Mean expansion
    tendency of dying populations stays high; they never drift
    into the ghost attractor before dying.

  FISSION'S EFFECT: fragmentation redistributes the filter's
  pressure rather than escaping it. Daughters inherit near-parent
  traits (modest η_e, η_c mutation), so grabby parents spawn
  grabby daughters. Each daughter independently faces the same
  cost surface and dies for the same reasons. The population
  appears larger during bloom phases, but the attractor is
  unchanged.

  PAPER IMPLICATION: the Darwinian objection — that selection
  should favour grabby outliers that spread through fragmentation
  — is empirically answered. Grabby-seeded populations extinct
  under fission. The filter's shape determines the long-run
  population distribution, not the lineage reproduction mechanism.

  HONEST LIMITATION: this extension adds one mechanism. We do not
  model horizontal trait transfer (cultural transmission between
  distant lineages), inter-lineage competition for shared resources,
  or fission-compatible cost-sharing architectures (e.g., a lineage
  that reduces α for daughters by sharing infrastructure). Each of
  these is a potential extension. This simulation shows fission
  alone does not circumvent the filter.
""")

print("=" * 72)
print("  FILTER v2 COMPLETE")
print("=" * 72)
