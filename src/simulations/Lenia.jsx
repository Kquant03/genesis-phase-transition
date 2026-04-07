import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════
// ◉  LENIA  ◉  GPU-Accelerated Continuous Cellular Automata
// ════════════════════════════════════════════════════════════════════
// WebGL2 ping-pong simulation · Shader-based bloom · Cosine palettes
// After Bert Wang-Chak Chan (2018) · "Lenia and Expanded Universe"
// ════════════════════════════════════════════════════════════════════

const N = 256;
const DISPLAY = 560;
const BLOOM_SCALE = 4; // bloom at N/4 resolution
const KERNEL_TEX_SIZE = 51; // max R=25
const KERNEL_CENTER = 25;

// ═══════════════ GLSL Shaders ═══════════════

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform sampler2D u_kernel;
uniform float u_R;
uniform float u_mu;
uniform float u_sigma;
uniform float u_dt;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_brushSize;
uniform float u_brushActive;
uniform float u_brushErase;
uniform float u_trailDecay;

void main() {
  vec2 texel = 1.0 / u_res;
  vec4 prev = texture(u_state, v_uv);
  float state = prev.r;
  float trail = prev.g;
  int R = int(u_R);

  float potential = 0.0;
  for (int dy = -25; dy <= 25; dy++) {
    if (dy < -R || dy > R) continue;
    for (int dx = -25; dx <= 25; dx++) {
      if (dx < -R || dx > R) continue;
      vec2 kUV = (vec2(float(dx + ${KERNEL_CENTER}), float(dy + ${KERNEL_CENTER})) + 0.5) / ${KERNEL_TEX_SIZE}.0;
      float w = texture(u_kernel, kUV).r;
      if (w < 1e-7) continue;
      vec2 sUV = fract(v_uv + vec2(float(dx), float(dy)) * texel);
      potential += texture(u_state, sUV).r * w;
    }
  }

  float diff = potential - u_mu;
  float g = 2.0 * exp(-(diff * diff) / (2.0 * u_sigma * u_sigma)) - 1.0;
  float newState = clamp(state + u_dt * g, 0.0, 1.0);

  if (u_brushActive > 0.5) {
    vec2 delta = v_uv - u_mouse;
    delta -= round(delta);
    float dist = length(delta * u_res);
    if (dist < u_brushSize) {
      float b = 1.0 - dist / u_brushSize;
      b = b * b;
      if (u_brushErase > 0.5) {
        newState = max(0.0, newState - b * 0.6);
      } else {
        newState = min(1.0, newState + b * 0.45);
      }
    }
  }

  float newTrail = max(newState, trail * u_trailDecay);
  outColor = vec4(newState, newTrail, potential, g * 0.5 + 0.5);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform int u_palette;
uniform int u_viewMode;
uniform float u_trailMix;

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}

vec3 gradient(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t = clamp(t, 0.0, 1.0);
  float s = t * 4.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  return mix(c3, c4, s - 3.0);
}

vec3 applyPalette(float t) {
  t = t * t * (3.0 - 2.0 * t); // smoothstep remap
  if (u_palette == 0) { // Bioluminescent
    return gradient(t,
      vec3(0.008, 0.012, 0.055),
      vec3(0.03, 0.10, 0.32),
      vec3(0.12, 0.42, 0.52),
      vec3(0.72, 0.48, 0.10),
      vec3(1.0, 0.94, 0.82));
  } else if (u_palette == 1) { // Inferno
    return gradient(t,
      vec3(0.0, 0.0, 0.015),
      vec3(0.16, 0.04, 0.33),
      vec3(0.53, 0.13, 0.26),
      vec3(0.88, 0.39, 0.04),
      vec3(0.98, 0.92, 0.36));
  } else if (u_palette == 2) { // Emerald
    return gradient(t,
      vec3(0.005, 0.02, 0.03),
      vec3(0.02, 0.12, 0.15),
      vec3(0.06, 0.38, 0.32),
      vec3(0.20, 0.72, 0.48),
      vec3(0.75, 1.0, 0.85));
  } else if (u_palette == 3) { // Plasma
    return gradient(t,
      vec3(0.02, 0.0, 0.06),
      vec3(0.25, 0.01, 0.48),
      vec3(0.62, 0.14, 0.44),
      vec3(0.92, 0.50, 0.15),
      vec3(0.94, 0.97, 0.13));
  } else { // Ocean
    return gradient(t,
      vec3(0.005, 0.01, 0.05),
      vec3(0.02, 0.06, 0.22),
      vec3(0.05, 0.22, 0.42),
      vec3(0.18, 0.58, 0.62),
      vec3(0.72, 0.96, 0.92));
  }
}

void main() {
  vec4 d = texture(u_state, v_uv);
  float state = d.r, trail = d.g, potential = d.b, growth = d.a;
  float val;
  if (u_viewMode == 0) val = mix(state, max(state, trail), u_trailMix);
  else if (u_viewMode == 1) val = clamp(potential * 4.0, 0.0, 1.0);
  else if (u_viewMode == 2) val = growth;
  else val = clamp(state * 0.55 + trail * 0.25 + potential * 1.2, 0.0, 1.0);
  outColor = vec4(applyPalette(val), 1.0);
}`;

const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_dir;
uniform vec2 u_res;
uniform float u_extract;

void main() {
  vec2 texel = 1.0 / u_res;
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 result = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    vec3 s = texture(u_input, v_uv + u_dir * texel * float(i) * 1.5).rgb;
    if (u_extract > 0.5) {
      float br = dot(s, vec3(0.2126, 0.7152, 0.0722));
      s *= smoothstep(0.08, 0.45, br) * 1.8;
    }
    result += s * w[abs(i)];
  }
  outColor = vec4(result, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_display;
uniform sampler2D u_bloom;
uniform float u_bloomStr;
uniform float u_vignette;

void main() {
  vec3 col = texture(u_display, v_uv).rgb;
  vec3 bloom = texture(u_bloom, v_uv).rgb;
  col += bloom * u_bloomStr;
  col = col / (1.0 + col * 0.4); // soft tonemap
  if (u_vignette > 0.01) {
    vec2 c = v_uv - 0.5;
    col *= 1.0 - dot(c, c) * u_vignette;
  }
  col = pow(col, vec3(0.95)); // slight gamma lift
  outColor = vec4(col, 1.0);
}`;

// ═══════════════ WebGL Utilities ═══════════════

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("Program error:", gl.getProgramInfoLog(p));
    return null;
  }
  // Collect all uniform locations
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, uniforms };
}

function createTex(gl, w, h, intFmt, fmt, type, filter, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, intFmt, w, h, 0, fmt, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function createFB(gl, tex) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fb;
}

// ═══════════════ Kernel Builder ═══════════════

function kernelCore(r) {
  if (r <= 0 || r >= 1) return 0;
  return Math.exp(4 - 4 / (4 * r * (1 - r)));
}

function buildKernelData(R, peaks) {
  const S = KERNEL_TEX_SIZE;
  const C = KERNEL_CENTER;
  const B = peaks.length;
  const data = new Float32Array(S * S * 4);
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const r = Math.sqrt(dx * dx + dy * dy) / R;
      if (r >= 1 || r <= 0) continue;
      const ri = Math.min(Math.floor(r * B), B - 1);
      const lr = r * B - ri;
      const k = peaks[ri] * kernelCore(lr);
      data[((C + dy) * S + (C + dx)) * 4] = k;
      sum += k;
    }
  }
  if (sum > 0) for (let i = 0; i < S * S; i++) data[i * 4] /= sum;
  return data;
}

// ═══════════════ RLE Decoder (Chakazul format) ═══════════════
// Decodes Lenia's Run-Length Encoded cell patterns from animals.json
// Format: digits=repeat, .=zero, A-Z=1-26, p-y prefix=+26 per step, $=newrow, !=end

function decodeRLE(str) {
  const rows = str.replace(/!$/, '').split('$');
  const grid = [];
  let maxVal = 0;
  let maxWidth = 0;
  for (const row of rows) {
    const cells = [];
    let i = 0;
    while (i < row.length) {
      let count = 0;
      while (i < row.length && row[i] >= '0' && row[i] <= '9') {
        count = count * 10 + row.charCodeAt(i) - 48; i++;
      }
      if (count === 0) count = 1;
      if (i >= row.length) break;
      let val = 0;
      if (row[i] === '.') { i++; }
      else if (row[i] >= 'p' && row[i] <= 'y') {
        val = (row.charCodeAt(i) - 111) * 26; i++;
        if (i < row.length && row[i] >= 'A' && row[i] <= 'Z') { val += row.charCodeAt(i) - 64; i++; }
      } else if (row[i] >= 'A' && row[i] <= 'Z') {
        val = row.charCodeAt(i) - 64; i++;
      } else { i++; continue; }
      for (let j = 0; j < count; j++) cells.push(val);
      if (val > maxVal) maxVal = val;
    }
    grid.push(cells);
    if (cells.length > maxWidth) maxWidth = cells.length;
  }
  // Pad all rows to uniform width (RLE omits trailing zeros)
  for (const row of grid) while (row.length < maxWidth) row.push(0);
  // Normalize to [0,1]
  if (maxVal > 0) for (const row of grid) for (let j = 0; j < row.length; j++) row[j] /= maxVal;
  return grid;
}

// ═══════════════ Species Cell Data (from Chakazul/Lenia animals.json) ═══════════════
// Each species has its own unique morphology tuned to its specific parameters

const SPECIES_RLE = {
  // Orbium unicaudatus — the classic glider soliton (μ=0.15, σ=0.017)
  // Source: Chakazul/Lenia animals.json, code "O2(a)"
  orbium: "7.MD6.qL$6.pKqEqFURpApBRAqQ$5.VqTrSsBrOpXpWpTpWpUpCrQ$4.CQrQsTsWsApITNPpGqGvL$3.IpIpWrOsGsBqXpJ4.LsFrL$A.DpKpSpJpDqOqUqSqE5.ExD$qL.pBpTT2.qCrGrVrWqM5.sTpP$.pGpWpD3.qUsMtItQtJ6.tL$.uFqGH3.pXtOuR2vFsK5.sM$.tUqL4.GuNwAwVxBwNpC4.qXpA$2.uH5.vBxGyEyMyHtW4.qIpL$2.wV5.tIyG3yOxQqW2.FqHpJ$2.tUS4.rM2yOyJyOyHtVpPMpFqNV$2.HsR4.pUxAyOxLxDxEuVrMqBqGqKJ$3.sLpE3.pEuNxHwRwGvUuLsHrCqTpR$3.TrMS2.pFsLvDvPvEuPtNsGrGqIP$4.pRqRpNpFpTrNtGtVtStGsMrNqNpF$5.pMqKqLqRrIsCsLsIrTrFqJpHE$6.RpSqJqPqVqWqRqKpRXE$8.OpBpIpJpFTK!",

  // Orbium bicaudatus — two-tailed variant (μ=0.15, σ=0.014)
  // Source: Chakazul/Lenia animals.json, code "O2(b)"
  bicaudatus: "14.B$8.pKT$5.pIQJrIqT2pIVL.sC$5.qJrDpPqWrV3pPpUpPtG$4.pArAsHpPpIqTpK2.JpNrDrX$3.pApUpKqRpA.qHpX4.VxM$qM.QpUV.pPqCBqCrSL4.tLT$.OpPpF2.qErXqJrGtTtD4.EuA$.tJqEB2.pItJtBsC2vEpF4.tL$.wDpU4.uNvJtJvExEuP4.rNJ$.tGqC4.vMxHvMvRyOyIqM3.qOV$2.tV4.uFyIwVuFwQyOuKO.OqJQ$2.vM4.rXyOwVtBuCxUwIrApDpKqJG$2.sCpX3.qMyBxHuCtVwAvWsKqMqHpX$2.BrVJ2.pUvBwXvBuKuXuPsPrGqMT$3.qCqOVOpUsRvBuUuCtVtGsCqWpN$4.pXqOqEqMrStBtJtBsPrSqTpNG$5.pDqHqRrDrNrQrLqWqHpIG$6.EVpKpPpSpNpFOB$9.BEB!",

  // Orbium unicaudatus ignis — fire form (μ=0.11, σ=0.012)
  // Source: Chakazul/Lenia animals.json, code "O2(-)" unicaudatus ignis
  ignis: "10.IPQMF$8.pKpRpSpTpWpUpQpBM$6.XqGV2DSpSqNqQqKpPSB$5.qBpX5.pOrHrSrMqSpTS$4.qCpQ6.rAtAtDsPrSqTpRP$4.rD6.pUuDuQtWtLsPrNqMpHA$3.uG7.uGwQvCuFuAtFrSqQpTN$2.vAL6.rKyFxLvIvBuTsXqWqFqAU$.tXqB7.wGyOyLxHwVuPqWpEpCpTpA$rDMpO6.sOxFyL2yOwDqR2.EpJpD$.WpH5.pIvNwSxQxXvEpD4.pFW$.pApM5.tUvCvUwEsI6.pOM$.TpPU3.sHtOuJuQqC7.qH$.HpJpPXIrKsFsStBpV7.pApH$2.MpGpMsStHsSrXqU8.rP$3.GrJtPuHtHrD8.sH$3.GrOsXtLsSU7.sC$4.pPrQrJpHpOQ5.qXT$5.pK.JpHpOWOQpMqHqG$8.KpEpMpQpLVqU$13.qD$12.pB!",

  // Orbium bicaudatus ignis — fire two-tailed (μ=0.1, σ=0.008)
  // Source: Chakazul/Lenia animals.json, code "O2(-)" bicaudatus ignis
  bicaudatus_ignis: "11.pTpS$8.sMuWpVpEN$5.pHsUS3.N2pDK$3.DqEQ7.RpJQ$2.EpMB9.VpLN$2.pMH10.DpPrPqA$.RpF9.pAqJqIrOrKK$.pEpFB4.HsBvAuHsOpT.RqDX$.pNpP2pGqNtTxFyNxGuTsFpJ2.FqXsEpW$BpQqLrHsXvOwVvXuRtRrQqSqNqHqWqFqQpOG$BpNqTsFtQuItH2rRtNuCvBuRsNpD.JpLL$.pEqOrTsUtEtBtCuWyDxKvGpA4.pJK$.PqCrKsLtRvBwSyFvGpA5.ApHG$.IpOqUsBtFtWtBpI7.QpB$2.WqHrBqUpN9.pJO$2.FpNqGpMD8.pHpMqP$3.KpPpNK7.sBuD$4.EpEpITF2ApFsTrX$6.DVpJpRpLB!",
};

// Species seeds are decoded inline in buildInitialState to avoid
// any module initialization ordering issues

// Fallback Orbium (hardcoded, used if RLE decode fails)
const ORBIUM_FALLBACK = [
  [0,0,0,0,0,0,0.1,0.14,0.1,0,0,0.03,0.03,0,0,0.3,0,0,0,0],
  [0,0,0,0,0,0.08,0.24,0.3,0.3,0.18,0.14,0.15,0.16,0.15,0.09,0.2,0,0,0,0],
  [0,0,0,0,0,0.15,0.34,0.44,0.46,0.38,0.18,0.14,0.11,0.13,0.19,0.18,0.45,0,0,0],
  [0,0,0,0,0.06,0.13,0.39,0.5,0.5,0.37,0.06,0,0,0,0.02,0.16,0.68,0,0,0],
  [0,0,0,0.11,0.17,0.17,0.33,0.4,0.38,0.28,0.14,0,0,0,0,0,0.18,0.42,0,0],
  [0,0,0.09,0.18,0.13,0.06,0.08,0.26,0.32,0.32,0.27,0,0,0,0,0,0,0.82,0,0],
  [0.27,0,0.16,0.12,0,0,0,0.25,0.38,0.44,0.45,0.34,0,0,0,0,0,0.22,0.17,0],
  [0,0.07,0.2,0.02,0,0,0,0.31,0.48,0.57,0.6,0.57,0,0,0,0,0,0,0.49,0],
  [0,0.59,0.19,0,0,0,0,0.2,0.57,0.69,0.76,0.76,0.49,0,0,0,0,0,0.36,0],
  [0,0.58,0.19,0,0,0,0,0,0.67,0.83,0.9,0.92,0.87,0.12,0,0,0,0,0.22,0.07],
  [0,0,0.46,0,0,0,0,0,0.7,0.93,1,1,1,0.61,0,0,0,0,0.18,0.11],
  [0,0,0.82,0,0,0,0,0,0.47,1,1,0.98,1,0.96,0.27,0,0,0,0.19,0.1],
  [0,0,0.46,0,0,0,0,0,0.25,1,1,0.84,0.92,0.97,0.54,0.14,0.04,0.1,0.21,0.05],
  [0,0,0,0.4,0,0,0,0,0.09,0.8,1,0.82,0.8,0.85,0.63,0.31,0.18,0.19,0.2,0.01],
  [0,0,0,0.36,0.1,0,0,0,0.05,0.54,0.86,0.79,0.74,0.72,0.6,0.39,0.28,0.24,0.13,0],
  [0,0,0,0.01,0.3,0.07,0,0,0.08,0.36,0.64,0.7,0.64,0.6,0.51,0.39,0.29,0.19,0.04,0],
  [0,0,0,0,0.1,0.24,0.14,0.1,0.15,0.29,0.45,0.53,0.52,0.46,0.4,0.31,0.21,0.08,0,0],
  [0,0,0,0,0,0.08,0.21,0.21,0.22,0.29,0.36,0.39,0.37,0.33,0.26,0.18,0.09,0,0,0],
  [0,0,0,0,0,0,0.03,0.13,0.19,0.22,0.24,0.24,0.23,0.18,0.13,0.05,0,0,0,0],
  [0,0,0,0,0,0,0,0,0.02,0.06,0.08,0.09,0.07,0.05,0.01,0,0,0,0,0],
];

function scaleSeed(cells, fromR, toR) {
  if (fromR === toR) return cells;
  const scale = toR / fromR;
  const oh = cells.length, ow = cells[0].length;
  const nh = Math.round(oh * scale), nw = Math.round(ow * scale);
  const out = [];
  for (let y = 0; y < nh; y++) {
    const row = [];
    for (let x = 0; x < nw; x++) {
      const sy = y / scale, sx = x / scale;
      const y0 = Math.floor(sy), x0 = Math.floor(sx);
      const y1 = Math.min(y0 + 1, oh - 1), x1 = Math.min(x0 + 1, ow - 1);
      const fy = sy - y0, fx = sx - x0;
      row.push(cells[y0][x0]*(1-fx)*(1-fy) + cells[y0][x1]*fx*(1-fy) + cells[y1][x0]*(1-fx)*fy + cells[y1][x1]*fx*fy);
    }
    out.push(row);
  }
  return out;
}

function buildInitialState(R, count, isSoup, speciesKey) {
  const data = new Float32Array(N * N * 4);
  // Decode species-specific seed inline (guaranteed fresh)
  let baseSeed;
  if (speciesKey && SPECIES_RLE[speciesKey]) {
    baseSeed = decodeRLE(SPECIES_RLE[speciesKey]);
  } else {
    baseSeed = ORBIUM_FALLBACK;
  }
  const seed = R !== 13 ? scaleSeed(baseSeed, 13, R) : baseSeed;
  const h = seed.length, w = seed[0].length;
  const minDist = R * 4;
  const positions = [];

  if (isSoup) {
    const spacing = Math.floor(N / 3);
    let placed = 0;
    for (let row = 0; row < 3 && placed < 6; row++)
      for (let col = 0; col < 3 && placed < 6; col++) {
        if (row === 1 && col === 1) continue;
        positions.push([
          Math.floor(spacing * (col + 0.5) + (Math.random() - 0.5) * spacing * 0.3),
          Math.floor(spacing * (row + 0.5) + (Math.random() - 0.5) * spacing * 0.3)
        ]);
        placed++;
      }
  } else {
    let attempts = 0;
    while (positions.length < count && attempts < 300) {
      const cx = Math.floor(N * 0.12 + Math.random() * N * 0.76);
      const cy = Math.floor(N * 0.12 + Math.random() * N * 0.76);
      let ok = true;
      for (const [px, py] of positions) {
        if (Math.min(Math.abs(cx - px), N - Math.abs(cx - px)) < minDist &&
            Math.min(Math.abs(cy - py), N - Math.abs(cy - py)) < minDist) { ok = false; break; }
      }
      if (ok) positions.push([cx, cy]);
      attempts++;
    }
  }

  for (const [cx, cy] of positions) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const gx = ((cx - Math.floor(w / 2) + x) % N + N) % N;
        const gy = ((cy - Math.floor(h / 2) + y) % N + N) % N;
        const idx = (gy * N + gx) * 4;
        const v = seed[y][x];
        data[idx] = Math.max(data[idx], v);
        data[idx + 1] = Math.max(data[idx + 1], v); // trail
      }
  }
  return data;
}

// ═══════════════ Presets ═══════════════

// All presets use parameters within the documented Orbium survival niche
// (Chan 2019, Figure 6: μ ∈ ~[0.13, 0.20], σ ∈ ~[0.013, 0.025] at R=13 T=10)
// so the Orbium seed self-organizes into a stable creature in every case.
const PRESETS = {
  orbium:     { name: "Orbium",      desc: "The classic glider soliton — stable directed locomotion (μ=0.15, σ=0.017)", R: 13, T: 10, mu: 0.15, sigma: 0.017, peaks: [1], count: 3, species: "orbium" },
  bicaudatus: { name: "Bicaudatus",  desc: "Two-tailed variant — tighter growth band splits the wake (μ=0.15, σ=0.014)", R: 13, T: 10, mu: 0.15, sigma: 0.014, peaks: [1], count: 3, species: "bicaudatus" },
  ignis:      { name: "Ignis",       desc: "Fire form — narrow growth band needs fine timestep (μ=0.11, σ=0.012, T=20)", R: 13, T: 20, mu: 0.11, sigma: 0.012, peaks: [1], count: 4, spf: 4, species: "ignis" },
  ignis_bi:   { name: "Ignis ×2",    desc: "Fire two-tailed — widened σ for GPU stability (μ=0.1, σ=0.01, T=40)", R: 13, T: 40, mu: 0.1, sigma: 0.01, peaks: [1], count: 3, spf: 6, species: "bicaudatus_ignis" },
  laxus:      { name: "Laxus",       desc: "Loose Orbium — wide tolerance band, wobbly oscillating gait (μ=0.156, σ=0.024)", R: 13, T: 10, mu: 0.156, sigma: 0.024, peaks: [1], count: 3, species: "orbium" },
  vagus:      { name: "Vagus",       desc: "Large-field wanderer — expanded R=20 neighborhood, different spatial scale", R: 20, T: 10, mu: 0.2, sigma: 0.031, peaks: [1], count: 2, species: "orbium" },
  soup:       { name: "Soup",        desc: "Ecosystem — many seeds compete under Orbium conditions, watch natural selection", R: 13, T: 10, mu: 0.15, sigma: 0.017, peaks: [1], count: 8, isSoup: true, species: "orbium" },
  ghost:      { name: "Ghost",       desc: "Ignis seed at wrong σ — knows its shape but can never reach it, sustains forever", R: 15, T: 12, mu: 0.11, sigma: 0.015, peaks: [1], count: 16, spf: 4, species: "ignis" },
};

const PALETTES = [
  { name: "Bio", color: "#4ecdc4" },
  { name: "Inferno", color: "#f59e0b" },
  { name: "Emerald", color: "#34d399" },
  { name: "Plasma", color: "#a78bfa" },
  { name: "Ocean", color: "#22d3ee" },
];

const VIEW_MODES = ["state", "potential", "growth", "composite"];

// ═══════════════ UI Components ═══════════════

function Slider({ label, value, onChange, min, max, step, color, desc }) {
  const fmt = v => v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(1) : Math.round(v);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontFamily: "var(--mono)" }}>
        <span style={{ fontSize: 9, color: "#5a6b8a", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color: color || "#d4dae8", fontWeight: 600 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: "#1a2236", borderRadius: 2, outline: "none", cursor: "pointer" }} />
      {desc && <div style={{ fontSize: 7, color: "#3a4b6a", marginTop: 1, fontFamily: "var(--mono)" }}>{desc}</div>}
    </div>
  );
}

// ═══════════════ Main Component ═══════════════

export default function Lenia() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const gpuRef = useRef(null); // all WebGL objects
  const animRef = useRef(null);
  const paramsRef = useRef(null);
  const mouseRef = useRef({ active: false, erase: false, x: 0, y: 0 });
  const frameRef = useRef(0);
  const swapRef = useRef(0); // which state texture is current

  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("orbium");
  const [R, setR] = useState(13);
  const [mu, setMu] = useState(0.15);
  const [sigma, setSigma] = useState(0.017);
  const [dt, setDt] = useState(0.1);
  const [spf, setSpf] = useState(2);
  const [palette, setPalette] = useState(0);
  const [viewMode, setViewMode] = useState(0);
  const [showTrails, setShowTrails] = useState(true);
  const [bloom, setBloom] = useState(true);
  const [bloomStr, setBloomStr] = useState(0.45);
  const [brushSize, setBrushSize] = useState(8);
  const [frameCount, setFrameCount] = useState(0);
  const [mass, setMass] = useState(0);
  const [fps, setFps] = useState(0);
  const [glError, setGlError] = useState(null);

  // Keep params ref current
  paramsRef.current = { mu, sigma, dt, spf, palette, viewMode, showTrails, bloom, bloomStr, R };

  // ── WebGL Setup ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = DISPLAY;
    canvas.height = DISPLAY;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) { setGlError("WebGL2 not supported"); return; }

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) { setGlError("Float textures not supported"); return; }
    gl.getExtension("OES_texture_float_linear");

    glRef.current = gl;

    // Compile programs
    const simProg = createProgram(gl, VERT, SIM_FRAG);
    const dispProg = createProgram(gl, VERT, DISPLAY_FRAG);
    const bloomProg = createProgram(gl, VERT, BLOOM_FRAG);
    const compProg = createProgram(gl, VERT, COMPOSITE_FRAG);
    if (!simProg || !dispProg || !bloomProg || !compProg) { setGlError("Shader compilation failed"); return; }

    // Fullscreen quad VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    // Bind a_pos for each program
    for (const prog of [simProg, dispProg, bloomProg, compProg]) {
      const loc = gl.getAttribLocation(prog.program, "a_pos");
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }

    // State textures (RGBA32F, N×N)
    const stateTex = [
      createTex(gl, N, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null),
      createTex(gl, N, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null),
    ];
    const stateFB = [createFB(gl, stateTex[0]), createFB(gl, stateTex[1])];

    // Kernel texture (RGBA32F, 51×51)
    const kernelTex = createTex(gl, KERNEL_TEX_SIZE, KERNEL_TEX_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null);

    // Display texture (RGBA8, N×N, LINEAR for smooth upscale)
    const dispTex = createTex(gl, N, N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, null);
    const dispFB = createFB(gl, dispTex);

    // Bloom textures (RGBA8, N/BLOOM_SCALE)
    const bN = Math.floor(N / BLOOM_SCALE);
    const bloomTex = [
      createTex(gl, bN, bN, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, null),
      createTex(gl, bN, bN, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, null),
    ];
    const bloomFB = [createFB(gl, bloomTex[0]), createFB(gl, bloomTex[1])];

    // Upload initial state
    const initData = buildInitialState(13, 3, false, "orbium");
    gl.bindTexture(gl.TEXTURE_2D, stateTex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, initData);

    // Upload kernel
    const kernelData = buildKernelData(13, [1]);
    gl.bindTexture(gl.TEXTURE_2D, kernelTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, KERNEL_TEX_SIZE, KERNEL_TEX_SIZE, gl.RGBA, gl.FLOAT, kernelData);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Pixel readback buffer for mass calculation (sample every ~30 frames)
    const readBuf = new Float32Array(N * N * 4);

    gpuRef.current = {
      simProg, dispProg, bloomProg, compProg, vao, vbo,
      stateTex, stateFB, kernelTex, dispTex, dispFB,
      bloomTex, bloomFB, bN, readBuf
    };
    swapRef.current = 0;
    frameRef.current = 0;

    return () => {
      // Cleanup
      gl.deleteTexture(stateTex[0]); gl.deleteTexture(stateTex[1]);
      gl.deleteTexture(kernelTex); gl.deleteTexture(dispTex);
      gl.deleteTexture(bloomTex[0]); gl.deleteTexture(bloomTex[1]);
      gl.deleteFramebuffer(stateFB[0]); gl.deleteFramebuffer(stateFB[1]);
      gl.deleteFramebuffer(dispFB); gl.deleteFramebuffer(bloomFB[0]); gl.deleteFramebuffer(bloomFB[1]);
      gl.deleteBuffer(vbo); gl.deleteVertexArray(vao);
      gl.deleteProgram(simProg.program); gl.deleteProgram(dispProg.program);
      gl.deleteProgram(bloomProg.program); gl.deleteProgram(compProg.program);
      gpuRef.current = null;
      glRef.current = null;
    };
  }, []);

  // ── Update kernel when R changes ──
  const updateKernel = useCallback((newR, peaks = [1]) => {
    const gl = glRef.current, gpu = gpuRef.current;
    if (!gl || !gpu) return;
    const data = buildKernelData(newR, peaks);
    gl.bindTexture(gl.TEXTURE_2D, gpu.kernelTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, KERNEL_TEX_SIZE, KERNEL_TEX_SIZE, gl.RGBA, gl.FLOAT, data);
  }, []);

  // ── Upload new state ──
  const uploadState = useCallback((data) => {
    const gl = glRef.current, gpu = gpuRef.current;
    if (!gl || !gpu) return;
    const cur = swapRef.current;
    gl.bindTexture(gl.TEXTURE_2D, gpu.stateTex[cur]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, data);
  }, []);

  // ── Load preset ──
  const loadPreset = useCallback((id) => {
    const p = PRESETS[id];
    setPreset(id); setR(p.R); setMu(p.mu); setSigma(p.sigma); setDt(1 / p.T);
    if (p.spf) setSpf(p.spf);
    updateKernel(p.R, p.peaks);
    uploadState(buildInitialState(p.R, p.count, p.isSoup, p.species));
    frameRef.current = 0;
    setFrameCount(0);
  }, [updateKernel, uploadState]);

  // ── Reset ──
  const reset = useCallback(() => {
    const p = PRESETS[preset];
    uploadState(buildInitialState(p.R, p.count, p.isSoup, p.species));
    frameRef.current = 0;
    setFrameCount(0);
  }, [preset, uploadState]);

  // ── Clear ──
  const clear = useCallback(() => {
    uploadState(new Float32Array(N * N * 4));
    frameRef.current = 0;
    setFrameCount(0);
  }, [uploadState]);

  // ── R change handler ──
  useEffect(() => { updateKernel(R); }, [R, updateKernel]);

  // ── Mouse handling ──
  const handleMouse = useCallback((e, active) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height; // flip Y for GL
    mouseRef.current = { active, erase: e.button === 2 || e.shiftKey, x, y };
  }, []);

  // ── Animation Loop ──
  useEffect(() => {
    if (!running) return;
    let active = true;
    let lastTime = performance.now();
    let fpsAccum = 0, fpsFrames = 0;

    const loop = (now) => {
      if (!active) return;
      const gl = glRef.current, gpu = gpuRef.current;
      if (!gl || !gpu) { animRef.current = requestAnimationFrame(loop); return; }

      const p = paramsRef.current;
      const { simProg, dispProg, bloomProg, compProg, vao,
              stateTex, stateFB, kernelTex, dispTex, dispFB,
              bloomTex, bloomFB, bN } = gpu;

      gl.bindVertexArray(vao);

      // ── Simulation passes ──
      for (let s = 0; s < p.spf; s++) {
        const cur = swapRef.current;
        const next = 1 - cur;

        gl.useProgram(simProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stateTex[cur]);
        gl.uniform1i(simProg.uniforms.u_state, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, kernelTex);
        gl.uniform1i(simProg.uniforms.u_kernel, 1);
        gl.uniform1f(simProg.uniforms.u_R, p.R);
        gl.uniform1f(simProg.uniforms.u_mu, p.mu);
        gl.uniform1f(simProg.uniforms.u_sigma, p.sigma);
        gl.uniform1f(simProg.uniforms.u_dt, p.dt);
        gl.uniform2f(simProg.uniforms.u_res, N, N);
        gl.uniform1f(simProg.uniforms.u_trailDecay, p.showTrails ? 0.96 : 0.0);

        const m = mouseRef.current;
        gl.uniform1f(simProg.uniforms.u_brushActive, m.active ? 1.0 : 0.0);
        gl.uniform2f(simProg.uniforms.u_mouse, m.x, m.y);
        gl.uniform1f(simProg.uniforms.u_brushSize, brushSize);
        gl.uniform1f(simProg.uniforms.u_brushErase, m.erase ? 1.0 : 0.0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, stateFB[next]);
        gl.viewport(0, 0, N, N);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        swapRef.current = next;
      }

      const curState = swapRef.current;

      // ── Display pass ──
      gl.useProgram(dispProg.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTex[curState]);
      gl.uniform1i(dispProg.uniforms.u_state, 0);
      gl.uniform1i(dispProg.uniforms.u_palette, p.palette);
      gl.uniform1i(dispProg.uniforms.u_viewMode, p.viewMode);
      gl.uniform1f(dispProg.uniforms.u_trailMix, p.showTrails ? 0.35 : 0.0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, dispFB);
      gl.viewport(0, 0, N, N);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (p.bloom) {
        // ── Bloom H (extract + horizontal blur) ──
        gl.useProgram(bloomProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dispTex);
        gl.uniform1i(bloomProg.uniforms.u_input, 0);
        gl.uniform2f(bloomProg.uniforms.u_dir, 1.0, 0.0);
        gl.uniform2f(bloomProg.uniforms.u_res, bN, bN);
        gl.uniform1f(bloomProg.uniforms.u_extract, 1.0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB[0]);
        gl.viewport(0, 0, bN, bN);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // ── Bloom V ──
        gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
        gl.uniform2f(bloomProg.uniforms.u_dir, 0.0, 1.0);
        gl.uniform1f(bloomProg.uniforms.u_extract, 0.0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // ── Extra blur passes for wider glow ──
        gl.bindTexture(gl.TEXTURE_2D, bloomTex[1]);
        gl.uniform2f(bloomProg.uniforms.u_dir, 1.0, 0.0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB[0]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
        gl.uniform2f(bloomProg.uniforms.u_dir, 0.0, 1.0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // ── Composite to screen ──
      gl.useProgram(compProg.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dispTex);
      gl.uniform1i(compProg.uniforms.u_display, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, p.bloom ? bloomTex[1] : dispTex);
      gl.uniform1i(compProg.uniforms.u_bloom, 1);
      gl.uniform1f(compProg.uniforms.u_bloomStr, p.bloom ? p.bloomStr : 0.0);
      gl.uniform1f(compProg.uniforms.u_vignette, 0.35);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, DISPLAY, DISPLAY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frameRef.current++;

      // FPS + mass (sample periodically)
      fpsFrames++;
      fpsAccum += now - lastTime;
      lastTime = now;
      if (fpsFrames >= 15) {
        const avgMs = fpsAccum / fpsFrames;
        setFps(Math.round(1000 / avgMs));
        setFrameCount(frameRef.current);
        fpsFrames = 0;
        fpsAccum = 0;

        // Read back a small portion for mass estimate
        gl.bindFramebuffer(gl.FRAMEBUFFER, stateFB[curState]);
        gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, gpu.readBuf);
        let m = 0;
        for (let i = 0; i < N * N; i++) m += gpu.readBuf[i * 4];
        setMass(m);
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [running, brushSize]);

  // ── Kernel viz ──
  const kVizRef = useRef(null);
  useEffect(() => {
    const c = kVizRef.current; if (!c) return;
    const ctx = c.getContext("2d"); const s = 70; c.width = s; c.height = s;
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const r = Math.sqrt(((x - s/2)/(s/2))**2 + ((y - s/2)/(s/2))**2);
      const k = (r > 0 && r < 1) ? kernelCore(r) : 0;
      const i = (y * s + x) * 4;
      img.data[i] = k * 245; img.data[i+1] = k * 158; img.data[i+2] = k * 11; img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [R]);

  // ── Growth viz ──
  const gVizRef = useRef(null);
  useEffect(() => {
    const c = gVizRef.current; if (!c) return;
    const ctx = c.getContext("2d"); const w = 160, h = 32; c.width = w; c.height = h;
    ctx.fillStyle = "#0a0f1a"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1a2236"; ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const u = (x/w) * 0.5, g = 2 * Math.exp(-((u - mu)**2) / (2 * sigma * sigma)) - 1;
      const py = h/2 - g * (h/2 - 2);
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "#f59e0b44"; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo((mu/0.5)*w, 0); ctx.lineTo((mu/0.5)*w, h); ctx.stroke();
  }, [mu, sigma]);

  if (glError) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>◉</div>
        <div style={{ fontSize: 13 }}>GPU Error: {glError}</div>
        <div style={{ fontSize: 10, color: "#5a6b8a", marginTop: 8 }}>Lenia requires WebGL2 with float texture support</div>
      </div>
    );
  }

  return (
    <div style={{ "--mono": "'JetBrains Mono', monospace", padding: "12px 10px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 300, letterSpacing: "0.25em", color: "#f59e0b", fontFamily: "var(--mono)", margin: 0 }}>
          ◉ LENIA <span style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.06em", fontWeight: 400 }}>GPU</span>
        </h2>
        <div style={{ fontSize: 8, color: "#3a4b6a", fontFamily: "var(--mono)", letterSpacing: "0.05em", marginTop: 3 }}>
          WebGL2 · Float Textures · Shader Bloom · {N}×{N} @ {fps}fps · frame {frameCount}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {/* ── Controls Panel ── */}
        <div style={{ width: 220, background: "#0f1520", borderRadius: 10, border: "1px solid #1a2236", padding: 14, flexShrink: 0 }}>

          {/* Species */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 5, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Species</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => loadPreset(id)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: preset === id ? "1px solid #f59e0b44" : "1px solid #1a2236",
                background: preset === id ? "#f59e0b18" : "#0a0f1a",
                color: preset === id ? "#f59e0b" : "#5a6b8a", fontFamily: "var(--mono)",
              }}>{p.name}</button>
            ))}
          </div>
          {PRESETS[preset] && <div style={{ fontSize: 7, color: "#3a4b6a", marginBottom: 8, fontFamily: "var(--mono)", fontStyle: "italic", lineHeight: 1.4 }}>{PRESETS[preset].desc}</div>}

          {/* Kernel */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Kernel K(r)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
            <canvas ref={kVizRef} width={70} height={70} style={{ borderRadius: 4, border: "1px solid #1a2236", width: 50, height: 50, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Slider label="R" value={R} onChange={v => setR(Math.round(v))} min={5} max={25} step={1} color="#f59e0b" desc="Neighborhood radius" />
            </div>
          </div>

          {/* Growth */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Growth G(u)</div>
          <canvas ref={gVizRef} width={160} height={32} style={{ width: "100%", height: 24, borderRadius: 3, border: "1px solid #1a2236", marginBottom: 4 }} />
          <Slider label="μ" value={mu} onChange={setMu} min={0.01} max={0.4} step={0.001} color="#22d3ee" desc="Optimal density" />
          <Slider label="σ" value={sigma} onChange={setSigma} min={0.001} max={0.06} step={0.0005} color="#22d3ee" desc="Growth width" />
          <Slider label="Δt" value={dt} onChange={setDt} min={0.02} max={0.2} step={0.005} color="#22d3ee" />
          <Slider label="Speed" value={spf} onChange={v => setSpf(Math.round(v))} min={1} max={8} step={1} color="#22d3ee" />
          <Slider label="Brush" value={brushSize} onChange={v => setBrushSize(Math.round(v))} min={2} max={25} step={1} color="#34d399" desc="Click=paint · Shift+click=erase" />

          {/* Palette */}
          <div style={{ fontSize: 8, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, marginTop: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Palette</div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
            {PALETTES.map((pal, i) => (
              <button key={i} onClick={() => setPalette(i)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: palette === i ? `1px solid ${pal.color}44` : "1px solid #1a2236",
                background: palette === i ? `${pal.color}18` : "#0a0f1a",
                color: palette === i ? pal.color : "#5a6b8a", fontFamily: "var(--mono)",
              }}>{pal.name}</button>
            ))}
          </div>

          {/* View */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
            {VIEW_MODES.map((m, i) => (
              <button key={m} onClick={() => setViewMode(i)} style={{
                padding: "3px 6px", borderRadius: 3, fontSize: 7, cursor: "pointer",
                border: viewMode === i ? "1px solid #a78bfa44" : "1px solid #1a2236",
                background: viewMode === i ? "#a78bfa18" : "#0a0f1a",
                color: viewMode === i ? "#a78bfa" : "#5a6b8a", fontFamily: "var(--mono)", textTransform: "capitalize",
              }}>{m}</button>
            ))}
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            <button onClick={() => setShowTrails(!showTrails)} style={{
              flex: 1, padding: "3px", border: "1px solid #1a2236", borderRadius: 3,
              background: showTrails ? "#f59e0b10" : "#0a0f1a", color: showTrails ? "#f59e0b" : "#5a6b8a",
              fontSize: 7, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{showTrails ? "◉ Trails" : "◯ Trails"}</button>
            <button onClick={() => setBloom(!bloom)} style={{
              flex: 1, padding: "3px", border: "1px solid #1a2236", borderRadius: 3,
              background: bloom ? "#a78bfa10" : "#0a0f1a", color: bloom ? "#a78bfa" : "#5a6b8a",
              fontSize: 7, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{bloom ? "◉ Bloom" : "◯ Bloom"}</button>
          </div>
          {bloom && <Slider label="Glow" value={bloomStr} onChange={setBloomStr} min={0.1} max={1.2} step={0.05} color="#a78bfa" />}

          {/* Controls */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setRunning(!running)} style={{
              flex: 1, padding: "6px", border: "1px solid #1a2236", borderRadius: 5,
              background: running ? "#dc262615" : "#4ecdc415", color: running ? "#f87171" : "#4ecdc4",
              fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
            }}>{running ? "PAUSE" : "RUN"}</button>
            <button onClick={reset} style={{
              flex: 1, padding: "6px", border: "1px solid #1a2236", borderRadius: 5,
              background: "#0a0f1a", color: "#5a6b8a", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
            }}>RESET</button>
          </div>
          <button onClick={clear} style={{
            width: "100%", padding: "4px", marginTop: 4, border: "1px solid #1a2236", borderRadius: 3,
            background: "#0a0f1a", color: "#4a5b6a", fontSize: 7, cursor: "pointer", fontFamily: "var(--mono)",
          }}>CLEAR FIELD</button>

          {/* Stats */}
          <div style={{ marginTop: 6, fontSize: 8, color: "#3a4b6a", fontFamily: "var(--mono)", textAlign: "center", lineHeight: 1.5 }}>
            R={R} · Δt={dt.toFixed(2)} · mass {mass.toFixed(0)}
          </div>

          {/* Update rule */}
          <div style={{ marginTop: 8, padding: 8, background: "#0a0f1a", borderRadius: 5, border: "1px solid #1a2236" }}>
            <div style={{ fontSize: 7, color: "#5a6b8a", letterSpacing: "0.08em", marginBottom: 4, fontFamily: "var(--mono)", textTransform: "uppercase" }}>Update Rule</div>
            <div style={{ fontSize: 8, lineHeight: 1.7, color: "#3a4b6a", fontFamily: "var(--mono)" }}>
              U = K ∗ A <span style={{ color: "#2a3b5a" }}>(GPU conv)</span><br/>
              G(u) = 2·exp(−(u−μ)²/2σ²) − 1<br/>
              A<sup>t+Δt</sup> = clip(A<sup>t</sup> + Δt·G(U), 0, 1)
            </div>
          </div>
        </div>

        {/* ── Canvas ── */}
        <div style={{ background: "#0a0e18", borderRadius: 10, border: "1px solid #1a2236", padding: 8 }}>
          <canvas
            ref={canvasRef}
            onMouseDown={e => { e.preventDefault(); handleMouse(e, true); }}
            onMouseMove={e => { if (mouseRef.current.active) handleMouse(e, true); }}
            onMouseUp={() => { mouseRef.current.active = false; }}
            onMouseLeave={() => { mouseRef.current.active = false; }}
            onContextMenu={e => e.preventDefault()}
            style={{
              width: DISPLAY, height: DISPLAY, borderRadius: 6, display: "block", cursor: "crosshair",
              boxShadow: "0 0 80px rgba(245,158,11,0.03), inset 0 0 60px rgba(0,0,0,0.3)",
              imageRendering: "auto",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 7, color: "#2a3b5a", fontFamily: "var(--mono)" }}>
            <span>Click=paint · Shift=erase · Toroidal boundaries</span>
            <span>{PALETTES[palette].name} · {VIEW_MODES[viewMode]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}