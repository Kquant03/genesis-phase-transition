import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════════════
// ◈  LENIA · EXPANDED UNIVERSE  ◈
// ════════════════════════════════════════════════════════════════════════════
// Multi-channel ecosystem · 4D Dihypersphaerome projection · Flow-field advection
// Cross-channel kernel coupling · Predator/prey ecology · Morphogenetic fields
// After Bert Wang-Chak Chan (2018, 2020) · "Lenia and Expanded Universe"
// ────────────────────────────────────────────────────────────────────────────
// CHANNELS:
//   Ch0 (red)   — Prey: orbium-like self-organizing gliders (μ=0.15, σ=0.017)
//   Ch1 (green) — Predator: feeds on red channel, slower (μ=0.26, σ=0.036)
//   Ch2 (blue)  — Morphogen: diffusive field that sculpts both channels
//   Ch3 (alpha) — 4D projection slice: Dihypersphaerome ventilans rotating in W-axis
//
// PIPELINE:
//   1. 4D rotation — animate 4D hyperplane slice, project into 2D
//   2. Multi-channel sim — each channel convolves its own kernel, cross-channel coupling
//   3. Flow advection — a velocity field derived from channel gradients advects state
//   4. Display — spectral palette driven by channel ratios + 4D contribution
//   5. Bloom → composite
// ════════════════════════════════════════════════════════════════════════════

const N = 256;
const DISPLAY = 560;
const BLOOM_SCALE = 4;
const KS = 51; // kernel texture size
const KC = 25; // kernel center

// ─── VERT (shared fullscreen quad) ───────────────────────────────────────────
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ─── MULTI-CHANNEL SIMULATION SHADER ─────────────────────────────────────────
// Each pixel = (ch0, ch1, ch2, ch3)
// Channels interact via cross-coupling terms and shared flow field
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_state;      // RGBA = ch0,ch1,ch2,ch3
uniform sampler2D u_kernel0;    // prey kernel
uniform sampler2D u_kernel1;    // predator kernel  
uniform sampler2D u_kernel2;    // morphogen kernel (wide)
uniform sampler2D u_flow;       // vec2 velocity field (rg=vx,vy)
uniform sampler2D u_hyperseed;  // 4D slice texture (single channel in r)

uniform float u_R0, u_R1, u_R2;
uniform float u_mu0, u_mu1, u_mu2;
uniform float u_sigma0, u_sigma1, u_sigma2;
uniform float u_dt;
uniform vec2  u_res;

// Cross-channel coupling strengths
uniform float u_c01;  // predator suppresses prey
uniform float u_c10;  // prey feeds predator
uniform float u_c20;  // morphogen modulates prey growth width
uniform float u_c21;  // morphogen modulates predator growth width
uniform float u_c02;  // prey secretes morphogen
uniform float u_c12;  // predator secretes morphogen

// Brush
uniform vec2  u_mouse;
uniform float u_brushSize, u_brushActive, u_brushErase, u_brushChan;

// 4D controls
uniform float u_hyperAmp;       // how much 4D slice bleeds into ch3
uniform float u_hyperMix;       // 4D mixing into ch0 (prey is seeded by 4D)
uniform float u_flowStr;        // advection strength
uniform float u_time;

float grow(float u, float mu, float sigma) {
  float d = u - mu;
  return 2.0 * exp(-(d*d) / (2.0*sigma*sigma)) - 1.0;
}

vec2 texel;

float conv(sampler2D kern, float R, vec2 uv) {
  int Ri = int(R);
  float pot = 0.0;
  for (int dy = -25; dy <= 25; dy++) {
    if (dy < -Ri || dy > Ri) continue;
    for (int dx = -25; dx <= 25; dx++) {
      if (dx < -Ri || dx > Ri) continue;
      vec2 kUV = (vec2(float(dx + ${KC}), float(dy + ${KC})) + 0.5) / ${KS}.0;
      float w = texture(kern, kUV).r;
      if (w < 1e-7) continue;
      vec2 sUV = fract(uv + vec2(float(dx), float(dy)) * texel);
      pot += texture(u_state, sUV).r * w;
    }
  }
  return pot;
}

float conv1(sampler2D kern, float R, vec2 uv) {
  int Ri = int(R);
  float pot = 0.0;
  for (int dy = -25; dy <= 25; dy++) {
    if (dy < -Ri || dy > Ri) continue;
    for (int dx = -25; dx <= 25; dx++) {
      if (dx < -Ri || dx > Ri) continue;
      vec2 kUV = (vec2(float(dx + ${KC}), float(dy + ${KC})) + 0.5) / ${KS}.0;
      float w = texture(kern, kUV).r;
      if (w < 1e-7) continue;
      vec2 sUV = fract(uv + vec2(float(dx), float(dy)) * texel);
      pot += texture(u_state, sUV).g * w;
    }
  }
  return pot;
}

float conv2(sampler2D kern, float R, vec2 uv) {
  int Ri = int(R);
  float pot = 0.0;
  for (int dy = -25; dy <= 25; dy++) {
    if (dy < -Ri || dy > Ri) continue;
    for (int dx = -25; dx <= 25; dx++) {
      if (dx < -Ri || dx > Ri) continue;
      vec2 kUV = (vec2(float(dx + ${KC}), float(dy + ${KC})) + 0.5) / ${KS}.0;
      float w = texture(kern, kUV).r;
      if (w < 1e-7) continue;
      vec2 sUV = fract(uv + vec2(float(dx), float(dy)) * texel);
      pot += texture(u_state, sUV).b * w;
    }
  }
  return pot;
}

void main() {
  texel = 1.0 / u_res;

  // ── Flow advection: sample state from where flow carries us FROM ──
  vec2 vel = (texture(u_flow, v_uv).rg - 0.5) * 2.0;
  vec2 advUV = fract(v_uv - vel * texel * u_flowStr);

  vec4 prev = texture(u_state, advUV);
  float a0 = prev.r; // prey
  float a1 = prev.g; // predator
  float a2 = prev.b; // morphogen
  float a3 = prev.a; // 4D

  // ── Convolutions ──
  float pot0 = conv(u_kernel0, u_R0, advUV);
  float pot1 = conv1(u_kernel1, u_R1, advUV);
  float pot2 = conv2(u_kernel2, u_R2, advUV);

  // ── Morphogen-modulated sigma ──
  float sig0eff = u_sigma0 * (1.0 + u_c20 * (a2 - 0.3));
  float sig1eff = u_sigma1 * (1.0 + u_c21 * (a2 - 0.3));
  sig0eff = clamp(sig0eff, 0.005, 0.06);
  sig1eff = clamp(sig1eff, 0.005, 0.06);

  // ── Growth functions with cross-coupling ──
  // ch0 prey: normal growth, suppressed by predator
  float g0 = grow(pot0, u_mu0, sig0eff) - u_c01 * a1 * 0.8;

  // ch1 predator: grows only where prey present, decays without
  float g1 = grow(pot1, u_mu1, sig1eff) + u_c10 * a0 * 1.2 - 0.012;

  // ch2 morphogen: diffuses, secreted by prey and predator
  float g2 = grow(pot2, u_mu2, u_sigma2) + u_c02 * a0 + u_c12 * a1 - 0.018;

  // ── 4D channel: just read current hyperseed slice, slowly decay ──
  float hyperSlice = texture(u_hyperseed, v_uv).r;
  float g3 = (hyperSlice * u_hyperAmp - a3) * 0.08;

  // ── 4D bleeds into prey channel (Dihypersphaerome seeds the ecosystem) ──
  g0 += a3 * u_hyperMix * 0.4;

  // ── Update ──
  float n0 = clamp(a0 + u_dt * g0, 0.0, 1.0);
  float n1 = clamp(a1 + u_dt * g1, 0.0, 1.0);
  float n2 = clamp(a2 + u_dt * g2, 0.0, 1.0);
  float n3 = clamp(a3 + u_dt * g3, 0.0, 1.0);

  // ── Brush painting ──
  if (u_brushActive > 0.5) {
    vec2 delta = v_uv - u_mouse;
    delta -= round(delta);
    float dist = length(delta * u_res);
    if (dist < u_brushSize) {
      float b = pow(1.0 - dist / u_brushSize, 2.0);
      float amt = u_brushErase > 0.5 ? -b * 0.6 : b * 0.45;
      int ch = int(u_brushChan);
      if (ch == 0) n0 = clamp(n0 + amt, 0.0, 1.0);
      else if (ch == 1) n1 = clamp(n1 + amt, 0.0, 1.0);
      else if (ch == 2) n2 = clamp(n2 + amt, 0.0, 1.0);
      else { n0 = clamp(n0 + amt * 0.5, 0.0, 1.0); n1 = clamp(n1 + amt * 0.3, 0.0, 1.0); }
    }
  }

  outColor = vec4(n0, n1, n2, n3);
}`;

// ─── FLOW FIELD SHADER ────────────────────────────────────────────────────────
// Derives velocity field from channel gradients: prey flows "uphill" in morphogen,
// predator flows toward prey gradient. Produces advection velocity texture.
const FLOW_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2 u_res;
uniform float u_time;
uniform float u_flowMode; // 0=gradient, 1=curl, 2=spiral

void main() {
  vec2 texel = 1.0 / u_res;

  // Sample gradients of prey (ch0) and morphogen (ch2)
  float c  = texture(u_state, v_uv).r;
  float m  = texture(u_state, v_uv).b;
  float px = texture(u_state, fract(v_uv + vec2(texel.x, 0.0))).r;
  float nx = texture(u_state, fract(v_uv - vec2(texel.x, 0.0))).r;
  float py = texture(u_state, fract(v_uv + vec2(0.0, texel.y))).r;
  float ny = texture(u_state, fract(v_uv - vec2(0.0, texel.y))).r;
  float mx = texture(u_state, fract(v_uv + vec2(texel.x, 0.0))).b;
  float wx = texture(u_state, fract(v_uv - vec2(texel.x, 0.0))).b;
  float my = texture(u_state, fract(v_uv + vec2(0.0, texel.y))).b;
  float wy = texture(u_state, fract(v_uv - vec2(0.0, texel.y))).b;

  vec2 gradPrey = vec2(px - nx, py - ny) * 0.5;
  vec2 gradMorph = vec2(mx - wx, my - wy) * 0.5;

  vec2 vel = vec2(0.0);

  if (u_flowMode < 0.5) {
    // Gradient: prey flows along morphogen gradient
    vel = gradMorph * 3.0 + vec2(-gradPrey.y, gradPrey.x) * 1.5;
  } else if (u_flowMode < 1.5) {
    // Curl: rotational flow derived from prey
    vel = vec2(-gradPrey.y, gradPrey.x) * 4.0;
  } else {
    // Spiral: combined rotation + gradient
    vec2 centered = v_uv - 0.5;
    float angle = atan(centered.y, centered.x) + u_time * 0.3;
    float r = length(centered);
    vel = vec2(cos(angle), sin(angle)) * r * 2.0 + gradMorph * 2.0;
  }

  // Pack into [0,1] range (0.5 = zero velocity)
  outColor = vec4(vel * 0.15 + 0.5, 0.5, 1.0);
}`;

// ─── 4D PROJECTION SHADER ────────────────────────────────────────────────────
// Rotates a 4D hypersphere in XW plane and YW plane, samples a 2D cross-section.
// The Dihypersphaerome ventilans lives here — we animate its W-axis rotation
// to produce the ventilating oscillation behavior as a 2D shadow.
const HYPER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform float u_wSlice;     // W coordinate of the cutting hyperplane
uniform float u_rotXW;      // XW rotation angle
uniform float u_rotYW;      // YW rotation angle  
uniform float u_rotZW;      // ZW rotation angle (the breathing rotation)
uniform float u_R4D;        // 4D kernel radius
uniform float u_mu4D;
uniform float u_sigma4D;
uniform sampler2D u_prev4D; // previous 4D state for iterative simulation

// Dihypersphaerome ventilans parameters from Bert Chan's animals4D.json:
// R=10, T=10, b=[1/12,1/6,1], mu=0.18, sigma=0.033
// We simulate this with analytical approximation of the 4D kernel

float kernelCore4D(float r) {
  if (r <= 0.0 || r >= 1.0) return 0.0;
  return exp(4.0 - 4.0 / (4.0 * r * (1.0 - r)));
}

// 4D kernel with 3 shells: beta=[1/12, 1/6, 1]
float kernel4D(float r) {
  float B = 3.0;
  float ri = floor(r * B);
  float lr = r * B - ri;
  float peak;
  if (ri < 0.5) peak = 1.0/12.0;
  else if (ri < 1.5) peak = 1.0/6.0;
  else peak = 1.0;
  return peak * kernelCore4D(lr);
}

// Rotate a 4D point in XW plane
vec4 rotXW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(c*p.x - s*p.w, p.y, p.z, s*p.x + c*p.w);
}
vec4 rotYW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(p.x, c*p.y - s*p.w, p.z, s*p.y + c*p.w);
}
vec4 rotZW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(p.x, p.y, c*p.z - s*p.w, s*p.z + c*p.w);
}

// Sample the 4D Dihypersphaerome at a given 4D position.
// We approximate the organism as a hyperspherical shell structure
// matching its β=[1/12,1/6,1] kernel topology.
float sampleDV(vec4 pos4D) {
  float r = length(pos4D) / u_R4D;
  if (r >= 1.0) return 0.0;

  // The organism's density is ring-structured matching the β peaks
  // Outermost ring (r ≈ 0.85) is dominant (β=1)
  // Middle ring (r ≈ 0.55) is secondary (β=1/6)
  // Inner ring (r ≈ 0.2) is faint (β=1/12)
  float ring3 = exp(-pow((r - 0.85) / 0.08, 2.0)) * 1.0;
  float ring2 = exp(-pow((r - 0.55) / 0.10, 2.0)) * (1.0/6.0);
  float ring1 = exp(-pow((r - 0.20) / 0.12, 2.0)) * (1.0/12.0);

  return clamp(ring3 + ring2 + ring1, 0.0, 1.0);
}

void main() {
  // Map UV to centered 2D coordinates
  vec2 xy = (v_uv - 0.5) * 2.2;

  // The 4D point we're sampling: (x, y, z=0, w=wSlice)
  // We treat this as a 3D slice at z=0 of a 4D object
  vec4 p4 = vec4(xy.x, xy.y, 0.0, u_wSlice);

  // Apply 4D rotations (this is the "breathing" of the Dihypersphaerome)
  p4 = rotXW(p4, u_rotXW);
  p4 = rotYW(p4, u_rotYW);
  p4 = rotZW(p4, u_rotZW);

  // Sample the organism density at this rotated position
  float density = sampleDV(p4);

  // The ventilating behavior: the W-rotation makes the 2D cross-section
  // pulse in and out — that IS the ventilans oscillation.
  // We also add a slow phase-shift from the ZW rotation.
  float phase = sin(u_time * 0.8 + length(xy) * 2.5) * 0.5 + 0.5;
  density *= 0.7 + 0.3 * phase;

  outColor = vec4(density, density, density, 1.0);
}`;

// ─── DISPLAY SHADER ───────────────────────────────────────────────────────────
// Multi-channel rendering with ecosystem coloring:
// Prey (ch0) → warm orange-gold
// Predator (ch1) → electric cyan-violet  
// Morphogen (ch2) → subtle blue-green field tint
// 4D (ch3) → ghostly white-violet overlay
// Their interaction creates the full palette.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform sampler2D u_flow;
uniform int u_viewMode;
uniform float u_time;
uniform float u_trailMix;
uniform int u_palette;

vec3 spectrum(float t) {
  return clamp(vec3(0.5) + vec3(0.5)*cos(6.28318*(vec3(1.0)*t+vec3(0.0,0.33,0.67))),0.0,1.0);
}

vec3 hsv(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h)+K.xyz)*6.0-K.www);
  return v * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), s);
}

void main() {
  vec4 s = texture(u_state, v_uv);
  float a0 = s.r; // prey
  float a1 = s.g; // predator
  float a2 = s.b; // morphogen
  float a3 = s.a; // 4D hypersphere

  vec3 col = vec3(0.003, 0.005, 0.012); // deep void

  if (u_viewMode == 0) {
    // ── Ecosystem view ──

    // Morphogen field: subtle deep-teal tint to the void
    col += vec3(0.0, 0.02, 0.03) * a2 * 3.0;

    // Prey: warm gold-orange cores, amber edges
    float preyDense = smoothstep(0.05, 0.7, a0);
    vec3 preyEdge = vec3(0.55, 0.28, 0.02);
    vec3 preyCore = vec3(1.0, 0.72, 0.06);
    vec3 preyHot  = vec3(1.0, 0.95, 0.75);
    col += mix(preyEdge, preyCore, preyDense*preyDense) * a0 * 2.5;
    col += preyHot * smoothstep(0.62, 0.92, a0) * 2.2;

    // Predator: electric violet-cyan, cold cores
    float predDense = smoothstep(0.05, 0.65, a1);
    vec3 predEdge = vec3(0.08, 0.22, 0.55);
    vec3 predCore = vec3(0.28, 0.85, 0.98);
    vec3 predHot  = vec3(0.85, 0.98, 1.0);
    col += mix(predEdge, predCore, predDense*predDense) * a1 * 2.8;
    col += predHot * smoothstep(0.6, 0.9, a1) * 1.8;

    // Predation zone: where both overlap, vivid green flash
    float overlap = a0 * a1;
    col += vec3(0.2, 1.0, 0.35) * overlap * 6.0;
    col += vec3(1.0, 1.0, 0.5) * smoothstep(0.15, 0.5, overlap) * 3.0;

    // 4D hypersphere overlay: ghostly violet wisps
    col += vec3(0.55, 0.25, 0.85) * a3 * 1.8;
    col += vec3(0.85, 0.75, 1.0) * smoothstep(0.5, 0.85, a3) * 1.2;

    // Edge iridescence driven by combined potential field
    float edge0 = smoothstep(0.03, 0.12, a0) * smoothstep(0.45, 0.12, a0);
    float edge1 = smoothstep(0.03, 0.12, a1) * smoothstep(0.45, 0.12, a1);
    float phase = (a0*3.1 + a1*2.3 + a2*1.7 + u_time*0.4);
    col += spectrum(phase * 0.12) * (edge0 + edge1) * 0.6;

  } else if (u_viewMode == 1) {
    // ── Channel isolation: prey only ──
    col = mix(vec3(0.01,0.04,0.02), vec3(1.0,0.7,0.05), a0*a0);
    col += vec3(1.0,0.95,0.7) * smoothstep(0.7,0.95,a0);

  } else if (u_viewMode == 2) {
    // ── Channel isolation: predator only ──
    col = mix(vec3(0.01,0.02,0.06), vec3(0.2,0.85,1.0), a1*a1);
    col += vec3(0.9,1.0,1.0) * smoothstep(0.7,0.95,a1);

  } else if (u_viewMode == 3) {
    // ── 4D projection view ──
    col = vec3(0.0, 0.0, 0.01);
    col += vec3(0.4, 0.2, 0.8) * a3 * 2.5;
    col += vec3(0.8, 0.7, 1.0) * smoothstep(0.45, 0.85, a3) * 2.0;
    col += vec3(1.0, 0.98, 1.0) * smoothstep(0.75, 0.98, a3) * 1.5;
    // Iridescent edge
    float edge3 = smoothstep(0.04, 0.18, a3) * smoothstep(0.7, 0.18, a3);
    col += spectrum(a3 * 4.0 + u_time * 0.3) * edge3 * 1.2;

  } else if (u_viewMode == 4) {
    // ── Flow field view ──
    vec2 vel = (texture(u_flow, v_uv).rg - 0.5) * 2.0;
    float speed = length(vel);
    float angle = atan(vel.y, vel.x) / 6.28318 + 0.5;
    col = hsv(angle, 0.9, smoothstep(0.0, 0.3, speed) * 0.9);
    col *= 0.6 + a0 * 0.4 + a1 * 0.4;

  } else {
    // ── Morphogen field ──
    col = mix(vec3(0.0,0.01,0.03), vec3(0.1,0.6,0.45), a2*a2*2.0);
    col += vec3(0.5,1.0,0.8) * smoothstep(0.6,0.9,a2);
  }

  outColor = vec4(col, 1.0);
}`;

// ─── BLOOM SHADER ────────────────────────────────────────────────────────────
const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_dir, u_res;
uniform float u_extract;
void main() {
  vec2 texel = 1.0 / u_res;
  float w[5] = float[5](0.227027,0.1945946,0.1216216,0.054054,0.016216);
  vec3 result = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    vec3 s = texture(u_input, v_uv + u_dir * texel * float(i) * 1.5).rgb;
    if (u_extract > 0.5) { float br = dot(s, vec3(0.2126,0.7152,0.0722)); s *= smoothstep(0.06,0.4,br)*2.0; }
    result += s * w[abs(i)];
  }
  outColor = vec4(result, 1.0);
}`;

// ─── COMPOSITE ───────────────────────────────────────────────────────────────
const COMP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_display, u_bloom;
uniform float u_bloomStr, u_vignette;
void main() {
  vec3 col = texture(u_display, v_uv).rgb;
  col += texture(u_bloom, v_uv).rgb * u_bloomStr;
  col = col / (1.0 + col * 0.38);
  vec2 c = v_uv - 0.5;
  col *= 1.0 - dot(c,c) * u_vignette;
  col = pow(col, vec3(0.92));
  outColor = vec4(col, 1.0);
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// WebGL Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function makeProgram(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p)); return null;
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u };
}

function makeTex(gl, w, h, iF, fmt, type, filter, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, iF, w, h, 0, fmt, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

function makeFB(gl, tex) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Kernel Builder — supports multi-peak β-vectors
// ═══════════════════════════════════════════════════════════════════════════════

function kcore(r) {
  if (r <= 0 || r >= 1) return 0;
  return Math.exp(4 - 4 / (4 * r * (1 - r)));
}

function buildKernel(R, peaks) {
  const data = new Float32Array(KS * KS * 4);
  let sum = 0;
  const B = peaks.length;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const r = Math.sqrt(dx * dx + dy * dy) / R;
      if (r >= 1 || r <= 0) continue;
      const ri = Math.min(Math.floor(r * B), B - 1);
      const k = peaks[ri] * kcore(r * B - ri);
      data[((KC + dy) * KS + (KC + dx)) * 4] = k;
      sum += k;
    }
  }
  if (sum > 0) for (let i = 0; i < KS * KS; i++) data[i * 4] /= sum;
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RLE Decoder (from original Lenia.jsx)
// ═══════════════════════════════════════════════════════════════════════════════

function decodeRLE(str) {
  const rows = str.replace(/!$/, '').split('$');
  const grid = [];
  let maxVal = 0, maxW = 0;
  for (const row of rows) {
    const cells = [];
    let i = 0;
    while (i < row.length) {
      let count = 0;
      while (i < row.length && row[i] >= '0' && row[i] <= '9') { count = count * 10 + row.charCodeAt(i) - 48; i++; }
      if (!count) count = 1;
      if (i >= row.length) break;
      let val = 0;
      if (row[i] === '.') { i++; }
      else if (row[i] >= 'p' && row[i] <= 'y') {
        val = (row.charCodeAt(i) - 111) * 26; i++;
        if (i < row.length && row[i] >= 'A' && row[i] <= 'Z') { val += row.charCodeAt(i) - 64; i++; }
      } else if (row[i] >= 'A' && row[i] <= 'Z') { val = row.charCodeAt(i) - 64; i++; }
      else { i++; continue; }
      for (let j = 0; j < count; j++) cells.push(val);
      if (val > maxVal) maxVal = val;
    }
    grid.push(cells);
    if (cells.length > maxW) maxW = cells.length;
  }
  for (const r of grid) while (r.length < maxW) r.push(0);
  if (maxVal > 0) for (const r of grid) for (let j = 0; j < r.length; j++) r[j] /= maxVal;
  return grid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Species seeds
// ═══════════════════════════════════════════════════════════════════════════════

const ORBIUM_RLE = "7.MD6.qL$6.pKqEqFURpApBRAqQ$5.VqTrSsBrOpXpWpTpWpUpCrQ$4.CQrQsTsWsApITNPpGqGvL$3.IpIpWrOsGsBqXpJ4.LsFrL$A.DpKpSpJpDqOqUqSqE5.ExD$qL.pBpTT2.qCrGrVrWqM5.sTpP$.pGpWpD3.qUsMtItQtJ6.tL$.uFqGH3.pXtOuR2vFsK5.sM$.tUqL4.GuNwAwVxBwNpC4.qXpA$2.uH5.vBxGyEyMyHtW4.qIpL$2.wV5.tIyG3yOxQqW2.FqHpJ$2.tUS4.rM2yOyJyOyHtVpPMpFqNV$2.HsR4.pUxAyOxLxDxEuVrMqBqGqKJ$3.sLpE3.pEuNxHwRwGvUuLsHrCqTpR$3.TrMS2.pFsLvDvPvEuPtNsGrGqIP$4.pRqRpNpFpTrNtGtVtStGsMrNqNpF$5.pMqKqLqRrIsCsLsIrTrFqJpHE$6.RpSqJqPqVqWqRqKpRXE$8.OpBpIpJpFTK!";
const IGNIS_RLE = "10.IPQMF$8.pKpRpSpTpWpUpQpBM$6.XqGV2DSpSqNqQqKpPSB$5.qBpX5.pOrHrSrMqSpTS$4.qCpQ6.rAtAtDsPrSqTpRP$4.rD6.pUuDuQtWtLsPrNqMpHA$3.uG7.uGwQvCuFuAtFrSqQpTN$2.vAL6.rKyFxLvIvBuTsXqWqFqAU$.tXqB7.wGyOyLxHwVuPqWpEpCpTpA$rDMpO6.sOxFyL2yOwDqR2.EpJpD$.WpH5.pIvNwSxQxXvEpD4.pFW$.pApM5.tUvCvUwEsI6.pOM$.TpPU3.sHtOuJuQqC7.qH$.HpJpPXIrKsFsStBpV7.pApH$2.MpGpMsStHsSrXqU8.rP$3.GrJtPuHtHrD8.sH$3.GrOsXtLsSU7.sC$4.pPrQrJpHpOQ5.qXT$5.pK.JpHpOWOQpMqHqG$8.KpEpMpQpLVqU$13.qD$12.pB!";

function scaleSeed(cells, fromR, toR) {
  if (fromR === toR) return cells;
  const sc = toR / fromR;
  const oh = cells.length, ow = cells[0].length;
  const nh = Math.round(oh * sc), nw = Math.round(ow * sc);
  const out = [];
  for (let y = 0; y < nh; y++) {
    const row = [];
    for (let x = 0; x < nw; x++) {
      const sy = y / sc, sx = x / sc;
      const y0 = Math.floor(sy), x0 = Math.floor(sx);
      const y1 = Math.min(y0+1, oh-1), x1 = Math.min(x0+1, ow-1);
      const fy = sy-y0, fx = sx-x0;
      row.push(cells[y0][x0]*(1-fx)*(1-fy)+cells[y0][x1]*fx*(1-fy)+cells[y1][x0]*(1-fx)*fy+cells[y1][x1]*fx*fy);
    }
    out.push(row);
  }
  return out;
}

function placeSeed(data, seed, cx, cy, channel) {
  // channel: 0=r,1=g,2=b,3=a
  const h = seed.length, w = seed[0].length;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = ((cx - Math.floor(w/2) + x) % N + N) % N;
      const gy = ((cy - Math.floor(h/2) + y) % N + N) % N;
      const idx = (gy * N + gx) * 4 + channel;
      data[idx] = Math.max(data[idx], seed[y][x]);
    }
}

function buildEcosystem(presetName) {
  const data = new Float32Array(N * N * 4);

  const preySeed  = scaleSeed(decodeRLE(ORBIUM_RLE), 13, 13);
  const predSeed  = scaleSeed(decodeRLE(IGNIS_RLE),  13, 15);

  if (presetName === 'duel') {
    // Two prey, one predator — classic predation
    placeSeed(data, preySeed,  80,  80, 0);
    placeSeed(data, preySeed, 180, 150, 0);
    placeSeed(data, preySeed, 120, 190, 0);
    placeSeed(data, predSeed, 130, 120, 1);

  } else if (presetName === 'swarm') {
    // Many prey, scattered predators
    const minD = 50;
    const preyPts = [], predPts = [];
    let att = 0;
    while (preyPts.length < 8 && att < 300) {
      const cx = 30 + Math.floor(Math.random() * (N - 60));
      const cy = 30 + Math.floor(Math.random() * (N - 60));
      if (preyPts.every(([px,py]) => Math.hypot(cx-px,cy-py) > minD)) preyPts.push([cx,cy]);
      att++;
    }
    att = 0;
    while (predPts.length < 3 && att < 200) {
      const cx = 30 + Math.floor(Math.random() * (N - 60));
      const cy = 30 + Math.floor(Math.random() * (N - 60));
      if ([...preyPts,...predPts].every(([px,py]) => Math.hypot(cx-px,cy-py) > minD)) predPts.push([cx,cy]);
      att++;
    }
    for (const [cx,cy] of preyPts) placeSeed(data, preySeed, cx, cy, 0);
    for (const [cx,cy] of predPts) placeSeed(data, predSeed, cx, cy, 1);

  } else if (presetName === 'coexist') {
    // Separated ecosystems — watch if they meet
    for (let i = 0; i < 4; i++) placeSeed(data, preySeed, 50 + i*50, 80, 0);
    for (let i = 0; i < 2; i++) placeSeed(data, predSeed, 90 + i*80, 180, 1);

  } else if (presetName === 'invasion') {
    // Prey fills left half, predator invades from right
    for (let i = 0; i < 5; i++) placeSeed(data, preySeed, 30 + i*35, 80 + (i%2)*80, 0);
    for (let i = 0; i < 5; i++) placeSeed(data, preySeed, 40 + i*30, 160 + (i%3)*30, 0);
    placeSeed(data, predSeed, 210, 128, 1);
    placeSeed(data, predSeed, 230, 90, 1);

  } else if (presetName === 'hyperseed') {
    // Only the 4D channel seeds — let ventilans bleed into ecosystem
    // Prey and predator emerge FROM the 4D organism
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const nx = (x / N - 0.5) * 2.2;
        const ny = (y / N - 0.5) * 2.2;
        const r = Math.sqrt(nx*nx + ny*ny);
        // Ring structure of DV
        const ring = Math.exp(-(((r-0.85)/0.08)**2)) + Math.exp(-(((r-0.55)/0.10)**2))/6;
        data[(y*N+x)*4+3] = ring;
      }

  } else {
    // Default: single pair, balanced
    placeSeed(data, preySeed, 100, 100, 0);
    placeSeed(data, preySeed, 160, 160, 0);
    placeSeed(data, predSeed, 140, 110, 1);
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Presets
// ═══════════════════════════════════════════════════════════════════════════════

const PRESETS = {
  duel:       { name: "Duel",       desc: "3 prey vs 1 predator — will they survive?",              ecosystem: 'duel' },
  swarm:      { name: "Swarm",      desc: "8 prey vs 3 predators — emergent arms race",             ecosystem: 'swarm' },
  coexist:    { name: "Coexist",    desc: "Separated factions — watch what happens at contact",     ecosystem: 'coexist' },
  invasion:   { name: "Invasion",   desc: "Predator invades established prey colony",               ecosystem: 'invasion' },
  hyperseed:  { name: "DV Seed",    desc: "Dihypersphaerome ventilans bleeds into 3D — ecosystem from 4D",  ecosystem: 'hyperseed' },
};

const VIEW_MODES = ["Ecosystem", "Prey only", "Predator only", "4D Projection", "Flow Field", "Morphogen"];
const FLOW_MODES = ["Gradient", "Curl", "Spiral"];

// ═══════════════════════════════════════════════════════════════════════════════
// Slider
// ═══════════════════════════════════════════════════════════════════════════════

function Slider({ label, value, onChange, min, max, step, color = "#f59e0b", desc }) {
  const fmt = v => v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(1) : Math.round(v);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, outline: "none", cursor: "pointer" }} />
      {desc && <div style={{ fontSize: 7, color: "#3a4b6a", marginTop: 1, fontFamily: "var(--mono)" }}>{desc}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function LeniaExpanded() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const gpuRef = useRef(null);
  const animRef = useRef(null);
  const paramsRef = useRef(null);
  const mouseRef = useRef({ active: false, erase: false, x: 0, y: 0 });
  const swapRef = useRef(0);
  const timeRef = useRef(0);
  const frameRef = useRef(0);

  // Simulation params
  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("duel");
  const [spf, setSpf] = useState(2);
  const [dt, setDt] = useState(0.12);

  // Channel params
  const [mu0, setMu0] = useState(0.15);   const [sig0, setSig0] = useState(0.017);
  const [mu1, setMu1] = useState(0.26);   const [sig1, setSig1] = useState(0.036);
  const [mu2, setMu2] = useState(0.15);   const [sig2, setSig2] = useState(0.028);
  const [R0, setR0] = useState(13);
  const [R1, setR1] = useState(15);
  const [R2, setR2] = useState(20);

  // Cross-coupling
  const [c01, setC01] = useState(0.35);   // predator→prey suppression
  const [c10, setC10] = useState(0.40);   // prey→predator feeding
  const [c20, setC20] = useState(0.20);   // morphogen→prey sigma mod
  const [c02, setC02] = useState(0.08);   // prey→morphogen secretion
  const [c12, setC12] = useState(0.04);   // predator→morphogen secretion

  // 4D controls
  const [rotSpeed, setRotSpeed] = useState(0.18);   // ZW rotation speed
  const [rotXWSpeed, setRotXWSpeed] = useState(0.05);
  const [rotYWSpeed, setRotYWSpeed] = useState(0.07);
  const [wSlice, setWSlice] = useState(0.0);
  const [hyperAmp, setHyperAmp] = useState(0.65);
  const [hyperMix, setHyperMix] = useState(0.12);

  // Flow field
  const [flowStr, setFlowStr] = useState(1.2);
  const [flowMode, setFlowMode] = useState(0);
  const [flowEnabled, setFlowEnabled] = useState(true);

  // Display
  const [viewMode, setViewMode] = useState(0);
  const [bloom, setBloom] = useState(true);
  const [bloomStr, setBloomStr] = useState(0.55);
  const [brushSize, setBrushSize] = useState(8);
  const [brushChan, setBrushChan] = useState(0);

  // Stats
  const [fps, setFps] = useState(0);
  const [mass0, setMass0] = useState(0);
  const [mass1, setMass1] = useState(0);
  const [glError, setGlError] = useState(null);

  // 4D rotation angles (accumulated)
  const rotRef = useRef({ xw: 0, yw: 0, zw: 0 });

  paramsRef.current = {
    spf, dt, mu0, sig0, mu1, sig1, mu2, sig2,
    R0, R1, R2, c01, c10, c20, c02, c12,
    rotSpeed, rotXWSpeed, rotYWSpeed, wSlice, hyperAmp, hyperMix,
    flowStr: flowEnabled ? flowStr : 0,
    flowMode, viewMode, bloom, bloomStr,
  };

  // ── WebGL Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = DISPLAY; canvas.height = DISPLAY;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) { setGlError("WebGL2 not available"); return; }
    if (!gl.getExtension("EXT_color_buffer_float")) { setGlError("Float textures not available"); return; }
    gl.getExtension("OES_texture_float_linear");
    glRef.current = gl;

    const simProg   = makeProgram(gl, VERT, SIM_FRAG);
    const flowProg  = makeProgram(gl, VERT, FLOW_FRAG);
    const hyperProg = makeProgram(gl, VERT, HYPER_FRAG);
    const dispProg  = makeProgram(gl, VERT, DISPLAY_FRAG);
    const bloomProg = makeProgram(gl, VERT, BLOOM_FRAG);
    const compProg  = makeProgram(gl, VERT, COMP_FRAG);

    if (!simProg||!flowProg||!hyperProg||!dispProg||!bloomProg||!compProg) {
      setGlError("Shader compilation failed — check console"); return;
    }

    // VAO + fullscreen quad
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    for (const prog of [simProg, flowProg, hyperProg, dispProg, bloomProg, compProg]) {
      const loc = gl.getAttribLocation(prog.program, "a_pos");
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    }

    // State textures (RGBA = ch0,ch1,ch2,ch3) — ping pong
    const F = gl.RGBA32F, RF = gl.RGBA, FL = gl.FLOAT;
    const stateTex = [makeTex(gl, N, N, F, RF, FL, gl.NEAREST, null), makeTex(gl, N, N, F, RF, FL, gl.NEAREST, null)];
    const stateFB  = [makeFB(gl, stateTex[0]), makeFB(gl, stateTex[1])];

    // Flow field texture (rg = velocity)
    const flowTex = [makeTex(gl, N, N, F, RF, FL, gl.LINEAR, null), makeTex(gl, N, N, F, RF, FL, gl.LINEAR, null)];
    const flowFB  = [makeFB(gl, flowTex[0]), makeFB(gl, flowTex[1])];

    // 4D hyperslice texture (single frame, updated each tick)
    const hyperTex = [makeTex(gl, N, N, F, RF, FL, gl.LINEAR, null), makeTex(gl, N, N, F, RF, FL, gl.LINEAR, null)];
    const hyperFB  = [makeFB(gl, hyperTex[0]), makeFB(gl, hyperTex[1])];

    // Kernel textures for 3 channels
    const kernelTex0 = makeTex(gl, KS, KS, F, RF, FL, gl.NEAREST, null);
    const kernelTex1 = makeTex(gl, KS, KS, F, RF, FL, gl.NEAREST, null);
    const kernelTex2 = makeTex(gl, KS, KS, F, RF, FL, gl.NEAREST, null);

    // Upload initial kernels
    const uploadKernel = (tex, R, peaks) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, KS, KS, RF, FL, buildKernel(R, peaks));
    };
    uploadKernel(kernelTex0, 13, [1]);                  // prey: single peak
    uploadKernel(kernelTex1, 15, [1/3, 2/3, 1]);        // predator: multi-peak (ignis-like)
    uploadKernel(kernelTex2, 20, [1, 0.5, 0.1]);        // morphogen: wide diffuse

    // Display + bloom
    const dispTex = makeTex(gl, N, N, gl.RGBA8, RF, gl.UNSIGNED_BYTE, gl.LINEAR, null);
    const dispFB  = makeFB(gl, dispTex);
    const bN = Math.floor(N / BLOOM_SCALE);
    const bloomTex = [makeTex(gl, bN, bN, gl.RGBA8, RF, gl.UNSIGNED_BYTE, gl.LINEAR, null),
                      makeTex(gl, bN, bN, gl.RGBA8, RF, gl.UNSIGNED_BYTE, gl.LINEAR, null)];
    const bloomFB  = [makeFB(gl, bloomTex[0]), makeFB(gl, bloomTex[1])];

    // Upload initial state
    const init = buildEcosystem('duel');
    gl.bindTexture(gl.TEXTURE_2D, stateTex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, RF, FL, init);

    const readBuf = new Float32Array(N * N * 4);

    gpuRef.current = {
      simProg, flowProg, hyperProg, dispProg, bloomProg, compProg,
      vao, vbo, stateTex, stateFB, flowTex, flowFB, hyperTex, hyperFB,
      kernelTex0, kernelTex1, kernelTex2,
      dispTex, dispFB, bloomTex, bloomFB, bN, readBuf,
      uploadKernel,
    };
    swapRef.current = 0;
    timeRef.current = 0;
    frameRef.current = 0;

    return () => {
      [stateTex,flowTex,hyperTex,bloomTex].flat().forEach(t => gl.deleteTexture(t));
      [kernelTex0,kernelTex1,kernelTex2,dispTex].forEach(t => gl.deleteTexture(t));
      [stateFB,flowFB,hyperFB,bloomFB].flat().forEach(f => gl.deleteFramebuffer(f));
      gl.deleteFramebuffer(dispFB);
      [simProg,flowProg,hyperProg,dispProg,bloomProg,compProg].forEach(p => gl.deleteProgram(p.program));
      gl.deleteBuffer(vbo); gl.deleteVertexArray(vao);
      gpuRef.current = null; glRef.current = null;
    };
  }, []);

  // ── Kernel reupload on R changes ──────────────────────────────────────────
  useEffect(() => {
    const gpu = gpuRef.current, gl = glRef.current;
    if (!gpu || !gl) return;
    gpu.uploadKernel(gpu.kernelTex0, R0, [1]);
  }, [R0]);

  useEffect(() => {
    const gpu = gpuRef.current, gl = glRef.current;
    if (!gpu || !gl) return;
    gpu.uploadKernel(gpu.kernelTex1, R1, [1/3, 2/3, 1]);
  }, [R1]);

  useEffect(() => {
    const gpu = gpuRef.current, gl = glRef.current;
    if (!gpu || !gl) return;
    gpu.uploadKernel(gpu.kernelTex2, R2, [1, 0.5, 0.1]);
  }, [R2]);

  // ── Load preset ────────────────────────────────────────────────────────────
  const loadPreset = useCallback((id) => {
    const gl = glRef.current, gpu = gpuRef.current;
    if (!gl || !gpu) return;
    const data = buildEcosystem(PRESETS[id].ecosystem);
    gl.bindTexture(gl.TEXTURE_2D, gpu.stateTex[swapRef.current]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, data);
    setPreset(id);
    timeRef.current = 0; frameRef.current = 0;
    rotRef.current = { xw: 0, yw: 0, zw: 0 };
  }, []);

  // ── Mouse ──────────────────────────────────────────────────────────────────
  const handleMouse = useCallback((e, active) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      active,
      erase: e.button === 2 || e.shiftKey,
      x: (e.clientX - rect.left) / rect.width,
      y: 1.0 - (e.clientY - rect.top) / rect.height,
    };
  }, []);

  // ── Animation Loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    let active = true;
    let lastT = performance.now(), fpsAcc = 0, fpsF = 0;

    const loop = (now) => {
      if (!active) return;
      const gl = glRef.current, gpu = gpuRef.current;
      if (!gl || !gpu) { animRef.current = requestAnimationFrame(loop); return; }

      const p = paramsRef.current;
      const { simProg, flowProg, hyperProg, dispProg, bloomProg, compProg,
              vao, stateTex, stateFB, flowTex, flowFB, hyperTex, hyperFB,
              kernelTex0, kernelTex1, kernelTex2,
              dispTex, dispFB, bloomTex, bloomFB, bN, readBuf } = gpu;

      gl.bindVertexArray(vao);
      timeRef.current += 0.016;
      const t = timeRef.current;

      // ── Step 1: Update 4D hyperslice ───────────────────────────────────────
      rotRef.current.xw += p.rotXWSpeed * 0.016;
      rotRef.current.yw += p.rotYWSpeed * 0.016;
      rotRef.current.zw += p.rotSpeed   * 0.016;

      gl.useProgram(hyperProg.program);
      gl.uniform1f(hyperProg.u.u_time,    t);
      gl.uniform1f(hyperProg.u.u_wSlice,  p.wSlice + Math.sin(t * 0.5) * 0.3);
      gl.uniform1f(hyperProg.u.u_rotXW,   rotRef.current.xw);
      gl.uniform1f(hyperProg.u.u_rotYW,   rotRef.current.yw);
      gl.uniform1f(hyperProg.u.u_rotZW,   rotRef.current.zw);
      gl.uniform1f(hyperProg.u.u_R4D,     0.85);
      gl.uniform1f(hyperProg.u.u_mu4D,    0.18);
      gl.uniform1f(hyperProg.u.u_sigma4D, 0.033);
      // prev4D not used in analytical mode
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTex[swapRef.current]);
      gl.uniform1i(hyperProg.u.u_prev4D, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, hyperFB[0]);
      gl.viewport(0, 0, N, N);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Step 2: Compute flow field ─────────────────────────────────────────
      gl.useProgram(flowProg.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTex[swapRef.current]);
      gl.uniform1i(flowProg.u.u_state, 0);
      gl.uniform2f(flowProg.u.u_res, N, N);
      gl.uniform1f(flowProg.u.u_time, t);
      gl.uniform1f(flowProg.u.u_flowMode, p.flowMode);
      gl.bindFramebuffer(gl.FRAMEBUFFER, flowFB[0]);
      gl.viewport(0, 0, N, N);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Step 3: Multi-channel simulation passes ────────────────────────────
      for (let s = 0; s < p.spf; s++) {
        const cur = swapRef.current, nxt = 1 - cur;

        gl.useProgram(simProg.program);

        // State
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stateTex[cur]); gl.uniform1i(simProg.u.u_state, 0);
        // Kernels
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, kernelTex0); gl.uniform1i(simProg.u.u_kernel0, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, kernelTex1); gl.uniform1i(simProg.u.u_kernel1, 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, kernelTex2); gl.uniform1i(simProg.u.u_kernel2, 3);
        // Flow + hyperseed
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, flowTex[0]);  gl.uniform1i(simProg.u.u_flow, 4);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, hyperTex[0]); gl.uniform1i(simProg.u.u_hyperseed, 5);

        gl.uniform1f(simProg.u.u_R0, p.R0); gl.uniform1f(simProg.u.u_R1, p.R1); gl.uniform1f(simProg.u.u_R2, p.R2);
        gl.uniform1f(simProg.u.u_mu0, p.mu0); gl.uniform1f(simProg.u.u_mu1, p.mu1); gl.uniform1f(simProg.u.u_mu2, p.mu2);
        gl.uniform1f(simProg.u.u_sigma0, p.sig0); gl.uniform1f(simProg.u.u_sigma1, p.sig1); gl.uniform1f(simProg.u.u_sigma2, p.sig2);
        gl.uniform1f(simProg.u.u_dt, p.dt);
        gl.uniform2f(simProg.u.u_res, N, N);

        gl.uniform1f(simProg.u.u_c01, p.c01); gl.uniform1f(simProg.u.u_c10, p.c10);
        gl.uniform1f(simProg.u.u_c20, p.c20); gl.uniform1f(simProg.u.u_c21, 0.15);
        gl.uniform1f(simProg.u.u_c02, p.c02); gl.uniform1f(simProg.u.u_c12, p.c12);

        gl.uniform1f(simProg.u.u_hyperAmp, p.hyperAmp);
        gl.uniform1f(simProg.u.u_hyperMix, p.hyperMix);
        gl.uniform1f(simProg.u.u_flowStr, p.flowStr);
        gl.uniform1f(simProg.u.u_time, t);

        const m = mouseRef.current;
        gl.uniform1f(simProg.u.u_brushActive, m.active ? 1.0 : 0.0);
        gl.uniform2f(simProg.u.u_mouse, m.x, m.y);
        gl.uniform1f(simProg.u.u_brushSize, brushSize);
        gl.uniform1f(simProg.u.u_brushErase, m.erase ? 1.0 : 0.0);
        gl.uniform1f(simProg.u.u_brushChan, brushChan);

        gl.bindFramebuffer(gl.FRAMEBUFFER, stateFB[nxt]);
        gl.viewport(0, 0, N, N);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        swapRef.current = nxt;
      }

      const cur = swapRef.current;

      // ── Step 4: Display pass ───────────────────────────────────────────────
      gl.useProgram(dispProg.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stateTex[cur]); gl.uniform1i(dispProg.u.u_state, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, flowTex[0]);    gl.uniform1i(dispProg.u.u_flow, 1);
      gl.uniform1i(dispProg.u.u_viewMode, p.viewMode);
      gl.uniform1f(dispProg.u.u_time, t);
      gl.uniform1i(dispProg.u.u_palette, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dispFB);
      gl.viewport(0, 0, N, N);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Step 5: Bloom ──────────────────────────────────────────────────────
      if (p.bloom) {
        gl.useProgram(bloomProg.program);
        gl.activeTexture(gl.TEXTURE0);
        const passes = [[dispTex, bloomFB[0], [1,0], 1.0],
                        [bloomTex[0], bloomFB[1], [0,1], 0.0],
                        [bloomTex[1], bloomFB[0], [1,0], 0.0],
                        [bloomTex[0], bloomFB[1], [0,1], 0.0]];
        for (const [src, fb, dir, ext] of passes) {
          gl.bindTexture(gl.TEXTURE_2D, src);
          gl.uniform1i(bloomProg.u.u_input, 0);
          gl.uniform2f(bloomProg.u.u_dir, ...dir);
          gl.uniform2f(bloomProg.u.u_res, bN, bN);
          gl.uniform1f(bloomProg.u.u_extract, ext);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.viewport(0, 0, bN, bN);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }

      // ── Step 6: Composite ──────────────────────────────────────────────────
      gl.useProgram(compProg.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dispTex);     gl.uniform1i(compProg.u.u_display, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, p.bloom ? bloomTex[1] : dispTex); gl.uniform1i(compProg.u.u_bloom, 1);
      gl.uniform1f(compProg.u.u_bloomStr, p.bloom ? p.bloomStr : 0);
      gl.uniform1f(compProg.u.u_vignette, 0.4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, DISPLAY, DISPLAY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frameRef.current++;
      fpsF++; fpsAcc += now - lastT; lastT = now;
      if (fpsF >= 15) {
        setFps(Math.round(1000 / (fpsAcc / fpsF)));
        fpsF = 0; fpsAcc = 0;
        // Read mass of ch0 and ch1
        gl.bindFramebuffer(gl.FRAMEBUFFER, stateFB[cur]);
        gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, readBuf);
        let m0 = 0, m1 = 0;
        for (let i = 0; i < N*N; i++) { m0 += readBuf[i*4]; m1 += readBuf[i*4+1]; }
        setMass0(Math.round(m0)); setMass1(Math.round(m1));
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, brushSize, brushChan]);

  if (glError) return (
    <div style={{ padding: 40, textAlign: "center", color: "#f87171", fontFamily: "monospace" }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>◉ GPU Error</div>
      <div style={{ fontSize: 11 }}>{glError}</div>
    </div>
  );

  // Ecology bar
  const totalMass = mass0 + mass1 || 1;
  const preyPct   = Math.round(mass0 / totalMass * 100);
  const predPct   = Math.round(mass1 / totalMass * 100);

  return (
    <div style={{ "--mono": "'JetBrains Mono', 'Fira Mono', monospace", padding: "12px 10px", maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 300, letterSpacing: "0.25em", color: "#a78bfa", fontFamily: "var(--mono)", margin: 0 }}>
          ◈ LENIA · EXPANDED UNIVERSE <span style={{ fontSize: 8, color: "#a78bfa55" }}>MULTI-CHANNEL</span>
        </h2>
        <div style={{ fontSize: 8, color: "#3a4b6a", fontFamily: "var(--mono)", letterSpacing: "0.04em", marginTop: 3 }}>
          4D Dihypersphaerome · {N}×{N} · {fps}fps · Prey {mass0} · Pred {mass1}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>

        {/* ── Left Panel ── */}
        <div style={{ width: 210, background: "#0f1520", borderRadius: 10, border: "1px solid #1a1f35", padding: 14, flexShrink: 0, overflowY: "auto", maxHeight: 640 }}>

          {/* Presets */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 5, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Ecosystem</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: preset === id ? "1px solid #a78bfa55" : "1px solid #1a2236",
                background: preset === id ? "#a78bfa18" : "#0a0f1a",
                color: preset === id ? "#a78bfa" : "#5a6b8a", fontFamily: "var(--mono)",
              }}>{p.name}</button>
            ))}
          </div>
          {PRESETS[preset] && <div style={{ fontSize: 7, color: "#3a4b6a", marginBottom: 8, fontFamily: "var(--mono)", fontStyle: "italic", lineHeight: 1.4 }}>{PRESETS[preset].desc}</div>}

          {/* Ecology bar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "#5a6b8a", fontFamily: "var(--mono)", marginBottom: 3 }}>Ecology</div>
            <div style={{ height: 6, background: "#0a0f1a", borderRadius: 3, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${preyPct}%`, background: "#f59e0b", transition: "width 0.3s" }} />
              <div style={{ width: `${predPct}%`, background: "#22d3ee", transition: "width 0.3s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#3a4b6a", fontFamily: "var(--mono)", marginTop: 2 }}>
              <span style={{ color: "#f59e0b88" }}>prey {preyPct}%</span>
              <span style={{ color: "#22d3ee88" }}>pred {predPct}%</span>
            </div>
          </div>

          {/* Channel params */}
          <div style={{ fontSize: 8, color: "#f59e0b88", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>● Prey (ch0)</div>
          <Slider label="μ₀" value={mu0} onChange={setMu0} min={0.05} max={0.35} step={0.001} color="#f59e0b" />
          <Slider label="σ₀" value={sig0} onChange={setSig0} min={0.005} max={0.05} step={0.0005} color="#f59e0b" />
          <Slider label="R₀" value={R0} onChange={v=>setR0(Math.round(v))} min={5} max={20} step={1} color="#f59e0b" />

          <div style={{ fontSize: 8, color: "#22d3ee88", letterSpacing: "0.08em", marginBottom: 4, marginTop: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>◉ Predator (ch1)</div>
          <Slider label="μ₁" value={mu1} onChange={setMu1} min={0.05} max={0.45} step={0.001} color="#22d3ee" />
          <Slider label="σ₁" value={sig1} onChange={setSig1} min={0.005} max={0.06} step={0.0005} color="#22d3ee" />
          <Slider label="R₁" value={R1} onChange={v=>setR1(Math.round(v))} min={5} max={22} step={1} color="#22d3ee" />

          {/* Cross coupling */}
          <div style={{ fontSize: 8, color: "#34d39988", letterSpacing: "0.08em", marginBottom: 4, marginTop: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>⇄ Coupling</div>
          <Slider label="pred→prey" value={c01} onChange={setC01} min={0} max={1.5} step={0.01} color="#f87171" desc="predator suppresses prey" />
          <Slider label="prey→pred" value={c10} onChange={setC10} min={0} max={1.5} step={0.01} color="#22d3ee" desc="prey feeds predator" />
          <Slider label="morph→σ" value={c20} onChange={setC20} min={0} max={0.8} step={0.01} color="#34d399" desc="morphogen widens prey niche" />
          <Slider label="prey→morph" value={c02} onChange={setC02} min={0} max={0.3} step={0.005} color="#a78bfa" desc="prey secretes morphogen" />
        </div>

        {/* ── Canvas ── */}
        <div style={{ background: "#080c14", borderRadius: 10, border: "1px solid #0f1520", padding: 8 }}>
          <canvas ref={canvasRef}
            onMouseDown={e => { e.preventDefault(); handleMouse(e, true); }}
            onMouseMove={e => { if (e.buttons > 0) handleMouse(e, true); }}
            onMouseUp={() => { mouseRef.current.active = false; }}
            onMouseLeave={() => { mouseRef.current.active = false; }}
            onContextMenu={e => e.preventDefault()}
            style={{ width: DISPLAY, height: DISPLAY, borderRadius: 6, display: "block", cursor: "crosshair",
              boxShadow: "0 0 80px rgba(167,139,250,0.05), inset 0 0 60px rgba(0,0,0,0.4)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 7, color: "#2a3b5a", fontFamily: "var(--mono)" }}>
            <span>Click=paint · Shift+click=erase · Brush: ch{brushChan}</span>
            <span>{VIEW_MODES[viewMode]} · {fps}fps</span>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ width: 210, background: "#0f1520", borderRadius: 10, border: "1px solid #1a1f35", padding: 14, flexShrink: 0, overflowY: "auto", maxHeight: 640 }}>

          {/* 4D Controls */}
          <div style={{ fontSize: 8, color: "#a78bfa88", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>◈ Dihypersphaerome 4D</div>
          <div style={{ fontSize: 7, color: "#3a4b6a", marginBottom: 6, fontFamily: "var(--mono)", fontStyle: "italic", lineHeight: 1.5 }}>
            3Hy2v · ventilans · rotating in W-axis<br/>β=[1/12, 1/6, 1] · μ=0.18 · σ=0.033
          </div>
          <Slider label="ZW rotation" value={rotSpeed} onChange={setRotSpeed} min={0} max={0.8} step={0.01} color="#a78bfa" desc="breathing speed" />
          <Slider label="XW rotation" value={rotXWSpeed} onChange={setRotXWSpeed} min={0} max={0.4} step={0.005} color="#a78bfa" />
          <Slider label="YW rotation" value={rotYWSpeed} onChange={setRotYWSpeed} min={0} max={0.4} step={0.005} color="#a78bfa" />
          <Slider label="W slice" value={wSlice} onChange={setWSlice} min={-1} max={1} step={0.01} color="#c4b5fd" desc="hyperplane position" />
          <Slider label="4D amplitude" value={hyperAmp} onChange={setHyperAmp} min={0} max={1.5} step={0.01} color="#a78bfa" desc="density of 4D shadow" />
          <Slider label="4D→prey bleed" value={hyperMix} onChange={setHyperMix} min={0} max={0.5} step={0.005} color="#ddd6fe" desc="4D seeds prey channel" />

          {/* Flow field */}
          <div style={{ fontSize: 8, color: "#34d39988", letterSpacing: "0.08em", marginBottom: 4, marginTop: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>⟳ Flow Advection</div>
          <button onClick={() => setFlowEnabled(!flowEnabled)} style={{
            width: "100%", marginBottom: 6, padding: "3px", border: "1px solid #1a2236", borderRadius: 3,
            background: flowEnabled ? "#34d39918" : "#0a0f1a", color: flowEnabled ? "#34d399" : "#5a6b8a",
            fontSize: 7, cursor: "pointer", fontFamily: "var(--mono)",
          }}>{flowEnabled ? "◉ Advection ON" : "◯ Advection OFF"}</button>
          {flowEnabled && <>
            <Slider label="Flow strength" value={flowStr} onChange={setFlowStr} min={0} max={4} step={0.05} color="#34d399" />
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {FLOW_MODES.map((m, i) => (
                <button key={m} onClick={() => setFlowMode(i)} style={{
                  flex: 1, padding: "3px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                  border: flowMode === i ? "1px solid #34d39944" : "1px solid #1a2236",
                  background: flowMode === i ? "#34d39918" : "#0a0f1a",
                  color: flowMode === i ? "#34d399" : "#5a6b8a", fontFamily: "var(--mono)",
                }}>{m}</button>
              ))}
            </div>
          </>}

          {/* View + Display */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, marginTop: 8, fontFamily: "var(--mono)", textTransform: "uppercase" }}>View</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {VIEW_MODES.map((m, i) => (
              <button key={m} onClick={() => setViewMode(i)} style={{
                padding: "3px 5px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: viewMode === i ? "1px solid #a78bfa44" : "1px solid #1a2236",
                background: viewMode === i ? "#a78bfa18" : "#0a0f1a",
                color: viewMode === i ? "#a78bfa" : "#5a6b8a", fontFamily: "var(--mono)",
              }}>{m}</button>
            ))}
          </div>

          {/* Brush channel */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Paint channel</div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {[["Prey","#f59e0b"], ["Predator","#22d3ee"], ["Morph","#34d399"], ["Both","#a78bfa"]].map(([n,c],i) => (
              <button key={n} onClick={() => setBrushChan(i)} style={{
                flex: 1, padding: "3px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: brushChan === i ? `1px solid ${c}55` : "1px solid #1a2236",
                background: brushChan === i ? `${c}18` : "#0a0f1a",
                color: brushChan === i ? c : "#5a6b8a", fontFamily: "var(--mono)",
              }}>{n}</button>
            ))}
          </div>
          <Slider label="Brush" value={brushSize} onChange={v=>setBrushSize(Math.round(v))} min={2} max={30} step={1} color="#5a6b8a" />

          {/* Simulation */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, marginTop: 6, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Simulation</div>
          <Slider label="Δt" value={dt} onChange={setDt} min={0.02} max={0.2} step={0.005} color="#22d3ee" />
          <Slider label="Steps/frame" value={spf} onChange={v=>setSpf(Math.round(v))} min={1} max={6} step={1} color="#22d3ee" />

          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <button onClick={() => setBloom(!bloom)} style={{
              flex: 1, padding: "4px", border: "1px solid #1a2236", borderRadius: 4,
              background: bloom ? "#a78bfa10" : "#0a0f1a", color: bloom ? "#a78bfa" : "#5a6b8a",
              fontSize: 8, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{bloom ? "◉ Bloom" : "◯ Bloom"}</button>
            <button onClick={() => setRunning(!running)} style={{
              flex: 1, padding: "4px", border: "1px solid #1a2236", borderRadius: 4,
              background: running ? "#dc262615" : "#4ecdc415", color: running ? "#f87171" : "#4ecdc4",
              fontSize: 8, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{running ? "PAUSE" : "RUN"}</button>
          </div>
          {bloom && <Slider label="Glow" value={bloomStr} onChange={setBloomStr} min={0.1} max={1.5} step={0.05} color="#a78bfa" />}

          {/* Update rule display */}
          <div style={{ marginTop: 10, padding: 8, background: "#0a0f1a", borderRadius: 5, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 7, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>System</div>
            <div style={{ fontSize: 7, lineHeight: 1.8, color: "#2a3b5a", fontFamily: "var(--mono)" }}>
              U_i = K_i ∗ A_i<br/>
              G_i(U) = 2·exp(−ΔU²/2σᵢ²) − 1<br/>
              <span style={{color:"#f59e0b44"}}>G₀ −= c₀₁·A₁</span>{" "}(predation)<br/>
              <span style={{color:"#22d3ee44"}}>G₁ += c₁₀·A₀ − 0.012</span>{" "}(feeding)<br/>
              <span style={{color:"#34d39944"}}>σᵢ += c₂ᵢ·(A₂−0.3)</span>{" "}(morph)<br/>
              <span style={{color:"#a78bfa44"}}>A₃ = DV(xyw, t)</span>{" "}(4D proj)<br/>
              A&#x303; = advect(A, ∇A·Φ)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
