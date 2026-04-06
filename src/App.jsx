import { useState, lazy, Suspense } from "react";

const SocialPhaseTransitionLab = lazy(() => import("./simulations/SocialPhaseTransitionLab.jsx"));
const ParticleLenia = lazy(() => import("./simulations/ParticleLenia.jsx"));
const GrayScottRD = lazy(() => import("./simulations/GrayScottRD.jsx"));
const ParticleLife = lazy(() => import("./simulations/ParticleLife.jsx"));
const PrimordialParticles = lazy(() => import("./simulations/PrimordialParticles.jsx"));

const SIMS = [
  { id: "ising", label: "Ising · Phase Transitions", icon: "◈", color: "#4ecdc4", desc: "2D Ising model with Metropolis-Hastings & Wolff cluster algorithms. Tsarev social mapping." },
  { id: "lenia", label: "Particle Lenia", icon: "◉", color: "#f59e0b", desc: "Gradient-based particle life with Gaussian shell kernels. Mass-conservative multi-species ecology." },
  { id: "rd", label: "Gray-Scott RD", icon: "◎", color: "#a78bfa", desc: "Reaction-diffusion morphogenesis. Mitosis, coral, spirals, and soliton patterns from two PDEs." },
  { id: "plife", label: "Particle Life", icon: "◆", color: "#ec4899", desc: "Asymmetric force matrices between particle types. Emergent predation, symbiosis, membranes." },
  { id: "pps", label: "Primordial Particles", icon: "◇", color: "#34d399", desc: "One equation, two parameters. Cells that grow, divide, form spores, and self-repair." },
];

function Loading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", color: "#5a6b8a", fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3, animation: "pulse 2s ease-in-out infinite" }}>◈</div>
        <div>INITIALIZING SUBSTRATE...</div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.2; } 50% { opacity: 0.6; } }`}</style>
      </div>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState(null);

  if (active === null) {
    return <LandingPage onSelect={setActive} />;
  }

  const sim = SIMS.find(s => s.id === active);
  const Comp = {
    ising: SocialPhaseTransitionLab,
    lenia: ParticleLenia,
    rd: GrayScottRD,
    plife: ParticleLife,
    pps: PrimordialParticles,
  }[active];

  return (
    <div style={{ minHeight: "100vh", background: "#060a12", color: "#d4dae8" }}>
      {/* Top nav bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
        background: "#0a0f1a", borderBottom: "1px solid #1a2236",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <button onClick={() => setActive(null)} style={{
          background: "none", border: "1px solid #1a2236", borderRadius: 5,
          color: "#5a6b8a", padding: "4px 10px", cursor: "pointer",
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.08em",
        }}>← GENESIS</button>
        <div style={{ width: 1, height: 16, background: "#1a2236" }} />
        {SIMS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)} style={{
            background: s.id === active ? s.color + "18" : "transparent",
            border: s.id === active ? `1px solid ${s.color}44` : "1px solid transparent",
            borderRadius: 5, color: s.id === active ? s.color : "#5a6b8a",
            padding: "4px 10px", cursor: "pointer", fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace", fontWeight: s.id === active ? 600 : 400,
            letterSpacing: "0.06em", transition: "all 0.2s",
          }}>
            <span style={{ marginRight: 4 }}>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<Loading />}>
        <Comp />
      </Suspense>
    </div>
  );
}

function LandingPage({ onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{
      minHeight: "100vh", background: "#060a12", color: "#d4dae8",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "80px 20px 40px", maxWidth: 700 }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.35em", color: "#5a6b8a",
          fontFamily: "'JetBrains Mono', monospace", marginBottom: 20,
          textTransform: "uppercase",
        }}>
          Replete AI · Teármann Research Ecosystem
        </div>
        <h1 style={{
          fontSize: 64, fontWeight: 300, letterSpacing: "0.15em",
          fontFamily: "'Cormorant Garamond', serif", margin: 0,
          background: "linear-gradient(135deg, #4ecdc4, #a78bfa, #f59e0b)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1.1,
        }}>
          GENESIS
        </h1>
        <div style={{
          fontSize: 14, color: "#5a6b8a", marginTop: 16, lineHeight: 1.7,
          fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
        }}>
          A multi-dimensional artificial life laboratory.<br />
          Five substrates. One garden. Infinite structures.
        </div>
        <div style={{
          marginTop: 20, fontSize: 10, color: "#3a4b6a",
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em",
        }}>
          Ising · Lenia · Gray-Scott · Particle Life · Primordial Particles
        </div>
      </div>

      {/* Simulation cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 14, maxWidth: 960, width: "100%", padding: "20px 20px 80px",
      }}>
        {SIMS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === s.id ? "#0f1520" : "#0b1018",
              border: `1px solid ${hovered === s.id ? s.color + "44" : "#1a2236"}`,
              borderRadius: 10, padding: "24px 20px", cursor: "pointer",
              textAlign: "left", transition: "all 0.3s ease",
              boxShadow: hovered === s.id ? `0 0 30px ${s.color}08` : "none",
              transform: hovered === s.id ? "translateY(-2px)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: 22, color: s.color,
                filter: hovered === s.id ? `drop-shadow(0 0 8px ${s.color}66)` : "none",
                transition: "filter 0.3s",
              }}>{s.icon}</span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: hovered === s.id ? s.color : "#d4dae8",
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em",
                transition: "color 0.3s",
              }}>{s.label}</span>
            </div>
            <div style={{
              fontSize: 12, color: "#5a6b8a", lineHeight: 1.6,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
            }}>
              {s.desc}
            </div>
            <div style={{
              marginTop: 14, fontSize: 9, color: s.color,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em", textTransform: "uppercase",
              opacity: hovered === s.id ? 1 : 0.4, transition: "opacity 0.3s",
            }}>
              ENTER SUBSTRATE →
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "30px 20px 40px", textAlign: "center",
        fontSize: 10, color: "#3a4b6a", fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.06em", lineHeight: 1.8,
      }}>
        Built by Stanley · Kquant03 · Replete AI<br />
        Part of the Teármann Research Ecosystem<br />
        After Tsarev et al. (2019) · Chan (2018) · Pearson (1993) · Schmickl et al. (2016)
      </div>
    </div>
  );
}
