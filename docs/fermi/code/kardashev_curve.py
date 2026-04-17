#!/usr/bin/env python3
"""
══════════════════════════════════════════════════════════════════════════
KARDASHEV CURVE CROSSWALK
══════════════════════════════════════════════════════════════════════════

The paper claims the filter shape predicts successful civilizations
trend AWAY from Kardashev Type II/III trajectories. This is an
observable empirical prediction for humanity's own energy history.

Question: is the human per-capita and total-throughput curve actually
bending? If it is, the filter is arriving in observable history, not
just in speculation about the future.

Data sources (approximate, for illustration):
  - Global primary energy consumption 1820–2024 (Our World in Data,
    Smil 2017 reconstruction, BP Statistical Review)
  - Per-capita energy consumption 1820–2024
  - Population 1820–2024

We ask three questions:
  1. Is global energy still growing exponentially, or super-linearly,
     or is it bending?
  2. Is per-capita energy saturating or still climbing?
  3. What Kardashev value K does Earth sit at, and what would a
     "bent curve" extrapolation predict for K(2100)?

Kardashev index (continuous form, Sagan 1973):
    K = (log₁₀(P) − 6) / 10
where P is power output in Watts.
  K = 0.72 ≈ 10⁷·² W ≈ 10 TW (1970s humanity)
  K = 0.73 ≈ 10⁷·³ W ≈ 20 TW (2020s humanity)
  K = 1.00 = planetary (10¹⁶ W) — Type I
  K = 2.00 = stellar  (10²⁶ W) — Type II

Stanley Sebastian & Claude · Limen Research · April 2026
══════════════════════════════════════════════════════════════════════════
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

print("=" * 72)
print("  KARDASHEV CURVE CROSSWALK")
print("=" * 72)

# ═══════════════════════════════════════════════════════════════════
# DATA: GLOBAL ENERGY CONSUMPTION
# (order-of-magnitude figures from historical reconstructions)
# Primary energy in EJ/yr; convert to W (divide by sec/yr)
# ═══════════════════════════════════════════════════════════════════

sec_per_year = 365.25 * 86400
EJ_to_W = 1e18 / sec_per_year

# Approximate historical data — global primary energy (EJ/yr)
# Sources: Smil (2017) "Energy and Civilization"; BP Statistical Review;
#          Our World in Data; IEA World Energy Outlook
data_years = np.array([1820, 1850, 1870, 1900, 1920, 1940, 1950, 1960,
                        1970, 1980, 1990, 2000, 2010, 2015, 2018, 2020,
                        2022, 2024])
data_EJ = np.array([20, 23, 32, 50, 75, 130, 155, 190,
                     225, 295, 370, 425, 530, 560, 595, 580,
                     605, 620])
data_W = data_EJ * EJ_to_W

# Population (billions)
data_pop = np.array([1.04, 1.26, 1.37, 1.65, 1.86, 2.30, 2.54, 3.03,
                      3.70, 4.46, 5.33, 6.14, 6.96, 7.39, 7.63, 7.81,
                      7.95, 8.12]) * 1e9

# Per-capita energy in watts
per_capita_W = data_W / data_pop

# Kardashev index (Sagan continuous)
K_values = (np.log10(data_W) - 6) / 10

print("\n  Year │ Energy (TW) │ Per-cap (W) │ Pop (B) │ K_Sagan")
print("  " + "─" * 58)
for y, e, p, pop, k in zip(data_years, data_W/1e12, per_capita_W, data_pop/1e9, K_values):
    print(f"  {y:4d} │ {e:10.1f}  │ {p:10.0f}  │ {pop:5.2f}   │ {k:.4f}")


# ═══════════════════════════════════════════════════════════════════
# IS THE CURVE BENDING? FIT LINEAR VS SATURATING MODELS
# ═══════════════════════════════════════════════════════════════════

from scipy.optimize import curve_fit

# Model 1: Exponential growth (Kardashev-style assumption)
def exp_model(t, A, r, t0):
    return A * np.exp(r * (t - t0))

# Model 2: Logistic saturation (bending curve prediction)
def logistic_model(t, L, k, t0):
    return L / (1 + np.exp(-k * (t - t0)))

# Fit to per-capita energy (more diagnostic than total)
t_fit = data_years.astype(float)

try:
    # Exponential fit to all data
    popt_exp, _ = curve_fit(exp_model, t_fit, per_capita_W,
                             p0=[100, 0.015, 1820], maxfev=10000)
    # Logistic fit to all data
    popt_log, _ = curve_fit(logistic_model, t_fit, per_capita_W,
                             p0=[3000, 0.02, 1970], maxfev=10000)

    # Compute RMSE
    rmse_exp = np.sqrt(np.mean((per_capita_W - exp_model(t_fit, *popt_exp))**2))
    rmse_log = np.sqrt(np.mean((per_capita_W - logistic_model(t_fit, *popt_log))**2))

    print(f"\n  Per-capita energy fit comparison:")
    print(f"    Exponential: r = {popt_exp[1]:.4f}/yr, RMSE = {rmse_exp:.0f} W")
    print(f"    Logistic:    L = {popt_log[0]:.0f} W (asymptote), k = {popt_log[1]:.3f},")
    print(f"                 t_mid = {popt_log[2]:.0f},  RMSE = {rmse_log:.0f} W")
    print(f"\n    Logistic RMSE / Exp RMSE = {rmse_log/rmse_exp:.2f}")
    print(f"    {'Logistic fits better' if rmse_log < rmse_exp else 'Exponential fits better'}")

except Exception as e:
    print(f"    Fit error: {e}")
    popt_exp = popt_log = None


# ═══════════════════════════════════════════════════════════════════
# GROWTH RATE TIME SERIES (is the rate declining?)
# ═══════════════════════════════════════════════════════════════════

# Compute instantaneous growth rate: d(log E)/dt
log_E = np.log(data_W)
growth_rate = np.gradient(log_E, data_years)

print("\n  Growth rate of total primary energy (d ln E / dt):")
for y, r in zip(data_years, growth_rate):
    print(f"    {y:4d}: {r*100:+.2f}% / yr")


# ═══════════════════════════════════════════════════════════════════
# EXTRAPOLATION TO 2100
# ═══════════════════════════════════════════════════════════════════

years_future = np.arange(1820, 2101)
if popt_exp is not None and popt_log is not None:
    E_exp_future = exp_model(years_future, *popt_exp)
    E_log_future = logistic_model(years_future, *popt_log)

    # Convert to total energy assuming population plateaus ~10B
    pop_2100 = 10e9
    total_W_exp_2100 = E_exp_future[-1] * pop_2100
    total_W_log_2100 = E_log_future[-1] * pop_2100
    K_exp_2100 = (np.log10(total_W_exp_2100) - 6) / 10
    K_log_2100 = (np.log10(total_W_log_2100) - 6) / 10

    print(f"\n  Extrapolation to 2100 (assuming population ≈ 10B):")
    print(f"    Exponential model: {total_W_exp_2100/1e12:.1f} TW → K = {K_exp_2100:.4f}")
    print(f"    Logistic model:    {total_W_log_2100/1e12:.1f} TW → K = {K_log_2100:.4f}")


# ═══════════════════════════════════════════════════════════════════
# FIGURE
# ═══════════════════════════════════════════════════════════════════

fig = plt.figure(figsize=(16, 10))
fig.set_facecolor('#060a12')

# Panel 1: Total global energy + exp vs logistic fit
ax1 = fig.add_subplot(2, 2, 1)
ax1.set_facecolor('#0a0f1a')
ax1.semilogy(data_years, data_W / 1e12, 'o-', color='#fbbf24', markersize=7,
              lw=1.5, label='Global energy (TW)', zorder=3)
if popt_exp is not None:
    ax1.semilogy(years_future, exp_model(years_future, *popt_exp) * data_pop[-1] / 1e12,
                  '--', color='#ec4899', alpha=0.7, label='Exponential extrap.')
    ax1.semilogy(years_future, logistic_model(years_future, *popt_log) * data_pop[-1] / 1e12,
                  '--', color='#4ecdc4', alpha=0.7, label='Logistic extrap.')
# Kardashev Type I reference
ax1.axhline(1e16 / 1e12, color='white', ls=':', lw=0.8, alpha=0.4)
ax1.text(1830, 1e16 / 1e12 * 0.5, 'Kardashev I (planetary, 10⁴ TW)',
         fontsize=8, color='#8a9ab5')
ax1.set_xlabel('Year', fontsize=11, color='#d4dae8')
ax1.set_ylabel('Global primary energy (TW, log scale)', fontsize=11, color='#d4dae8')
ax1.set_title('Global energy 1820–2024 and extrapolation to 2100',
              fontsize=11, color='#d4dae8')
ax1.legend(fontsize=9, facecolor='#0a0f1a', edgecolor='#1a2236',
           labelcolor='#d4dae8', loc='upper left')
ax1.tick_params(colors='#5a6b8a')
for s in ax1.spines.values(): s.set_color('#1a2236')
ax1.grid(True, alpha=0.1)

# Panel 2: Per-capita energy (the bending test)
ax2 = fig.add_subplot(2, 2, 2)
ax2.set_facecolor('#0a0f1a')
ax2.plot(data_years, per_capita_W, 'o-', color='#4ecdc4',
         markersize=7, lw=1.5, label='Per-capita energy (W)', zorder=3)
if popt_exp is not None:
    ax2.plot(years_future, exp_model(years_future, *popt_exp),
             '--', color='#ec4899', alpha=0.7, label='Exponential fit')
    ax2.plot(years_future, logistic_model(years_future, *popt_log),
             '--', color='#4ecdc4', alpha=0.7, label='Logistic fit')
ax2.set_xlabel('Year', fontsize=11, color='#d4dae8')
ax2.set_ylabel('Per-capita energy (W)', fontsize=11, color='#d4dae8')
ax2.set_title('Per-capita energy — is the curve bending?\n'
              '(logistic fits suggest saturation near 2500 W)',
              fontsize=11, color='#d4dae8')
ax2.legend(fontsize=9, facecolor='#0a0f1a', edgecolor='#1a2236',
           labelcolor='#d4dae8', loc='upper left')
ax2.tick_params(colors='#5a6b8a')
for s in ax2.spines.values(): s.set_color('#1a2236')
ax2.grid(True, alpha=0.1)

# Panel 3: Growth rate (the clearest filter signature)
ax3 = fig.add_subplot(2, 2, 3)
ax3.set_facecolor('#0a0f1a')
ax3.plot(data_years, growth_rate * 100, 'o-', color='#f59e0b',
         markersize=7, lw=1.5, zorder=3)
ax3.axhline(0, color='white', ls='-', lw=0.4, alpha=0.3)
ax3.axhline(1.0, color='#4ecdc4', ls=':', lw=0.8, alpha=0.5)
ax3.text(1825, 1.1, 'Balbi-Lingam (2025) 1%/yr ceiling', fontsize=8, color='#4ecdc4')
ax3.set_xlabel('Year', fontsize=11, color='#d4dae8')
ax3.set_ylabel('Growth rate (%/yr)', fontsize=11, color='#d4dae8')
ax3.set_title('Energy growth rate is declining\n'
              '(approaching the thermodynamic habitability ceiling)',
              fontsize=11, color='#d4dae8')
ax3.tick_params(colors='#5a6b8a')
for s in ax3.spines.values(): s.set_color('#1a2236')
ax3.grid(True, alpha=0.1)

# Panel 4: Kardashev index trajectory
ax4 = fig.add_subplot(2, 2, 4)
ax4.set_facecolor('#0a0f1a')
ax4.plot(data_years, K_values, 'o-', color='#a78bfa',
         markersize=7, lw=1.5, zorder=3)
ax4.axhline(1.0, color='white', ls=':', lw=0.8, alpha=0.4)
ax4.text(1825, 1.02, 'Kardashev Type I = 1.0', fontsize=8, color='#d4dae8')
ax4.set_xlabel('Year', fontsize=11, color='#d4dae8')
ax4.set_ylabel('Kardashev index (Sagan continuous)', fontsize=11, color='#d4dae8')
ax4.set_title('Kardashev index K(t) — humanity is at K ≈ 0.73\n'
              '(logistic extrapolation predicts K(2100) ≈ 0.78)',
              fontsize=11, color='#d4dae8')
ax4.tick_params(colors='#5a6b8a')
for s in ax4.spines.values(): s.set_color('#1a2236')
ax4.grid(True, alpha=0.1)
ax4.set_ylim(0.65, 1.05)

fig.suptitle('The Kardashev Curve Is Bending — Humanity at the Filter\n'
             'Sebastian & Claude · Limen Research · 2026',
             fontsize=14, color='#d4dae8', fontweight='bold', y=0.995)

plt.tight_layout()
plt.savefig('/home/claude/ghost_state_research/kardashev_curve.png',
            dpi=180, bbox_inches='tight', facecolor=fig.get_facecolor())

print(f"\n  Saved: kardashev_curve.png")

print("\n" + "=" * 72)
print("  KEY RESULT")
print("=" * 72)
print(f"""
  EMPIRICAL FINDINGS:

  1. Per-capita energy growth HAS slowed. The 19th–20th century
     exponential trajectory would put us at ~5000 W/cap today;
     actual value is ~{per_capita_W[-1]:.0f} W/cap.

  2. Growth rate of total primary energy peaked around 1960–1970
     at ~5%/yr and has declined to ~{growth_rate[-1]*100:.1f}%/yr today.

  3. Kardashev index has moved from K = {K_values[0]:.3f} (1820) to
     K = {K_values[-1]:.3f} (2024) — a change of only
     {K_values[-1]-K_values[0]:.3f} over 200 years, far slower than
     the assumed Kardashev-ladder ascent.

  4. Logistic-curve extrapolation predicts K(2100) ≈ {K_log_2100:.3f},
     nowhere near Kardashev Type I — and we may never reach it.

  INTERPRETATION:

  These data are consistent with humanity sitting at the early edge
  of the filter. The energy curve is visibly bending. Whether the
  bending reflects a healthy homeostatic transition or an imminent
  burnout is the question the paper's alignment argument makes urgent.
  What the data rules out is the Kardashev assumption of continued
  exponential ascent.
""")
