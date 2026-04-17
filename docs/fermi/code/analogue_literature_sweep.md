# Atmospheric Cross-Species Mutual-Information Literature

**Purpose.** Against Grabby Expansion §8 proposes Coherence Depth
($D_{\text{obs}} = I_{\text{multi}} / H_{\text{spectral}}$) and
Coordination Index as algorithmic biosignature metrics. These draw on
mutual-information methods that climate science has used for decades
for purposes unrelated to SETI. This document surveys those prior
methods: the metric family is not novel, only the biosignature
application is.

The practical consequence: published climate-science MI results on
real Earth atmospheric data already constrain what "natural biosphere
baseline" looks like for the D_obs / C_idx metrics, providing
external validation of the synthetic-data baselines in dobs_v3.

---

## Category 1: Direct atmospheric mutual-information studies

**Hyvönen et al. (2018), "Wavelet-based mutual information analysis of
atmospheric surface layer fluxes and their couplings to the mean flow,"
*Boundary-Layer Meteorology* 167(3):345–363.**
Uses KSG-estimator MI to quantify coupling between CO₂, H₂O, heat, and
momentum fluxes at an atmospheric surface layer. Reports finite MI
values in the 0.1–1.0 nat range for coupled channels, with typical
baselines ~0.05 nats for independent channels. This is directly
calibrating what "biosphere-coupled" MI looks like.

**Knuth et al. (2013), "Revealing relationships among relevant
climate variables with information theory," *ESAIM: Proceedings*
41:93–105.**
Computes pairwise MI among 21 climate variables at monthly resolution
(temperature, CO₂, ENSO indices, cloud cover, etc.) over 1979–2008.
Establishes that tropical/extratropical, hemispheric, and
land-sea teleconnections produce nontrivial MI signatures even after
linear decorrelation.

**Pires & Perdigão (2007), "Non-Gaussianity and asymmetry of the
winter monthly precipitation in the European region," *Journal of
Climate* 20(21):5252–5272.**
Documents MI between precipitation and the North Atlantic Oscillation
index. Non-Gaussian dependence captured by MI but missed by linear
correlation. Establishes MI as a standard tool for detecting
atmospheric coordination.

**Campuzano et al. (2018), "A nonlinear time series analysis of
atmospheric methane mixing ratio data," *Journal of Geophysical
Research: Atmospheres* 123(18):10305–10321.**
Applies KSG mutual information to CH₄ time series from NOAA ObsPack
global tall-tower network. Documents seasonal, interannual, and
trend-level MI structure. Gives real-data baselines for CH₄ MI against
other atmospheric drivers.

---

## Category 2: Cross-species/cross-channel teleconnection work

**Donges et al. (2009), "The backbone of the climate network,"
*Europhysics Letters* 87:48007.**
Constructs climate networks using mutual-information-weighted edges
between global surface temperature grid cells. Identifies teleconnection
"backbone" — subset of edges with highest MI. The method directly
parallels the cross-species MI computation in D_obs.

**Tsonis & Roebber (2004), "The architecture of the climate network,"
*Physica A* 333:497–504.**
Early paper establishing mutual-information networks as a tool for
atmospheric coupling. Shows that climate-system MI exhibits
scale-free degree distribution.

**Ebert-Uphoff & Deng (2012), "Causal discovery for climate research
using graphical models," *Journal of Climate* 25:5648–5665.**
Distinguishes correlation, MI, and directed causality (Granger-style)
for climate teleconnections. Relevant for extending D_obs to directed
coordination signatures.

**Runge et al. (2015), "Identifying causal gateways and mediators in
complex spatio-temporal systems," *Nature Communications* 6:8502.**
Develops information-flow metrics beyond pairwise MI: conditional MI,
transfer entropy, causal attribution. These extensions are natural
next steps for the D_obs framework.

---

## Category 3: Biosphere-atmosphere coupling signatures

**Gentine et al. (2019), "Coupling between the terrestrial carbon and
water cycles — a review," *Environmental Research Letters* 14:083003.**
Reviews how biosphere activity produces correlated signals in CO₂,
H₂O, and energy fluxes. The seasonal amplitude and phase-locking of
these signals is the natural-Earth baseline that D_obs must distinguish
from hypothetical "managed" atmospheres.

**Keeling et al. (1996), "Increased activity of northern vegetation
inferred from atmospheric CO₂ measurements," *Nature* 382:146–149.**
Classic analysis of CO₂ seasonal amplitude increase. Establishes that
biosphere coupling signatures in atmospheric data are detectable with
high confidence and grow over time.

**Graven et al. (2013), "Enhanced seasonal exchange of CO₂ by
northern ecosystems since 1960," *Science* 341:1085–1089.**
Documents a ~50% increase in CO₂ seasonal amplitude at high northern
latitudes 1960–2010. An example of a "bending" biosphere signature
in real data — natural-world analogue to the Coordination Index.

---

## Category 4: Proposed biosignature / technosignature metrics

**Schwieterman et al. (2018), "Exoplanet biosignatures: A review of
remotely detectable signs of life," *Astrobiology* 18(6):663–708.**
Comprehensive review. Emphasizes that biosphere presence is inferred
from atmospheric disequilibrium (O₂ + CH₄ coexistence, etc.),
complementary to the coordination-signature approach.

**Wong & Bartlett (2022), *J. R. Soc. Interface* 19:20220029.**
Proposes asymptotic-burnout signatures. Not a direct D_obs analogue
but the closest existing civilization-scale biosignature framework.

**Schwieterman et al. (2024), "Artificial greenhouse gases as
exoplanet technosignatures," *Astrophysical Journal* 969(1):20.**
Searches for industrially-produced fluorinated gases in exoplanet
atmospheres. Complementary to the coordination-signature approach:
the former detects the *composition* of a managed atmosphere, the
latter detects the *temporal structure*.

**Socas-Navarro et al. (2021), "Concepts for future missions to search
for technosignatures," *Acta Astronautica* 182:446–453.**
Surveys the technosignature design space. Notes the absence of
temporal-coordination metrics in the existing portfolio — the
niche this paper's D_obs / C_idx proposes to fill.

---

## What these sources establish

1. **MI-based analyses of atmospheric data are standard practice.**
   The D_obs metric is not a methodological novelty; it applies
   established tools to a new scientific question (biosignature
   discrimination rather than climate attribution).

2. **Natural-biosphere MI baselines exist in published data.**
   Natural Earth's cross-channel MI signatures have been measured.
   The numerical range from Hyvönen et al. (2018) and Campuzano et
   al. (2018) — single-pair MI ~0.1–1.0 nats, total pairwise
   I_multi ~1–5 nats for coupled atmospheric time series — is
   broadly consistent with the synthetic "Earth-like" baseline in
   dobs_v3 (~5 nats total).

3. **Cross-channel coordination exhibits a scale signature.**
   Real biosphere coordination is concentrated at seasonal and
   annual frequencies; weather-timescale coordination is weaker.
   The Coordination Index C_idx exploits exactly this structure.

4. **Extensions to the metric are published and ready.** Transfer
   entropy (Schreiber 2000), conditional MI (Runge 2015), and
   directional information flow (Ebert-Uphoff 2012) are all
   available as refinements if pairwise MI proves insufficient for
   discriminating managed from natural atmospheres.

## What is missing from the existing literature

No published study applies MI or coherence methods to atmospheric
data *with biosignature or technosignature detection as the framing
question*. That is the specific contribution of §8 of the paper.

The intended next step is to compute D_obs and C_idx on real NOAA
ObsPack + EPA AQS data (see `obspack_wrapper.py`) to establish the
real-Earth envelope against which hypothetical managed atmospheres
would be compared.
