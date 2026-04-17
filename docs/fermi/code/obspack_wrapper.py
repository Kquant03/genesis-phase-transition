#!/usr/bin/env python3
"""
══════════════════════════════════════════════════════════════════════════
OBSPACK WRAPPER: ZERO-CLICK REAL-DATA PIPELINE
══════════════════════════════════════════════════════════════════════════

This is the companion to dobs_v3.py. It ingests real NOAA ObsPack
multi-species tower data and feeds it through the D_obs + C_idx
pipeline with minimal user intervention.

WORKFLOW:
  1. Download ObsPack NetCDF files from NOAA GML
  2. Place them in ./obspack_data/
  3. Run this script: python3 obspack_wrapper.py
  4. Output: figure + printed metrics + CSV of results

DATA SOURCES (free, open access):

  CO₂ (primary):
    https://gml.noaa.gov/ccgg/obspack/data.php?id=obspack_co2_1_GLOBALVIEWplus_v10.0
    Tall tower product recommended: LEF (Park Falls, WI)
    or WKT (Moody, TX). Daily resolution preferred.

  CH₄:
    https://gml.noaa.gov/ccgg/obspack/data.php
    (Same product family, CH4 version)

  N₂O:
    https://gml.noaa.gov/aftp/data/trace_gases/n2o/flask/
    Flask network data, monthly. Interpolate to daily.

  O₃ (surface):
    https://aqs.epa.gov/aqsweb/airdata/download_files.html
    EPA Air Quality System. Choose a rural-background station
    co-located (or nearest) to the chosen CO2 tower.

EXPECTED RESULTS FOR REAL EARTH DATA:
  Natural biosphere baseline:
    D_obs   ≈ 4–10  (moderate MI, substantial spectral entropy)
    C_idx   ≈ 0.15–0.35  (seasonal coupling, not multi-species lock)

  Actively managed biosphere (hypothetical post-filter Earth):
    D_obs   ≥ 15   (tight MI)
    C_idx   ≥ 0.6  (multi-species phase-locking across scales)

IF REAL EARTH DATA PRODUCES D_obs > 15 OR C_idx > 0.6, the metric
cannot cleanly distinguish managed from unmanaged biospheres without
additional augmentation (§9 falsification condition of the paper).

Stanley Sebastian & Claude · Limen Research · April 2026
══════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import glob
import numpy as np
import pandas as pd
from pathlib import Path

# Import pipeline from dobs_v3
sys.path.insert(0, str(Path(__file__).parent))
try:
    from dobs_v3 import (compute_metrics, bootstrap, detrend_only,
                          ksg_mi, total_mi, spectral_entropy,
                          coordination_index)
    PIPELINE_AVAILABLE = True
except ImportError:
    PIPELINE_AVAILABLE = False

DATA_DIR = Path(__file__).parent / 'obspack_data'


def load_obspack_nc(filepath, variable_name='value'):
    """
    Load an ObsPack NetCDF file and return (time_array, value_array).

    Tries to use netCDF4 if available; falls back to instructions
    for xarray or conversion to CSV.
    """
    try:
        import netCDF4 as nc
        ds = nc.Dataset(filepath)
        time_raw = ds['time'][:]
        time_units = ds['time'].units
        times = nc.num2date(time_raw, time_units)
        values = ds[variable_name][:]
        ds.close()
        # Convert datetime objects to pandas DatetimeIndex
        dt_index = pd.DatetimeIndex([pd.Timestamp(t.isoformat()) for t in times])
        return dt_index, np.asarray(values)
    except ImportError:
        try:
            import xarray as xr
            ds = xr.open_dataset(filepath)
            times = pd.DatetimeIndex(ds['time'].values)
            values = ds[variable_name].values
            return times, values
        except ImportError:
            raise ImportError(
                "Install netCDF4 (pip install netCDF4) or xarray "
                "(pip install xarray) to read ObsPack files. "
                "Alternatively, convert NetCDF to CSV first."
            )


def load_csv_fallback(filepath, time_col='time', value_col='value'):
    """Load a CSV file with time and value columns."""
    df = pd.read_csv(filepath, parse_dates=[time_col])
    return pd.DatetimeIndex(df[time_col]), df[value_col].values


def load_species(pattern, variable='value'):
    """
    Load all files matching pattern, concatenate, resample to daily.

    pattern: glob pattern, e.g. 'obspack_data/obspack_co2_*.nc'
    """
    files = sorted(glob.glob(str(pattern)))
    if not files:
        return None, None

    all_times, all_values = [], []
    for f in files:
        try:
            if f.endswith('.nc'):
                t, v = load_obspack_nc(f, variable)
            else:
                t, v = load_csv_fallback(f)
            all_times.append(t)
            all_values.append(v)
        except Exception as e:
            print(f"    Warning: could not load {f}: {e}")
            continue

    if not all_times:
        return None, None

    all_times = all_times[0].append(all_times[1:]) if len(all_times) > 1 else all_times[0]
    all_values = np.concatenate(all_values)

    df = pd.DataFrame({'t': all_times, 'v': all_values}).dropna()
    df = df.sort_values('t').set_index('t')
    daily = df['v'].resample('D').mean().dropna()
    return daily.index, daily.values


def build_atmosphere_from_obspack():
    """Try to build an atmosphere dict from files in DATA_DIR."""
    if not DATA_DIR.exists():
        return None

    species_patterns = {
        'CO2': DATA_DIR / 'obspack_co2_*.nc',
        'CH4': DATA_DIR / 'obspack_ch4_*.nc',
        'N2O': DATA_DIR / 'obspack_n2o_*.nc',
        'O3':  DATA_DIR / 'epa_o3_*.csv',
    }

    atm = {}
    earliest_start = None
    latest_start = None

    for sp, pattern in species_patterns.items():
        times, values = load_species(pattern)
        if times is None:
            # Try CSV fallback
            pattern_csv = str(pattern).replace('*.nc', '*.csv')
            times, values = load_species(pattern_csv)
        if times is None:
            print(f"    No data for {sp} (pattern: {pattern})")
            atm[sp] = None
            continue
        atm[sp] = (times, values)
        if earliest_start is None or times[0] > earliest_start:
            earliest_start = times[0]
        if latest_start is None or times[-1] < latest_start:
            latest_start = times[-1]

    # Align to common time range
    if all(v is not None for v in atm.values()) and earliest_start and latest_start:
        print(f"    Aligning to {earliest_start.date()} – {latest_start.date()}")
        aligned = {}
        for sp, (t, v) in atm.items():
            mask = (t >= earliest_start) & (t <= latest_start)
            aligned[sp] = v[mask]
        # Common daily grid
        n_common = min(len(v) for v in aligned.values())
        for sp in aligned:
            aligned[sp] = aligned[sp][:n_common]
        aligned['t'] = np.arange(n_common) / 365.25
        return aligned

    return None


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    print("=" * 72)
    print("  OBSPACK WRAPPER")
    print("=" * 72)

    if not PIPELINE_AVAILABLE:
        print("\n  ERROR: dobs_v3 module not found. Ensure dobs_v3.py is in")
        print("  the same directory as this script.")
        return 1

    atm = build_atmosphere_from_obspack()

    if atm is None:
        print("\n  No real data found in obspack_data/")
        print("\n  TO RUN ON REAL DATA:")
        print("  1. Create directory: mkdir obspack_data")
        print("  2. Download NetCDF files from NOAA GML (see header docstring)")
        print("  3. Place them in obspack_data/ with the following naming:")
        print("     obspack_co2_<site>_<date>.nc")
        print("     obspack_ch4_<site>_<date>.nc")
        print("     obspack_n2o_<site>_<date>.nc")
        print("     epa_o3_<site>_<date>.csv")
        print("  4. Re-run: python3 obspack_wrapper.py")
        print("\n  Alternatively, convert to CSV with columns [time, value]")
        print("  and place in obspack_data/ with names:")
        print("     co2_real.csv, ch4_real.csv, n2o_real.csv, o3_real.csv")
        return 2

    print(f"\n  Loaded real atmospheric time series:")
    for sp in ['CO2', 'CH4', 'N2O', 'O3']:
        print(f"    {sp}: {len(atm[sp])} daily values "
              f"(mean = {np.mean(atm[sp]):.3f})")

    print("\n  Running D_obs + C_idx pipeline on real data...")
    result = compute_metrics(atm, name="NOAA/EPA real data", verbose=True)

    print("\n  Bootstrap confidence intervals...")
    bootstrap_results = bootstrap(atm, n_boot=30)
    D_m, D_lo, D_hi, C_m, C_lo, C_hi = bootstrap_results
    print(f"    D_obs: {D_m:.4f}  95% CI [{D_lo:.4f}, {D_hi:.4f}]")
    print(f"    C_idx: {C_m:.4f}  95% CI [{C_lo:.4f}, {C_hi:.4f}]")

    # Write results to CSV
    out_file = DATA_DIR.parent / 'obspack_results.csv'
    with open(out_file, 'w') as f:
        f.write("metric,value,ci_lo,ci_hi\n")
        f.write(f"D_obs,{result['D_obs']:.4f},{D_lo:.4f},{D_hi:.4f}\n")
        f.write(f"C_idx,{result['C_idx']:.4f},{C_lo:.4f},{C_hi:.4f}\n")
        f.write(f"I_multi,{result['I_multi']:.4f},,\n")
        f.write(f"H_spectral,{result['H_spectral']:.4f},,\n")
    print(f"\n  Wrote: {out_file}")

    # Interpret
    print("\n" + "─" * 72)
    print("  INTERPRETATION AGAINST SYNTHETIC BASELINE")
    print("─" * 72)

    print(f"""
  Real Earth D_obs = {result['D_obs']:.4f}
    Synthetic Earth-like baseline: ~5.2
    Synthetic ghost-state managed: ~22.7
    Abiotic planet:                ~0.03

  Real Earth C_idx = {result['C_idx']:.4f}
    Synthetic Earth-like baseline: ~0.19
    Synthetic ghost-state managed: ~0.25
    Abiotic planet:                ~0.11

  If real values are close to synthetic Earth-like: the metric
    distinguishes biosphere-present from biosphere-absent. Management
    detection requires further calibration.

  If real values exceed synthetic ghost-state thresholds: the metric
    cannot distinguish managed from unmanaged biospheres with the
    current preprocessing (paper §9 falsification condition).

  If real values fall between Earth-like and ghost-state: the metric
    has discriminative power. We can refine the threshold using the
    real-Earth distribution as the natural-biosphere envelope.
""")

    return 0


if __name__ == '__main__':
    sys.exit(main())
