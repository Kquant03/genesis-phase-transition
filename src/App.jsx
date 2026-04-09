import { useState, useRef, useEffect, lazy, Suspense } from "react";

const SocialPhaseTransitionLab = lazy(() => import("./simulations/SocialPhaseTransitionLab.jsx"));
const Lenia = lazy(() => import("./simulations/Lenia.jsx"));
const GrayScottRD = lazy(() => import("./simulations/GrayScottRD.jsx"));
const ParticleLife = lazy(() => import("./simulations/ParticleLife.jsx"));
const PrimordialParticles = lazy(() => import("./simulations/PrimordialParticles.jsx"));

const SIMS = [
  { id: "ising", label: "Ising · Phase Transitions", icon: "◈", color: "#4ecdc4", desc: "2D Ising model with Metropolis-Hastings & Wolff cluster algorithms. Tsarev social mapping." },
  { id: "lenia", label: "Lenia", icon: "◉", color: "#f59e0b", desc: "Continuous cellular automata with FFT convolution. Smooth organic lifeforms from Gaussian ring kernels and growth functions." },
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

// ---------- Fade helper (exponential ease-out) ----------
function fadeAudio(audio, targetVolume, duration, onComplete) {
  if (!audio) return;
  const startVolume = audio.volume;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 2);
    audio.volume = startVolume + (targetVolume - startVolume) * ease;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      if (targetVolume === 0) audio.pause();
      if (onComplete) onComplete();
    }
  };
  requestAnimationFrame(step);
}

export default function App() {
  const [active, setActive] = useState(null);

  if (active === null) {
    return <LandingPage onSelect={setActive} />;
  }

  const Comp = {
    ising: SocialPhaseTransitionLab,
    lenia: Lenia,
    rd: GrayScottRD,
    plife: ParticleLife,
    pps: PrimordialParticles,
  }[active];

  return (
    <div style={{ minHeight: "100vh", background: "#060a12", color: "#d4dae8" }}>
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

// ---------- Landing Page with magical piano intermission ----------
function LandingPage({ onSelect }) {
  const [hovered, setHovered] = useState(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem("genesis-muted") === "true");
  const audioRef = useRef(null);
  const musicEnabledRef = useRef(false); // ← fix: inside the component
  const heroCanvasRef = useRef(null);
  const navTimeoutRef = useRef(null);

  // Create audio element and set up autoplay on first user interaction
  useEffect(() => {
    const audio = new Audio("/genesis-phase-transition/fever-intermission.mp3");
    audio.loop = false;
    audio.volume = 0;
    audio.preload = "auto";
    audioRef.current = audio;

    const startMusic = () => {
      if (audioRef.current && !musicEnabledRef.current) {
        musicEnabledRef.current = true;
        if (!muted) {  // ← only autoplay if not muted
          audioRef.current.play().then(() => {
            fadeAudio(audioRef.current, 0.28, 1800);
            setMusicEnabled(true);
            setMusicPlaying(true);
          }).catch(e => console.log("Audio play blocked – user interaction required"));
        }
      }
      window.removeEventListener("click", startMusic);
    };
    window.addEventListener("click", startMusic);

    return () => {
      window.removeEventListener("click", startMusic);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Toggle mute / unmute
  const toggleMusic = () => {
    if (!audioRef.current) return;
    const nowMuted = !muted;
    setMuted(nowMuted);
    localStorage.setItem("genesis-muted", nowMuted);

    if (nowMuted) {
      fadeAudio(audioRef.current, 0, 500, () => {
        if (audioRef.current) audioRef.current.pause();
        setMusicPlaying(false);
      });
    } else {
      if (audioRef.current.currentTime >= audioRef.current.duration - 0.5) {
        audioRef.current.currentTime = 0;
      }
      audioRef.current.play().then(() => {
        fadeAudio(audioRef.current, 0.28, 800);
        setMusicPlaying(true);
      }).catch(e => console.log("Play failed", e));
    }
  };

  // Fade out and navigate when a simulation card is clicked
  const handleSelectWithFade = (simId) => {
    if (navTimeoutRef.current) return;
    if (audioRef.current && musicPlaying) {
      fadeAudio(audioRef.current, 0, 700, () => {
        onSelect(simId);
      });
    } else {
      onSelect(simId);
    }
  };

  // Hero particle simulation
  useEffect(() => {
    const canvas = heroCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const N = 180;
    const TYPES = 5;
    const colors = [
      [78, 205, 196, 0.7], [167, 139, 250, 0.7],
      [245, 158, 11, 0.6], [236, 72, 153, 0.6], [52, 211, 153, 0.6]
    ];
    const px = new Float32Array(N), py = new Float32Array(N);
    const vx = new Float32Array(N), vy = new Float32Array(N);
    const types = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      px[i] = Math.random() * W;
      py[i] = Math.random() * H;
      vx[i] = (Math.random() - 0.5) * 0.5;
      vy[i] = (Math.random() - 0.5) * 0.5;
      types[i] = Math.floor(Math.random() * TYPES);
    }
    const mat = [
      [0.0, 0.3, -0.1, 0.2, -0.2],
      [-0.2, 0.0, 0.3, -0.1, 0.2],
      [0.2, -0.2, 0.0, 0.3, -0.1],
      [-0.1, 0.2, -0.2, 0.0, 0.3],
      [0.3, -0.1, 0.2, -0.2, 0.0],
    ];
    const rMax = 120, beta = 0.3, friction = 0.6;

    let raf;
    const loop = () => {
      for (let i = 0; i < N; i++) {
        let fx = 0, fy = 0;
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          let dx = px[j] - px[i], dy = py[j] - py[i];
          if (dx > W/2) dx -= W; if (dx < -W/2) dx += W;
          if (dy > H/2) dy -= H; if (dy < -H/2) dy += H;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d > rMax || d < 0.5) continue;
          const r = d / rMax, nx = dx/d, ny = dy/d;
          let f;
          if (r < beta) f = r/beta - 1;
          else f = mat[types[i]][types[j]] * (1 - Math.abs(1+beta-2*r)/(1-beta));
          fx += f * nx; fy += f * ny;
        }
        vx[i] = vx[i] * friction + fx * 0.4;
        vy[i] = vy[i] * friction + fy * 0.4;
      }
      for (let i = 0; i < N; i++) {
        px[i] = ((px[i] + vx[i]) % W + W) % W;
        py[i] = ((py[i] + vy[i]) % H + H) % H;
      }

      ctx.fillStyle = "rgba(6,10,18,0.08)";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const c = colors[types[i]];
        const speed = Math.sqrt(vx[i]*vx[i] + vy[i]*vy[i]);
        const a = c[3] * Math.min(1, 0.3 + speed * 0.4);
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.12})`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], 8 + speed * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], 1.5 + speed * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#060a12", color: "#d4dae8",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Music control button */}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 200,
        background: "#0a0f1acc", backdropFilter: "blur(12px)",
        padding: "8px", borderRadius: 40, border: "1px solid #2a3456",
        cursor: "pointer", transition: "all 0.2s",
      }}
      onClick={toggleMusic}
      onMouseEnter={e => e.currentTarget.style.background = "#141e2ecc"}
      onMouseLeave={e => e.currentTarget.style.background = "#0a0f1acc"}
      >
        <div style={{
          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, color: musicPlaying ? "#4ecdc4" : "#8a9bba",
        }}>
          {musicPlaying ? "🎵" : "🔇"}
        </div>
      </div>

      {/* Hero section with canvas */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <canvas
          ref={heroCanvasRef}
          width={960}
          height={400}
          style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 960, height: 400, opacity: 0.6,
            maskImage: "radial-gradient(ellipse 80% 90% at 50% 50%, black 30%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 90% at 50% 50%, black 30%, transparent 70%)",
          }}
        />
        <div style={{ position: "relative", textAlign: "center", padding: "80px 20px 40px", maxWidth: 700, margin: "0 auto", zIndex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.35em", color: "#5a6b8a", fontFamily: "'JetBrains Mono', monospace", marginBottom: 20, textTransform: "uppercase" }}>
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
          <div style={{ fontSize: 14, color: "#8a9bba", marginTop: 16, lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>
            A multi-dimensional artificial life laboratory.<br />
            Five substrates. One garden. Infinite structures.
          </div>
          <div style={{ marginTop: 20, fontSize: 10, color: "#4a5b7a", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
            Ising · Lenia · Gray-Scott · Particle Life · Primordial Particles
          </div>
          <a
            href="https://github.com/Kquant03/genesis-phase-transition"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 24, padding: "10px 20px", borderRadius: 6,
              border: "1px solid #2a3456", background: "#0f1520",
              color: "#d4dae8", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500, textDecoration: "none", transition: "all 0.3s",
              cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ecdc466"; e.currentTarget.style.background = "#141e2e"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a3456"; e.currentTarget.style.background = "#0f1520"; }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            View on GitHub
          </a>
        </div>
      </div>

      {/* Simulation cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 14, maxWidth: 960, width: "100%", padding: "20px 20px 80px",
      }}>
        {SIMS.map(s => (
          <button
            key={s.id}
            onClick={() => handleSelectWithFade(s.id)}
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
            <div style={{ fontSize: 12, color: "#5a6b8a", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>
              {s.desc}
            </div>
            <div style={{
              marginTop: 14, fontSize: 9, color: s.color,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
              textTransform: "uppercase", opacity: hovered === s.id ? 1 : 0.4,
              transition: "opacity 0.3s",
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
