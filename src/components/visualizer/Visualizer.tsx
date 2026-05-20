import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Glitch, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { GlitchMode, BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { getAudioDriveSnapshot } from '@/lib/audioDrive';
import { getOutputModeLabel, getTransitionLabel, screenText } from '@/lib/screenText';
import { useStore } from '@/store/useStore';

function getReactiveAudio() {
  const { audioDriveMode, autoVjEnabled } = useStore.getState();
  const audio = getAudioDriveSnapshot(audioDriveMode);
  const motionAmount = autoVjEnabled ? 0.9 : 0;
  const beatAmount = autoVjEnabled ? 0.75 : 0;

  return {
    ...audio,
    volume: audio.volume * motionAmount,
    subBass: audio.subBass * motionAmount,
    bass: audio.bass * motionAmount,
    lowMid: audio.lowMid * motionAmount,
    mid: audio.mid * motionAmount,
    highMid: audio.highMid * motionAmount,
    treble: audio.treble * motionAmount,
    energy: audio.energy * motionAmount,
    beat: audio.beat * beatAmount,
    spectralCentroid: audio.spectralCentroid * motionAmount,
    spectralFlux: audio.spectralFlux * motionAmount,
    transient: audio.transient * motionAmount,
    dynamicRange: audio.dynamicRange * motionAmount,
  };
}

const audioMutationFragment = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uFlux;
  uniform float uTransient;
  uniform float uCentroid;
  uniform float uDynamicRange;
  uniform vec3 uBaseColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAccentColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float sweepSpeed = 0.18 + uCentroid * 1.45 + uFlux * 0.75;
    float grainScale = 4.0 + uCentroid * 18.0 + uDynamicRange * 8.0;
    float field = noise(p * grainScale + vec2(uTime * sweepSpeed, -uTime * (0.12 + uFlux)));
    float ribbons = sin((p.x * (5.0 + uCentroid * 16.0) + p.y * (2.0 + uDynamicRange * 8.0)) + uTime * (1.5 + uFlux * 4.5));
    float mask = smoothstep(0.44, 0.94, field + ribbons * (0.18 + uTransient * 0.28));
    float radial = smoothstep(1.35, 0.15, length(p + vec2(sin(uTime * 0.3) * 0.18, cos(uTime * 0.24) * 0.12)));
    float intensity = mask * radial * (0.05 + uEnergy * 0.22 + uFlux * 0.34 + uTransient * 0.3);
    vec3 tone = mix(uBaseColor, uSecondaryColor, clamp(uCentroid * 1.25, 0.0, 1.0));
    tone = mix(tone, uAccentColor, clamp(uTransient * 0.7, 0.0, 0.55));
    gl_FragColor = vec4(tone * intensity, clamp(intensity, 0.0, 0.72));
  }
`;

function AudioMutationOverlay() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor, secondaryColor, accentColor } = useStore();

  useFrame((state) => {
    if (!matRef.current) return;
    const { energy, spectralFlux, transient, spectralCentroid, dynamicRange } = getReactiveAudio();
    const uniforms = matRef.current.uniforms;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * 0.12;
    uniforms.uFlux.value += (spectralFlux - uniforms.uFlux.value) * 0.25;
    uniforms.uTransient.value += (transient - uniforms.uTransient.value) * 0.34;
    uniforms.uCentroid.value += (spectralCentroid - uniforms.uCentroid.value) * 0.16;
    uniforms.uDynamicRange.value += (dynamicRange - uniforms.uDynamicRange.value) * 0.14;
    uniforms.uBaseColor.value.set(baseColor);
    uniforms.uSecondaryColor.value.set(secondaryColor);
    uniforms.uAccentColor.value.set(accentColor);
  });

  return (
    <mesh position={[0, 0, 2.8]} renderOrder={50}>
      <planeGeometry args={[22, 12]} />
      <shaderMaterial
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={audioMutationFragment}
        uniforms={{
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uFlux: { value: 0 },
          uTransient: { value: 0 },
          uCentroid: { value: 0 },
          uDynamicRange: { value: 0 },
          uBaseColor: { value: new THREE.Color(baseColor) },
          uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          uAccentColor: { value: new THREE.Color(accentColor) },
        }}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// === WEBCAM HOOK ===
function useWebcamTexture() {
  const [video] = useState(() => {
    const v = document.createElement('video');
    v.crossOrigin = 'Anonymous';
    v.playsInline = true;
    v.muted = true;
    return v;
  });
  const [texture] = useState(() => {
    const tex = new THREE.VideoTexture(video);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        video.srcObject = stream;
        video.play().catch((e) => {
          if (e.name !== 'AbortError') console.warn('Error playing video', e);
        });
      }).catch(err => console.log('Camera access denied or unavailable', err));
    return () => {
      const stream = video.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [video]);

  return texture;
}

// === SCENES ===

// 1. VOID SCENE (liquid chrome organism / cybernetic immersive space)
const voidVertex = `
  uniform float uTime;
  uniform float uSubBass;
  uniform float uBass;
  uniform float uMid;
  uniform float uBeat;
  attribute float aSeed;
  varying float vHue;
  varying float vDepth;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float id = aSeed;
    float drift = uTime * (0.08 + hash(id) * 0.12);
    p.x += sin(drift + position.z * 0.18) * (0.25 + uBass * 0.9);
    p.y += cos(drift * 1.25 + position.x * 0.2) * (0.18 + uMid * 0.45);
    p.z += sin(drift * 0.65 + position.y * 0.22) * (0.38 + uSubBass * 0.9);

    float depthPulse = 1.0 + uBeat * 0.18 + uSubBass * 0.12;
    p.xy *= depthPulse;

    vHue = hash(id * 2.17);
    vDepth = smoothstep(-18.0, 18.0, p.z);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float nearBoost = smoothstep(0.0, 1.0, vDepth);
    gl_PointSize = (34.0 + 150.0 * hash(id * 4.31) + 82.0 * uBeat) * (1.0 / -mvPosition.z) * (0.8 + nearBoost * 0.75);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const voidFragment = `
  uniform vec3 uColor;
  uniform vec3 uSecondaryColor;
  uniform float uEnergy;
  uniform float uBeat;
  varying float vHue;
  varying float vDepth;

  void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = length(cxy);
    if(r > 1.0) discard;

    float core = smoothstep(0.42, 0.0, r);
    float ring = smoothstep(0.72, 0.52, r) * smoothstep(0.28, 0.52, r);
    float mesh = (sin(cxy.x * 42.0 + vHue * 8.0) * sin(cxy.y * 37.0 - vHue * 5.0)) * 0.5 + 0.5;
    float highlight = pow(max(0.0, 1.0 - distance(cxy, vec2(-0.28, 0.32)) * 2.0), 5.5);
    float shade = smoothstep(1.0, 0.15, r);

    vec3 steel = vec3(0.30, 0.34, 0.38);
    vec3 graphite = vec3(0.015, 0.018, 0.024);
    vec3 chrome = mix(graphite, steel, shade);
    chrome += vec3(0.9, 1.0, 1.0) * highlight * 0.55;
    chrome += mix(uColor, uSecondaryColor, vHue) * (ring * (0.22 + mesh * 0.18) + core * 0.05);

    float ripple = smoothstep(0.035, 0.0, abs(fract(r * 5.5 - uBeat * 0.4 - vHue) - 0.5));
    float alpha = core * 0.22 + ring * 0.34 + ripple * ring * 0.16 + highlight * 0.22;
    alpha *= 0.34 + uEnergy * 0.16 + uBeat * 0.1;
    alpha *= 0.42 + vDepth * 0.34;
    gl_FragColor = vec4(chrome, alpha);
  }
`;

const darkSpaceStageFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform float uBeat;
  uniform vec3 uColor;
  uniform vec3 uSecondaryColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float lineField(vec2 uv, float scale, float offset) {
    vec2 warped = uv * scale;
    float horizontal = abs(fract(warped.y + sin(uv.x * 5.0 + uTime * 0.35 + offset) * 0.08) - 0.5);
    float vertical = abs(fract(warped.x + sin(uv.y * 4.0 - uTime * 0.22 + offset) * 0.06) - 0.5);
    return smoothstep(0.028, 0.0, min(horizontal, vertical));
  }

  float softOval(vec2 uv, vec2 center, vec2 radius, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    mat2 r = mat2(c, -s, s, c);
    vec2 p = r * (uv - center);
    return length(p / radius);
  }

  float perspectiveFloor(vec2 p, float audio) {
    float y = p.y + 1.18;
    if (y <= 0.02) return 0.0;
    float z = 1.0 / y;
    vec2 guv = vec2(p.x * z * 1.15, z * 0.68 - uTime * (0.18 + audio * 0.24));
    float gx = abs(fract(guv.x * 1.9) - 0.5);
    float gy = abs(fract(guv.y * 1.35) - 0.5);
    float line = smoothstep(0.035, 0.0, min(gx / z, gy / z));
    return line * smoothstep(6.0, 0.35, z) * smoothstep(-0.08, -0.82, p.y);
  }

  float perspectiveWall(vec2 p, float offset) {
    vec2 q = p;
    q.y += sin(q.x * 2.8 + uTime * 0.18 + offset) * 0.04;
    float vertical = abs(fract((q.x / max(0.38, 1.45 - q.y)) * 4.4 + offset) - 0.5);
    float horizontal = abs(fract((q.y + 0.22) * 4.2 + sin(q.x * 2.4 + uTime * 0.16) * 0.12) - 0.5);
    float line = smoothstep(0.028, 0.0, min(vertical, horizontal));
    return line * smoothstep(-0.55, 0.28, q.y) * smoothstep(1.25, -0.08, q.y);
  }

  float organicLine(vec2 p, float y, float amp, float freq, float phase) {
    float wave = y + sin(p.x * freq + phase + uTime * 0.08) * amp + sin(p.x * (freq * 0.42) - phase) * amp * 0.65;
    return smoothstep(0.022, 0.0, abs(p.y - wave));
  }

  float metaballField(vec2 uv, float audio) {
    float field = 0.0;
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      vec2 seed = vec2(fi * 13.71, fi * 19.37);
      vec2 center = vec2(hash(seed), hash(seed + 4.2));
      center += vec2(
        sin(uTime * (0.035 + hash(seed) * 0.045) + fi),
        cos(uTime * (0.04 + hash(seed + 7.0) * 0.04) + fi * 1.3)
      ) * (0.08 + audio * 0.04);
      vec2 d = uv - center;
      float radius = 0.035 + hash(seed + 2.0) * 0.11;
      field += radius * radius / max(dot(d, d), 0.0018);
    }
    return field;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= 1.7;

    float t = uTime * 0.12;
    float n1 = noise(uv * 1.7 + vec2(t, -t * 0.72));
    float n2 = noise(uv * 4.4 + vec2(-t * 1.2, t * 0.9));
    vec2 driftUv = uv + vec2(n1 - 0.5, n2 - 0.5) * (0.09 + uBass * 0.055);
    vec2 stageP = p;

    vec3 peach = vec3(1.0, 0.54, 0.42);
    vec3 lemon = vec3(1.0, 0.94, 0.16);
    vec3 rose = vec3(1.0, 0.28, 0.86);
    vec3 cyan = vec3(0.15, 0.96, 1.0);
    vec3 green = vec3(0.18, 1.0, 0.34);
    vec3 violet = vec3(0.55, 0.24, 1.0);
    vec3 coral = vec3(1.0, 0.18, 0.06);

    float liquidField = metaballField(driftUv, uEnergy);
    vec3 paper = mix(vec3(0.96, 0.72, 0.68), vec3(0.88, 0.86, 0.48), smoothstep(-0.9, 0.8, stageP.x));
    paper = mix(paper, vec3(0.72, 0.94, 0.78), smoothstep(0.25, 0.95, sin(stageP.x * 1.6 - stageP.y * 0.8 + n1)));
    vec3 col = paper * 0.82;
    vec3 wash = mix(peach, lemon, smoothstep(-0.82, 0.95, stageP.x + n1 * 0.7));
    wash = mix(wash, rose, smoothstep(0.2, 0.88, sin((driftUv.x + driftUv.y) * 2.7 + uTime * 0.12)) * 0.5);
    wash = mix(wash, cyan, smoothstep(0.62, 0.96, sin(driftUv.y * 5.6 - uTime * 0.2 + n2 * 1.4)) * 0.44);
    wash = mix(wash, green, smoothstep(0.74, 0.98, sin(driftUv.x * 6.2 + uTime * 0.14)) * 0.35);
    float liquidMask = smoothstep(0.72, 2.9, liquidField);
    float liquidCore = smoothstep(2.2, 8.0, liquidField);
    vec3 liquidColor = mix(rose, cyan, smoothstep(0.25, 0.95, sin(liquidField * 0.42 + uTime * 0.12)));
    liquidColor = mix(liquidColor, lemon, smoothstep(1.1, 4.8, liquidField) * 0.42);
    wash = mix(wash, liquidColor, liquidMask * 0.34);
    float veilAlpha = 0.42 + uEnergy * 0.08;
    col = mix(col, wash, veilAlpha);
    col += liquidColor * liquidCore * (0.05 + uBass * 0.04);

    float floorGrid = perspectiveFloor(stageP, uEnergy);
    float wallGrid = perspectiveWall(stageP, 0.0);
    float rearGrid = perspectiveWall(stageP * vec2(0.82, 1.08) + vec2(0.03, 0.08), 1.7);
    float softGrid = lineField(driftUv + vec2(n1, n2) * 0.06, 5.0, 0.0);
    float fineGrid = lineField(driftUv + vec2(n2, n1) * 0.04, 10.5, 2.7);
    vec3 lineColor = mix(violet, cyan, 0.42 + uTreble * 0.45);
    col += lineColor * wallGrid * (0.08 + uTreble * 0.05);
    col += mix(cyan, lemon, 0.45) * floorGrid * (0.08 + uBass * 0.04);
    col += rose * rearGrid * 0.04;
    col += lineColor * softGrid * (0.05 + uEnergy * 0.04);
    col += vec3(1.0, 0.32, 0.0) * fineGrid * 0.025;

    float organicLines = 0.0;
    organicLines += organicLine(stageP, -0.62, 0.035, 3.2, 0.2);
    organicLines += organicLine(stageP, -0.32, 0.03, 3.7, 1.6);
    organicLines += organicLine(stageP, -0.02, 0.032, 2.8, 3.1);
    organicLines += organicLine(stageP, 0.28, 0.026, 3.3, 4.6);
    organicLines += organicLine(vec2(stageP.y, stageP.x), -0.58, 0.028, 2.6, 0.9);
    organicLines += organicLine(vec2(stageP.y, stageP.x), 0.42, 0.026, 3.1, 2.2);
    col = mix(col, vec3(0.78, 0.13, 0.48), clamp(organicLines * 0.32, 0.0, 0.42));

    float curtain1 = smoothstep(0.035, 0.0, abs(sin(stageP.x * 1.2 + stageP.y * 2.8 + uTime * 0.16 + n1 * 1.8)));
    float curtain2 = smoothstep(0.04, 0.0, abs(sin(stageP.x * -1.65 + stageP.y * 2.15 - uTime * 0.14 + n2 * 1.7)));
    float gauze = (curtain1 * 0.16 + curtain2 * 0.12) * smoothstep(-1.1, 0.75, stageP.y);
    col += mix(rose, cyan, 0.55 + 0.35 * sin(uTime * 0.18)) * gauze * (0.22 + uEnergy * 0.12);

    for (int i = 0; i < 32; i++) {
      float fi = float(i);
      vec2 seed = vec2(fi * 17.13, fi * 9.41);
      float layer = hash(seed + 11.0);
      vec2 center = vec2(hash(seed), hash(seed + 3.7));
      center.x += (layer - 0.5) * 0.18;
      center.y = mix(center.y, center.y * 0.72 + 0.1, layer);
      float parallax = mix(0.035, 0.11, layer);
      center += vec2(
        sin(uTime * (0.06 + hash(seed) * 0.06) + fi * 1.7),
        cos(uTime * (0.05 + hash(seed + 8.0) * 0.05) + fi)
      ) * parallax;
      float breathe = 1.0 + sin(uTime * (0.34 + layer * 0.25) + fi) * (0.08 + uBeat * 0.18);
      vec2 radius = vec2(0.05 + hash(seed + 1.0) * 0.15, 0.038 + hash(seed + 2.0) * 0.12) * breathe * mix(0.72, 1.48, layer);
      float d = softOval(driftUv, center, radius, uTime * (0.035 + layer * 0.06) + fi);
      float shell = smoothstep(1.16, 0.86, d) * smoothstep(0.45, 0.78, d);
      float ripple = smoothstep(0.032, 0.0, abs(fract(d * (4.2 + layer * 3.5) - uTime * (0.11 + layer * 0.12)) - 0.5));
      float glow = smoothstep(3.2, 0.36, d) * mix(0.12, 0.32, layer);
      float core = smoothstep(0.32, 0.0, d);
      float hatch = (sin((driftUv.x + center.y) * (70.0 + layer * 70.0)) * sin((driftUv.y + center.x) * (65.0 + layer * 60.0))) * 0.5 + 0.5;
      vec3 orbCol = mix(coral, violet, hash(seed + 4.0));
      orbCol = mix(orbCol, cyan, smoothstep(0.45, 0.9, hash(seed + 5.0)));
      orbCol = mix(orbCol, uColor, 0.18);
      col += orbCol * (glow * 0.46 + shell * (0.34 + hatch * 0.26) + ripple * shell * 0.18 + core * (0.16 + uBeat * 0.22));
      col = mix(col, vec3(0.04, 0.055, 0.03), core * step(0.76, hash(seed + 6.0)) * 0.5);
    }

    float beamA = pow(max(0.0, 1.0 - abs(stageP.x * 0.44 + stageP.y * 0.22)), 3.2);
    float beamB = pow(max(0.0, 1.0 - abs(stageP.x * -0.52 + stageP.y * 0.18)), 3.4);
    float rearHalo = smoothstep(0.72, 0.04, length(stageP * vec2(0.72, 1.2) - vec2(0.0, 0.12)));
    float floorGlow = smoothstep(-0.12, -1.0, stageP.y);
    col += mix(uColor, uSecondaryColor, 0.55) * beamA * (0.04 + uBeat * 0.05);
    col += mix(lemon, rose, 0.34) * beamB * (0.04 + uMid * 0.04);
    col += vec3(1.0, 0.78, 0.18) * floorGlow * (0.035 + uBass * 0.035);
    col += mix(rose, cyan, 0.35) * rearHalo * (0.04 + uEnergy * 0.06);
    col += wash * 0.04;

    float vignette = smoothstep(1.58, 0.22, length(stageP));
    col *= 0.96 + vignette * 0.08;
    float grain = hash(floor(driftUv * vec2(420.0, 260.0)) + floor(uTime * 5.0));
    col = mix(col, col + (grain - 0.5) * 0.18, 0.38);
    col = clamp(col, vec3(0.0), vec3(1.0));
    col = pow(max(col, vec3(0.0)), vec3(1.03));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const darkSpaceChromeStageFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform float uBeat;
  uniform vec3 uColor;
  uniform vec3 uSecondaryColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = mat2(1.62, -1.18, 1.18, 1.62) * p + 0.27;
      a *= 0.52;
    }
    return v;
  }

  float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  float membrane(vec2 p, float scale, float phase) {
    vec2 q = p * scale;
    q.x += sin(q.y * 1.7 + uTime * 0.18 + phase) * 0.42;
    q.y += sin(q.x * 1.15 - uTime * 0.13 + phase * 1.7) * 0.32;
    float n = fbm(q * 0.46 + vec2(uTime * 0.035, -uTime * 0.025));
    float ridge = abs(sin(q.x * 1.9 + n * 5.8 + phase) + cos(q.y * 1.45 - n * 4.2));
    return smoothstep(1.0, 0.12, ridge);
  }

  float wireGrid(vec2 p, float depth, float warp) {
    vec2 q = p;
    q.x *= 1.0 + depth * 0.8;
    q.y += sin(q.x * 2.2 + uTime * 0.1) * warp;
    float gx = abs(fract(q.x * (4.0 + depth * 5.0)) - 0.5);
    float gy = abs(fract((q.y + depth * 0.35) * (3.2 + depth * 4.0)) - 0.5);
    float line = smoothstep(0.026, 0.0, min(gx, gy) / (1.0 + depth * 1.8));
    return line * smoothstep(1.25, -0.35, abs(q.y));
  }

  float energyPath(vec2 p, float offset) {
    float y = sin(p.x * 1.75 + offset + uTime * 0.22) * 0.32;
    y += sin(p.x * 4.1 - offset * 1.4 - uTime * 0.11) * 0.09;
    float d = abs(p.y - y);
    float core = smoothstep(0.022, 0.0, d);
    float aura = smoothstep(0.24, 0.0, d) * 0.28;
    return core + aura;
  }

  float liquidSheet(vec2 p, float pull) {
    vec2 q = p;
    q.x += sin(q.y * 2.0 + uTime * 0.16) * (0.18 + pull * 0.15);
    q.y += sin(q.x * 1.35 - uTime * 0.13) * (0.14 + pull * 0.1);
    float capsule = sdCapsule(q, vec2(-1.55, -1.05), vec2(1.55, 1.02), 1.05 + pull * 0.18);
    float sidePull = sdCapsule(q, vec2(-1.95, 0.84), vec2(1.95, -0.8), 0.38 + pull * 0.12);
    float container = smoothstep(2.35, 0.18, length(q * vec2(0.64, 0.92)));
    float mass = smoothstep(0.34, -0.22, capsule);
    mass += smoothstep(0.22, -0.08, sidePull) * 0.55;
    mass = max(mass, container * 0.76);
    return clamp(mass, 0.0, 1.0);
  }

  float foldBand(vec2 p, float phase, float audio) {
    vec2 q = p;
    q.x += sin(q.y * 1.8 + phase + uTime * 0.12) * (0.2 + audio * 0.1);
    float wave = sin(q.x * 2.35 + phase + uTime * 0.22) * 0.32;
    wave += sin(q.x * 5.7 - phase - uTime * 0.15) * 0.075;
    float d = abs(q.y - wave);
    return smoothstep(0.22, 0.0, d);
  }

  float metallicRipple(vec2 p, vec2 center, vec2 stretch, float spacing, float width, float phase) {
    vec2 d = (p - center) * stretch;
    float r = length(d);
    float wave = abs(sin(r * spacing - uTime * (0.95 + phase * 0.12) - phase));
    float band = smoothstep(width, 0.0, wave);
    float fade = smoothstep(2.05, 0.12, r) * smoothstep(0.02, 0.38, r);
    return band * fade;
  }

  float rippleCells(vec2 p, vec2 center, vec2 stretch, float spacing, float phase) {
    vec2 d = (p - center) * stretch;
    float r = length(d);
    float angle = atan(d.y, d.x);
    float rings = smoothstep(0.095, 0.0, abs(sin(r * spacing - uTime * 0.72 - phase)));
    float cuts = smoothstep(0.58, 1.0, sin(angle * 18.0 + r * 6.2 + phase + uTime * 0.16) * 0.5 + 0.5);
    float oval = smoothstep(2.0, 0.08, r);
    return rings * cuts * oval;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= 1.72;

    float breathe = sin(uTime * 0.32) * 0.5 + 0.5;
    float slowPulse = sin(uTime * 0.11 + fbm(p * 0.42) * 2.8) * 0.5 + 0.5;
    float audioBreath = breathe * 0.22 + slowPulse * 0.12 + uBass * 0.42 + uMid * 0.12 + uBeat * 0.22;
    vec2 warp = vec2(
      fbm(p * (0.86 + uBass * 0.22) + vec2(uTime * 0.036, -uTime * 0.014)),
      fbm(p * (1.08 + uMid * 0.18) + vec2(-uTime * 0.018, uTime * 0.03))
    ) - 0.5;
    vec2 q = p + warp * (0.42 + audioBreath * 0.72);
    q.x += sin(p.y * 3.4 + uTime * 0.19) * (0.05 + uBass * 0.08);
    q.y += sin(p.x * 2.6 - uTime * 0.15) * (0.045 + uMid * 0.06);

    vec2 rippleP = q;
    rippleP.y *= 1.18;
    rippleP.x += rippleP.y * 0.18;
    float rippleA = metallicRipple(rippleP, vec2(-0.82, -0.52), vec2(1.0, 1.42), 19.0 + uTreble * 4.0, 0.08, 0.4);
    float rippleB = metallicRipple(rippleP, vec2(0.38, -0.88), vec2(0.88, 1.6), 15.5 + uMid * 3.0, 0.075, 2.2);
    float rippleC = metallicRipple(rippleP, vec2(0.06, 0.18), vec2(1.18, 1.22), 23.0 + uBass * 5.0, 0.068, 4.7);
    float cellsA = rippleCells(rippleP, vec2(-0.58, -0.48), vec2(1.05, 1.5), 22.0 + uTreble * 2.0, 0.6);
    float cellsB = rippleCells(rippleP, vec2(0.48, -0.86), vec2(0.92, 1.72), 18.0 + uMid * 3.0, 3.2);
    float rippleField = clamp(rippleA * 0.64 + rippleB * 0.5 + rippleC * 0.42 + cellsA * 0.55 + cellsB * 0.38, 0.0, 1.0);
    q += normalize(vec2(
      sin(rippleP.y * 16.0 + uTime * 0.8),
      cos(rippleP.x * 13.0 - uTime * 0.65)
    )) * rippleField * (0.035 + uBass * 0.025);

    vec3 ink = vec3(0.004, 0.005, 0.007);
    vec3 deepBlue = vec3(0.012, 0.017, 0.026);
    vec3 graphite = vec3(0.006, 0.008, 0.011);
    vec3 mercury = vec3(0.46, 0.50, 0.54);
    vec3 coldWhite = vec3(0.94, 0.98, 1.0);
    vec3 cyan = normalize(uColor + vec3(0.0, 0.18, 0.22)) * 0.34;
    vec3 magenta = normalize(uSecondaryColor + vec3(0.16, 0.0, 0.08)) * 0.26;

    float rear = smoothstep(1.45, 0.0, length(p * vec2(0.58, 0.9)));
    float abyss = smoothstep(1.9, 0.2, length(p * vec2(0.8, 1.05)));
    vec3 col = mix(ink, deepBlue, rear * 0.3);
    col *= 0.34 + abyss * 0.42;

    float sheet = liquidSheet(q, audioBreath);
    float membraneA = membrane(q + vec2(-0.18, 0.06), 1.45 + uBass * 0.18, 0.0);
    float membraneB = membrane(q * vec2(0.72, 1.12) + vec2(0.28, -0.12), 2.05 + uMid * 0.26, 2.4);
    float membraneC = membrane(q * vec2(1.1, 0.84) + vec2(-0.42, 0.18), 2.65 + uTreble * 0.22, 4.8);
    float folds = foldBand(q, 0.2, audioBreath) * 0.42 + foldBand(q.yx * vec2(0.88, 1.12), 3.1, audioBreath) * 0.24;
    float body = clamp(sheet * 1.05 + membraneA * 0.22 + membraneB * 0.18 + membraneC * 0.12 + folds * 0.18 + rippleField * 0.5, 0.0, 1.0);
    float bodySoft = smoothstep(0.02, 0.62, body);
    float edgeTension = smoothstep(0.12, 0.0, abs(sheet - 0.48));

    vec2 normal = vec2(
      fbm(q * (3.0 + uBass * 0.7) + 0.9) - fbm(q * (3.0 + uBass * 0.7) - 0.9),
      fbm(q.yx * (3.1 + uMid * 0.55) + 1.7) - fbm(q.yx * (3.1 + uMid * 0.55) - 1.7)
    );
    normal += vec2(
      rippleA - rippleB + cellsA * 0.5,
      rippleC - rippleA * 0.45 + cellsB * 0.42
    ) * (0.8 + uBass * 0.5);
    float nlen = length(normal) + 0.001;
    normal /= nlen;
    vec2 lightA = normalize(vec2(-0.44, 0.72));
    vec2 lightB = normalize(vec2(0.62, -0.18));
    float specA = pow(max(0.0, dot(normal, lightA)), 4.2);
    float specB = pow(max(0.0, dot(normal, lightB)), 28.0);
    float rim = pow(1.0 - smoothstep(0.08, 1.35 + uBass * 0.18, length(q * vec2(0.66, 1.05))), 2.0);
    float longReflection = smoothstep(0.18, 0.0, abs(sin(q.x * 1.05 + q.y * 2.65 + fbm(q * 0.82) * 3.2 + uTime * 0.12)));
    float bladeReflection = smoothstep(0.055, 0.0, abs(sin(q.x * -2.1 + q.y * 3.8 + fbm(q * 1.4) * 4.5 - uTime * 0.16)));
    float blackFold = smoothstep(0.16, 0.0, abs(sin(q.x * 1.8 - q.y * 2.4 + fbm(q * 1.1) * 5.0 + 1.3)));
    float ringHighlight = smoothstep(0.16, 0.72, rippleField);

    vec3 chrome = graphite;
    chrome = mix(chrome, mercury, bodySoft * (0.62 + sheet * 0.18));
    chrome = mix(chrome, vec3(0.005, 0.006, 0.008), edgeTension * 0.72);
    chrome = mix(chrome, vec3(0.0, 0.0, 0.0), blackFold * bodySoft * 0.56);
    chrome += coldWhite * specA * (0.28 + body * 0.32 + uBass * 0.12);
    chrome += coldWhite * specB * (0.42 + uTreble * 0.34 + uBeat * 0.14);
    chrome += coldWhite * longReflection * bodySoft * (0.26 + uMid * 0.12);
    chrome += coldWhite * bladeReflection * bodySoft * (0.5 + uTreble * 0.18);
    chrome += coldWhite * ringHighlight * (0.18 + uTreble * 0.12 + uBeat * 0.16);
    chrome += cyan * specB * 0.035;
    chrome += cyan * rippleField * 0.035;
    chrome += magenta * rim * bodySoft * 0.028;
    chrome -= vec3(0.25) * edgeTension * (0.35 + uBass * 0.25);
    col = mix(col, chrome, bodySoft * 0.92);

    float nearGrid = wireGrid(q + vec2(0.0, 0.18), 0.55, 0.08);
    float farGrid = wireGrid(q * vec2(0.78, 1.18) + vec2(0.1, -0.1), 1.2, 0.045);
    col += coldWhite * farGrid * 0.012 * (1.0 - sheet * 0.6);
    col += mix(coldWhite, cyan, 0.2) * nearGrid * (0.014 + uTreble * 0.012) * (1.0 - sheet * 0.48);

    float pathA = energyPath(q * vec2(0.88, 1.0) + vec2(-0.22, 0.08), 0.2);
    float pathB = energyPath(q * vec2(1.05, 1.18) + vec2(0.16, -0.34), 2.8);
    float pathC = energyPath(vec2(q.y * 0.78, q.x * 0.72) + vec2(0.12, 0.08), 5.4);
    float flow = pathA * 0.65 + pathB * 0.5 + pathC * 0.34;
    col += mix(coldWhite, cyan, 0.24 + 0.12 * sin(uTime * 0.18)) * flow * (0.02 + uEnergy * 0.026 + uTreble * 0.02);
    col += mix(vec3(1.0, 0.24, 0.08), cyan, smoothstep(-0.75, 0.65, rippleP.x)) * rippleField * (0.022 + uEnergy * 0.018);

    for (int i = 0; i < 30; i++) {
      float fi = float(i);
      vec2 seed = vec2(fi * 23.31, fi * 9.77);
      vec2 c = vec2(hash(seed), hash(seed + 3.0)) * 2.0 - 1.0;
      c.x *= 1.72;
      float z = hash(seed + 8.0);
      c += vec2(
        sin(uTime * (0.045 + z * 0.035) + fi * 1.2),
        cos(uTime * (0.04 + z * 0.03) + fi * 1.7)
      ) * (0.08 + z * 0.18);
      float radius = 0.035 + z * 0.09 + uBass * 0.025;
      float d = length((q - c) / vec2(1.0 + z * 0.8, 0.72 + z * 0.35));
      float orb = smoothstep(radius * 2.9, 0.0, d);
      float shell = smoothstep(radius * 1.45, radius * 0.92, d) * smoothstep(radius * 0.28, radius * 0.92, d);
      float glint = pow(max(0.0, 1.0 - distance((q - c) / max(radius, 0.02), vec2(-0.35, 0.28)) * 0.86), 8.0);
      vec3 orbCol = mix(graphite, mercury, orb * 0.62);
      orbCol += coldWhite * glint * 0.32;
      orbCol += mix(cyan, magenta, hash(seed + 5.0)) * shell * 0.08;
      col = mix(col, orbCol, orb * (0.06 + z * 0.08) * (0.55 + uEnergy * 0.35));
      col += mix(cyan, magenta, z) * shell * 0.014;
    }

    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float d = sdCapsule(
        q,
        vec2(-1.65 + fi * 0.42, -0.92 + sin(fi) * 0.18),
        vec2(-1.0 + fi * 0.5, 0.92 + cos(fi * 1.4) * 0.18),
        0.012 + 0.008 * sin(fi + uTime * 0.2)
      );
      float tendon = smoothstep(0.08, 0.0, abs(d));
      col += mix(cyan, magenta, fract(fi * 0.37)) * tendon * (0.018 + uTreble * 0.012);
    }

    float leak = smoothstep(0.98, 0.45, abs(q.x + sin(q.y * 2.0 + uTime * 0.12) * 0.24)) * smoothstep(1.05, -0.2, abs(q.y));
    leak *= smoothstep(0.68, 1.0, fbm(q * 2.1 - uTime * 0.025));
    leak += edgeTension * smoothstep(0.55, 1.0, fbm(q * 3.6 + uTime * 0.04)) * 0.45;
    col += mix(cyan, magenta, 0.5 + 0.5 * sin(q.y * 2.0 + uTime * 0.2)) * leak * (0.032 + uEnergy * 0.025);

    float scan = sin((uv.y + warp.x * 0.02) * 900.0) * 0.002;
    float grain = hash(floor(uv * vec2(540.0, 320.0)) + floor(uTime * 8.0));
    col += scan + (grain - 0.5) * 0.006;

    float vignette = smoothstep(1.74, 0.16, length(p * vec2(0.9, 1.08)));
    col *= 0.42 + vignette * 0.98;
    col = clamp(col, vec3(0.0), vec3(1.12));
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const pastelRippleStageFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform float uBeat;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float arcBand(vec2 p, vec2 center, vec2 stretch, float spacing, float width, float phase) {
    vec2 d = (p - center) * stretch;
    float r = length(d);
    float a = atan(d.y, d.x);
    float ring = smoothstep(width, 0.0, abs(sin(r * spacing - phase - uTime * (0.16 + uBass * 0.18))));
    float broken = smoothstep(0.2, 0.94, sin(a * 9.5 + r * 2.4 + phase + sin(uTime * 0.13) * 0.6) * 0.5 + 0.5);
    float taper = smoothstep(2.25, 0.1, r) * smoothstep(0.02, 0.32, r);
    return ring * broken * taper;
  }

  float capsuleCell(vec2 p, vec2 center, float angle, vec2 size) {
    float s = sin(angle);
    float c = cos(angle);
    mat2 rot = mat2(c, -s, s, c);
    vec2 q = rot * (p - center);
    vec2 b = abs(q) - size;
    float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
    return smoothstep(0.035, 0.0, abs(d));
  }

  vec3 palette(float h) {
    vec3 pink = vec3(1.0, 0.48, 0.73);
    vec3 lemon = vec3(1.0, 0.96, 0.40);
    vec3 cyan = vec3(0.30, 0.88, 1.0);
    vec3 lavender = vec3(0.78, 0.62, 1.0);
    vec3 coral = vec3(1.0, 0.34, 0.14);
    vec3 col = mix(pink, lemon, smoothstep(0.08, 0.34, h));
    col = mix(col, cyan, smoothstep(0.32, 0.56, h));
    col = mix(col, lavender, smoothstep(0.54, 0.76, h));
    col = mix(col, coral, smoothstep(0.74, 1.0, h));
    return col;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= 0.82;

    float paperNoise = noise(uv * 360.0 + floor(uTime * 2.0));
    float softNoise = noise(uv * 8.0 + vec2(uTime * 0.025, -uTime * 0.018));
    vec3 paper = mix(vec3(0.98, 0.84, 0.87), vec3(0.96, 0.90, 0.80), smoothstep(0.0, 1.0, uv.y));
    paper = mix(paper, vec3(0.90, 0.96, 0.96), smoothstep(0.15, 0.95, softNoise) * 0.24);
    paper += (paperNoise - 0.5) * 0.24;

    vec2 waveP = p;
    waveP.x += sin(p.y * 2.0 + uTime * 0.09) * (0.05 + uBass * 0.035);
    waveP.y += sin(p.x * 2.4 - uTime * 0.08) * (0.04 + uMid * 0.025);

    float a1 = arcBand(waveP, vec2(-0.42, -0.86), vec2(0.84, 1.42), 21.0, 0.078, 0.4);
    float a2 = arcBand(waveP, vec2(0.16, -0.78), vec2(0.9, 1.38), 18.0, 0.075, 2.1);
    float a3 = arcBand(waveP, vec2(-0.18, 0.2), vec2(0.74, 1.2), 19.5, 0.07, 4.2);
    float a4 = arcBand(waveP, vec2(0.52, 0.1), vec2(0.82, 1.3), 17.0, 0.065, 5.7);

    vec3 col = paper;
    col = mix(col, palette(0.12), a1 * 0.62);
    col = mix(col, palette(0.32), a2 * 0.58);
    col = mix(col, palette(0.56), a3 * 0.55);
    col = mix(col, palette(0.74), a4 * 0.5);

    for (int i = 0; i < 92; i++) {
      float fi = float(i);
      float row = floor(fi / 12.0);
      float colId = mod(fi, 12.0);
      vec2 cellBase = vec2(-0.68 + colId * 0.125, -0.48 + row * 0.15);
      cellBase.x += sin(row * 0.7) * 0.08;
      cellBase.y += sin(colId * 0.45) * 0.04;
      vec2 center = cellBase + vec2(sin(uTime * 0.07 + fi) * 0.012, cos(uTime * 0.06 + fi * 1.2) * 0.01);
      float arcWarp = length((center - vec2(-0.25, -0.72)) * vec2(0.7, 1.2));
      center.x += sin(arcWarp * 4.0) * 0.16;
      center.y += cos(arcWarp * 3.2) * 0.08;
      float cell = capsuleCell(waveP, center, -0.08 + arcWarp * 0.22, vec2(0.04 + hash(vec2(fi, 2.0)) * 0.035, 0.018 + hash(vec2(fi, 5.0)) * 0.012));
      float h = fract(fi * 0.137 + row * 0.08);
      vec3 cellCol = palette(h);
      col = mix(col, cellCol, cell * (0.48 + hash(vec2(fi, 9.0)) * 0.3));
    }

    float veilPink = smoothstep(0.1, 0.9, sin((uv.x * 1.8 + uv.y * 2.4 + softNoise) * 2.2) * 0.5 + 0.5);
    float veilCyan = smoothstep(0.35, 1.0, sin((uv.x * -2.3 + uv.y * 1.6 - softNoise) * 2.6) * 0.5 + 0.5);
    col = mix(col, vec3(1.0, 0.67, 0.83), veilPink * 0.16);
    col = mix(col, vec3(0.68, 0.96, 1.0), veilCyan * 0.12);

    float paperBorder = smoothstep(0.0, 0.035, uv.x) * smoothstep(0.0, 0.035, uv.y) * smoothstep(0.0, 0.035, 1.0 - uv.x) * smoothstep(0.0, 0.035, 1.0 - uv.y);
    col = mix(vec3(0.985, 0.955, 0.92), col, paperBorder);
    col = clamp(col, vec3(0.0), vec3(1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const waterCausticStageFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform float uBeat;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = mat2(1.48, -1.18, 1.18, 1.48) * p + 0.31;
      a *= 0.52;
    }
    return v;
  }

  float causticLayer(vec2 p, float scale, float phase, float width) {
    vec2 q = p * scale;
    q.x += sin(q.y * 0.72 + uTime * (0.28 + phase * 0.02)) * (0.55 + uBass * 0.16);
    q.y += cos(q.x * 0.62 - uTime * (0.24 + phase * 0.025)) * (0.45 + uMid * 0.12);

    float l1 = abs(sin(q.x + sin(q.y * 0.72 + phase) * 1.8));
    float l2 = abs(sin(q.y * 0.92 + cos(q.x * 0.64 - phase) * 1.55));
    float l3 = abs(sin((q.x + q.y) * 0.62 + sin(q.x * 0.46 + uTime * 0.18) * 1.6));
    float web = 1.0 - min(min(l1, l2), l3);
    web = pow(max(web, 0.0), 5.8);
    return smoothstep(width, 1.0, web);
  }

  float softBlob(vec2 p, vec2 center, vec2 radius, float phase) {
    vec2 q = (p - center) / radius;
    q.x += sin(q.y * 2.4 + uTime * 0.22 + phase) * 0.08;
    q.y += cos(q.x * 2.0 - uTime * 0.18 + phase) * 0.06;
    return smoothstep(1.0, 0.12, length(q));
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= 0.72;

    float slow = uTime * 0.12;
    vec2 drift = vec2(
      fbm(p * 1.05 + vec2(slow, -slow * 0.6)),
      fbm(p * 1.18 + vec2(-slow * 0.7, slow))
    ) - 0.5;
    vec2 waterP = p + drift * (0.32 + uBass * 0.15);
    waterP.x += sin(p.y * 3.2 + uTime * 0.26) * (0.045 + uBass * 0.035);
    waterP.y += cos(p.x * 2.7 - uTime * 0.22) * (0.04 + uMid * 0.03);

    vec3 deep = vec3(0.015, 0.18, 0.30);
    vec3 blue = vec3(0.02, 0.42, 0.62);
    vec3 aqua = vec3(0.0, 0.76, 0.82);
    vec3 mint = vec3(0.72, 1.0, 0.86);
    vec3 foam = vec3(0.92, 1.0, 0.97);

    float depth = smoothstep(-1.1, 0.95, p.y);
    float volume = fbm(waterP * 1.7 + vec2(uTime * 0.03, -uTime * 0.02));
    vec3 col = mix(deep, blue, 0.48 + depth * 0.24 + volume * 0.22);
    col = mix(col, aqua, smoothstep(0.48, 0.98, volume) * 0.28);

    float ca1 = causticLayer(waterP + vec2(0.0, uTime * 0.018), 7.0, 0.3, 0.18);
    float ca2 = causticLayer(waterP * vec2(1.22, 0.88) + vec2(0.18, -0.08), 10.5, 2.7, 0.22);
    float ca3 = causticLayer(waterP * vec2(0.72, 1.3) - vec2(0.15, 0.12), 5.2, 5.1, 0.16);
    float caustic = clamp(ca1 * 0.74 + ca2 * 0.55 + ca3 * 0.36, 0.0, 1.0);

    float broadWave = smoothstep(0.82, 0.0, abs(sin(waterP.x * 3.0 + waterP.y * 1.2 + uTime * 0.36)));
    float softSheen = smoothstep(0.55, 1.0, fbm(waterP * 2.4 - uTime * 0.04));
    col += aqua * broadWave * 0.08;
    col += mint * caustic * (0.42 + uTreble * 0.12 + uBeat * 0.08);
    col += foam * pow(caustic, 2.1) * (0.3 + uEnergy * 0.16);
    col = mix(col, vec3(0.0, 0.58, 0.65), softSheen * 0.16);

    for (int i = 0; i < 18; i++) {
      float fi = float(i);
      vec2 seed = vec2(fi * 17.3, fi * 9.1);
      vec2 center = vec2(hash(seed), hash(seed + 2.0)) * 2.0 - 1.0;
      center.x *= 0.72;
      center += vec2(sin(uTime * (0.04 + hash(seed) * 0.05) + fi), cos(uTime * (0.05 + hash(seed + 3.0) * 0.04) + fi)) * 0.08;
      float b = softBlob(waterP, center, vec2(0.055 + hash(seed + 5.0) * 0.06, 0.035 + hash(seed + 8.0) * 0.045), fi);
      float rim = smoothstep(0.18, 0.0, abs(b - 0.42));
      col += foam * rim * 0.045;
      col = mix(col, deep * 0.75, b * 0.035);
    }

    float sparkle = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      vec2 seed = vec2(fi * 29.4, fi * 13.7);
      vec2 sp = vec2(hash(seed), hash(seed + 4.0));
      sp += vec2(sin(uTime * 0.08 + fi), cos(uTime * 0.06 + fi * 1.4)) * 0.025;
      float d = distance(uv, sp);
      sparkle += smoothstep(0.018, 0.0, d) * smoothstep(0.22, 1.0, sin(uTime * 1.2 + fi) * 0.5 + 0.5);
    }
    col += foam * sparkle * (0.35 + uTreble * 0.2);

    float edgeLight = smoothstep(1.7, 0.12, length(p * vec2(0.82, 1.02)));
    col = mix(vec3(0.0, 0.36, 0.52), col, 0.82 + edgeLight * 0.18);
    col = clamp(col, vec3(0.0), vec3(1.0));
    col = pow(col, vec3(0.92));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function drawTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number) {
  if (letterSpacing === 0) {
    ctx.fillText(text, x, y);
    return;
  }

  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  const characters = Array.from(text);
  let totalWidth = -letterSpacing;
  for (const char of characters) {
    totalWidth += ctx.measureText(char).width + letterSpacing;
  }

  let currentX = x - totalWidth / 2;
  for (const char of characters) {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + letterSpacing;
  }

  ctx.textAlign = previousAlign;
}

function useTextTexture(text: string, fontSize: number, letterSpacing: number, fontWeight: number) {
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const texture = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);

  useEffect(() => {
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1024, 512);

    // Give it a more aggressive visual look
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 1024, 512);
    
    // Draw the "action" style long horizontal streak trails
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = `italic ${fontWeight} ${Math.round(fontSize * 56)}px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw multiple strokes spreading outwards
    const trailCount = 30;
    for (let i = 0; i < trailCount; i++) {
      const offsetX = Math.pow(i, 1.4) * 8.0;
      ctx.globalAlpha = Math.max(0.0, 1.0 - (i / trailCount));
      drawTextWithLetterSpacing(ctx, text, 512 - offsetX, 280, letterSpacing);
      drawTextWithLetterSpacing(ctx, text, 512 + offsetX, 280, letterSpacing);
    }
    ctx.globalAlpha = 1.0;

    // Draw the core glitchy fill text
    ctx.fillStyle = 'white';
    ctx.font = `italic ${fontWeight} ${Math.round(fontSize * 64)}px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
    drawTextWithLetterSpacing(ctx, text, 512, 280, letterSpacing);

    // Apply minor smearing horizontally on the basic form to bake in some motion blur
    ctx.globalAlpha = 0.3;
    drawTextWithLetterSpacing(ctx, text, 512 - 20, 280, letterSpacing);
    drawTextWithLetterSpacing(ctx, text, 512 + 20, 280, letterSpacing);
    ctx.globalAlpha = 1.0;

    texture.needsUpdate = true;
  }, [text, fontSize, letterSpacing, fontWeight, canvas, texture]);

  return texture;
}

const cyberFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uEnergy;
  uniform vec3 uColor;
  uniform sampler2D tText;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float hash2(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  // 3D grid function
  float drawGrid(vec2 uv, float tilt, float pan) {
      uv.y -= tilt;
      if (uv.y < 0.0) return 0.0; // above horizon
      float z = 1.0 / uv.y;
      vec2 gridUv = vec2(uv.x * z + pan, z - uTime * 3.0);
      float gridX = abs(fract(gridUv.x * 5.0) - 0.5);
      float gridY = abs(fract(gridUv.y * 5.0) - 0.5);
      float lineX = smoothstep(0.08, 0.0, gridX / z * 1.5);
      float lineY = smoothstep(0.08, 0.0, gridY / z * 1.5);
      float line = max(lineX, lineY);
      return line * exp(-z * 0.08); // fade with depth
  }

  void main() {
    vec2 p = vUv;
    
    // Global Block Glitch Displacement
    float sliceY = floor(p.y * 40.0); 
    float offset = hash(sliceY + floor(uTime * 15.0)) * 2.0 - 1.0;
    
    float applyM = step(0.85 - uEnergy*0.5 - uBass*0.3, hash(sliceY * 12.3 + floor(uTime * 8.0)));
    float displacement = offset * 0.2 * applyM * (1.0 + uBass * 1.5);
    
    vec2 pos = p * 2.0 - 1.0;
    
    // Apply glitch directly to global screen coordinates
    pos.x += displacement;
    pos.x += sin(pos.y * 15.0 + uTime * 10.0) * 0.008 * (uEnergy + uBass);

    // Floor & Ceiling Grid
    float floorGrid = drawGrid(pos, -0.3, 0.0);
    float ceilGrid = drawGrid(-pos, -0.3, sin(uTime)*0.5); 
    
    // Add pulsing background elements
    vec3 stageColor = uColor * (0.02 + floorGrid * 0.6 + ceilGrid * 0.3) * (1.0 + uBass * 2.0);
    
    // Distant neon lasers
    float laserId = floor(pos.x * 20.0 + uTime * 2.0);
    float laser = step(0.95, hash(laserId)) * step(0.5, pos.y);
    stageColor += laser * uColor * (0.2 + uEnergy * 0.8) * exp(-abs(pos.y) * 2.0);
    
    vec2 textUv = p;
    textUv.x += displacement;
    textUv.x += sin(textUv.y * 30.0 + uTime * 10.0) * 0.008 * (uEnergy + uBass);
    
    vec4 tex = texture2D(tText, textUv);
    float mask = tex.r;

    // Glitchy RGB split
    float rMask = texture2D(tText, textUv + vec2(0.025 + uBass*0.06, 0.0)).r;
    float bMask = texture2D(tText, textUv - vec2(0.025 + uBass*0.06, 0.0)).r;
    
    // Glow mask for text
    float glowMask = 0.0;
    float gw = 0.01 + uBass * 0.02;
    glowMask += texture2D(tText, textUv + vec2(gw, gw)).r;
    glowMask += texture2D(tText, textUv + vec2(-gw, -gw)).r;
    glowMask += texture2D(tText, textUv + vec2(gw, -gw)).r;
    glowMask += texture2D(tText, textUv + vec2(-gw, gw)).r;
    glowMask += texture2D(tText, textUv + vec2(gw*2.0, 0.0)).r;
    glowMask += texture2D(tText, textUv + vec2(-gw*2.0, 0.0)).r;
    glowMask /= 6.0;
    glowMask = smoothstep(0.1, 0.6, glowMask); 
    
    vec3 glowColor = uColor; // Preset base color
    
    vec3 finalCol = stageColor;
    
    // Add text and glow
    if (glowMask > 0.05) {
       finalCol = mix(finalCol, glowColor * (1.5 + uBass * 3.0), glowMask);
    }

    // Text Inner fill (scanlines)
    float stripe = step(0.5, fract(textUv.y * 60.0 - uTime * 15.0));
    vec3 textFill = mix(vec3(0.0, 0.0, 0.1), vec3(0.9, 1.0, 1.0), stripe);
    
    if (mask > 0.5) {
       finalCol = mix(glowColor, textFill, 0.85); 
    }

    // Chromatic aberration fringes for the glitch
    if (applyM > 0.0 && rMask > 0.5 && mask < 0.5) finalCol += vec3(1.0, 0.1, 0.4); 
    if (applyM > 0.0 && bMask > 0.5 && mask < 0.5) finalCol += vec3(0.1, 0.5, 1.0); 
    
    // Global aberration on the stage when glitch happens
    if (applyM > 0.0) {
        float bFloor = drawGrid(pos - vec2(0.05, 0.0), -0.3, 0.0);
        float rFloor = drawGrid(pos + vec2(0.05, 0.0), -0.3, 0.0);
        finalCol += vec3(rFloor * 0.5, 0.0, bFloor * 0.5) * uColor;
    }

    // Global VFX: Screen static & Scanlines
    float vignette = length(p * 2.0 - 1.0);
    finalCol *= smoothstep(2.0, 0.5, vignette);
    
    float screenScanline = sin(pos.y * 800.0) * 0.05 + 0.95;
    finalCol *= screenScanline;
    
    float noise = hash2(pos + uTime * 10.0) - 0.5;
    finalCol += noise * 0.1 * (1.0 + uEnergy * 2.0);

    // Hard clip color
    finalCol = min(finalCol, 1.5);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

function VoidScene() {
  const { baseColor, secondaryColor, speed } = useStore();
  const stageMatRef = useRef<THREE.ShaderMaterial>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  
  const [positions, seeds] = useMemo(() => {
    const count = 320;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for(let i=0; i<count; i++) {
      const layer = Math.random();
      const depth = Math.pow(layer, 1.6);
      pos[i*3] = (Math.random() - 0.5) * (9 + depth * 16);
      pos[i*3+1] = (Math.random() - 0.5) * (5.4 + depth * 8.5);
      pos[i*3+2] = -1.8 - depth * 17;
      seed[i] = Math.random() * 1000;
    }
    return [pos, seed];
  }, []);

  useFrame((state, delta) => {
    if(!stageMatRef.current) return;
    const { subBass, bass, mid, treble, energy, beat } = getReactiveAudio();
    
    stageMatRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    stageMatRef.current.uniforms.uBass.value = bass;
    stageMatRef.current.uniforms.uMid.value = mid;
    stageMatRef.current.uniforms.uTreble.value = treble;
    stageMatRef.current.uniforms.uEnergy.value = energy;
    stageMatRef.current.uniforms.uBeat.value = beat;
    stageMatRef.current.uniforms.uColor.value.set(baseColor);
    stageMatRef.current.uniforms.uSecondaryColor.value.set(secondaryColor);

    if(!materialRef.current || !pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.03 * speed * (1 + beat * 2.0 + subBass);
    pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.08 * (1 + bass);
    
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    materialRef.current.uniforms.uSubBass.value = subBass;
    materialRef.current.uniforms.uBass.value = bass;
    materialRef.current.uniforms.uMid.value = mid;
    materialRef.current.uniforms.uEnergy.value = energy;
    materialRef.current.uniforms.uBeat.value = beat;
    materialRef.current.uniforms.uColor.value.set(baseColor);
    materialRef.current.uniforms.uSecondaryColor.value.set(secondaryColor);
    
    pointsRef.current.scale.setScalar(1.0 + beat * 0.08 + energy * 0.05);
  });

  return (
    <group>
      <mesh position={[0, 0, -9]}>
        <planeGeometry args={[34, 22]} />
        <shaderMaterial
          ref={stageMatRef}
          vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={waterCausticStageFragment}
          uniforms={{
            uTime: { value: 0 },
            uBass: { value: 0 },
            uMid: { value: 0 },
            uTreble: { value: 0 },
            uEnergy: { value: 0 },
            uBeat: { value: 0 },
            uColor: { value: new THREE.Color(baseColor) },
            uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          }}
          depthWrite={false}
        />
      </mesh>
      {false && <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aSeed" count={seeds.length} array={seeds} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial 
          ref={materialRef}
          vertexShader={voidVertex}
          fragmentShader={voidFragment}
          uniforms={{
            uTime: { value: 0 },
            uSubBass: { value: 0 },
            uBass: { value: 0 },
            uMid: { value: 0 },
            uEnergy: { value: 0 },
            uBeat: { value: 0 },
            uColor: { value: new THREE.Color(baseColor) },
            uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          }}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>}
    </group>
  );
}

// 2. LIQUID SCENE (Ultra smooth fbm flows)
const liquidFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uLowMid;
  uniform float uEnergy;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  
  float smin(float a, float b, float k) {
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
  }
  
  float sdCircle(vec2 p, float r) { return length(p) - r; }
  
  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  }
  
  mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

  float waveBand(vec2 p, float offset, float amp, float freq, float phase, float width) {
    float y = offset
      + sin(p.x * freq + phase) * amp
      + sin(p.x * (freq * 0.48) - phase * 0.76) * amp * 0.55
      + sin(p.x * (freq * 1.9) + phase * 0.35) * amp * 0.16;
    return abs(p.y - y) - width;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.5; // aspect ratio approximation

    float t = uTime * (0.62 + uEnergy * 0.18);
    float pulse = 0.5 + 0.5 * sin(t * 1.55 + uBass * 1.6);
    float grit = noise(p * 5.0 + vec2(t * 0.35, -t * 0.24));

    // Acid-fluid displacement: keeps the original palette, but gives the edge more restless motion.
    p += vec2(
      sin(p.y * 4.2 + t * 1.45) + sin((p.x + p.y) * 3.1 - t * 0.9),
      cos(p.x * 3.4 - t * 1.1) + sin((p.x - p.y) * 2.8 + t * 1.35)
    ) * (0.02 + uEnergy * 0.035);
    p += (grit - 0.5) * (0.018 + uLowMid * 0.024);

    float d = 100.0;

    // Long liquid ribbons, tuned for acid-neon wave motion.
    d = smin(d, waveBand(p, 0.30, 0.23 + uBass * 0.08, 2.7, t * 1.05, 0.105 + uEnergy * 0.025), 0.19);
    d = smin(d, waveBand(p, -0.42, 0.20 + uLowMid * 0.08, 3.15, -t * 0.92 + 1.6, 0.092 + uBass * 0.03), 0.17);
    d = smin(d, waveBand(p, -0.04, 0.16 + uEnergy * 0.06, 4.4, t * 1.42 + 2.2, 0.048), 0.13);

    // Blob 1: Center pulsing
    d = smin(d, sdCircle(p - vec2(-0.28, -0.18), 0.32 + uBass * 0.13), 0.22);
    
    // Blob 2: Orbiting fast
    vec2 pos2 = vec2(sin(t * 1.5), cos(t * 1.5)) * 0.5;
    d = smin(d, sdCircle(p - pos2, 0.17 + uLowMid * 0.12), 0.22);
    
    // Blob 3: Figure 8
    vec2 pos3 = vec2(sin(t * 0.8) * 0.8, sin(t * 1.6) * 0.4);
    d = smin(d, sdBox((p - pos3) * rot(sin(t) * 0.55), vec2(0.18, 0.24)), 0.28);
    
    // Blob 4: Random drift
    vec2 pos4 = vec2(cos(t * 0.5) * 0.6, sin(t * 0.7) * 0.6);
    d = smin(d, sdCircle(p - pos4, 0.2 + pulse * 0.04), 0.2);

    // Inner Cutout / Negative Space (creates hollow organic shapes like letters)
    float d_hole = sdCircle(p - vec2(sin(t), cos(t*1.2)) * 0.2, 0.14 + uEnergy*0.1);
    d_hole = smin(d_hole, waveBand(p, -0.08, 0.12 + uBass * 0.04, 3.6, -t * 1.2, 0.035), 0.1);
    d = max(d, -d_hole); // subtract hole

    // Rendering
    // Background: Mauvey Pink #A8828C
    vec3 bgCol = vec3(0.66, 0.51, 0.55);
    
    // Colors for the shapes
    vec3 innerCol = vec3(0.0, 0.0, 0.0); // Inside is Black
    
    // Stroke / Outlines
    // We want a bright yellow/green core outline, and a purple outer outline
    float outlineWidth = 0.016 + uEnergy * 0.012 + pulse * 0.003;
    
    // Create the contour logic
    float fill = smoothstep(0.0, -0.012, d);             // 1 if inside, 0 if outside
    float edgeDistance = abs(d);
    float strokeCore = 1.0 - smoothstep(0.0, outlineWidth, edgeDistance);
    float strokeHot = 1.0 - smoothstep(outlineWidth * 0.75, outlineWidth * 2.8, edgeDistance);
    float strokeOuter = 1.0 - smoothstep(outlineWidth * 1.8, 0.22 + uBass * 0.08, edgeDistance);
    float ripple = 0.5 + 0.5 * sin(edgeDistance * 36.0 - t * 3.4 + grit * 1.6);
    
    vec3 neonYellow = vec3(0.8, 1.0, 0.0);
    vec3 neonPurple = vec3(0.4, 0.0, 1.0);
    
    vec3 col = mix(bgCol, innerCol, fill);
    col += bgCol * (grit - 0.5) * 0.09;
    
    // Add strokes
    col = mix(col, neonPurple, strokeOuter * (0.5 + ripple * 0.1));
    col = mix(col, mix(neonYellow, neonPurple, 0.18), strokeHot * (0.42 + uEnergy * 0.08));
    col = mix(col, neonYellow, strokeCore);
    col += neonPurple * strokeOuter * strokeOuter * (0.16 + uBass * 0.32);
    col += neonYellow * strokeCore * (0.28 + pulse * 0.12);
    col *= 0.99 + sin(vUv.y * 420.0 + t * 1.6) * 0.008;
    
    gl_FragColor = vec4(col, 1.0);
  }
`;

function LiquidScene() {
  const { speed } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const liquidTimeRef = useRef(0);
  const liquidSpeedRef = useRef(0.16);
  const liquidSurgeRef = useRef(0);
  
  useFrame((_, delta) => {
    if(!materialRef.current) return;
    const { volume, bass, lowMid, energy, beat, treble } = getReactiveAudio();
    const spectralFlux = Math.max(treble, beat * 0.5);
    const transient = beat;
    const audioLift = volume * 0.36 + energy * 0.42 + bass * 0.55 + lowMid * 0.22;
    const targetSurge = beat * 0.95 + transient * 0.62 + spectralFlux * 0.42;
    liquidSurgeRef.current += (targetSurge - liquidSurgeRef.current) * 0.065;

    const targetSpeed = 0.11 + audioLift + liquidSurgeRef.current;
    const follow = targetSpeed > liquidSpeedRef.current ? 0.055 : 0.03;
    liquidSpeedRef.current += (targetSpeed - liquidSpeedRef.current) * follow;
    liquidTimeRef.current += delta * liquidSpeedRef.current * Math.max(0.25, speed);

    const uniforms = materialRef.current.uniforms;
    uniforms.uTime.value = liquidTimeRef.current;
    uniforms.uBass.value += (bass - uniforms.uBass.value) * 0.075;
    uniforms.uLowMid.value += (lowMid - uniforms.uLowMid.value) * 0.07;
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * 0.06;
  });

  return (
    <mesh position={[0,0,-2]} scale={[40, 20, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial 
        ref={materialRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={liquidFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uLowMid: { value: 0 },
          uEnergy: { value: 0 }
        }}
        depthWrite={false}
      />
    </mesh>
  );
}

// 3. CYBER GRID (Perspective lines and glitching geometry)
function CyberScene() {
  const { speed, baseColor, textInput, textFontSize, textLetterSpacing, textFontWeight } = useStore();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  
  const textTexture = useTextTexture(textInput, textFontSize, textLetterSpacing, textFontWeight);
  
  useFrame((state) => {
    if(!matRef.current) return;
    const { bass, energy } = getReactiveAudio();
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    matRef.current.uniforms.uBass.value = bass;
    matRef.current.uniforms.uEnergy.value = energy;
    matRef.current.uniforms.uColor.value.set(baseColor);
    matRef.current.uniforms.tText.value = textTexture;
  });

  return (
    <mesh position={[0,0,-1]}>
      <planeGeometry args={[24, 12]} />
      <shaderMaterial 
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={cyberFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uEnergy: { value: 0 },
          uColor: { value: new THREE.Color() },
          tText: { value: null }
        }}
        transparent={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// Dynamic Type / Sonic Topology scene adapted for the VJ stage.
const topologyFragment = `
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform float uThickness;
  uniform float uAmplitude;
  uniform float uSpeed;
  uniform float uAudio;
  uniform float uLiquify;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uFrequency;
  uniform float uAspect;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = (uv - 0.5) * vec2(uAspect, 1.0);
    float currentSpeed = uSpeed + uAudio * 2.0;
    float currentAmp = uAmplitude + uAudio * 0.2;

    float liquifyScale = 1.2 + uLiquify * 5.5;
    float t = uTime * currentSpeed;
    float noiseX = noise(uv * liquifyScale + vec2(t * 0.22, -t * 0.17));
    float noiseY = noise(uv * liquifyScale + vec2(19.7 - t * 0.15, 11.3 + t * 0.2));
    vec2 distortedUV = uv + vec2(noiseX, noiseY) * currentAmp;

    float d = texture2D(uTexture, distortedUV).r;
    float bgNoise = max(0.0, noise(uv * 2.1 + uTime * 0.08));
    vec3 bg = uColor2 * bgNoise * (0.025 + uAudio * 0.18);

    if (d < 0.005) {
      float dust = step(0.988, hash(floor(uv * vec2(180.0, 95.0)) + floor(uTime * 6.0)));
      gl_FragColor = vec4(bg + dust * uColor1 * 0.08 * uAudio, 1.0);
      return;
    }

    float rings = fract(d * uFrequency - t * 1.8);
    float width = uThickness * 0.5;
    float lineAlpha = smoothstep(0.5 - width - 0.055, 0.5 - width, rings)
                    - smoothstep(0.5 + width, 0.5 + width + 0.055, rings);
    float mask = smoothstep(0.01, 0.16, d);
    float edge = smoothstep(0.02, 0.25, d) * (1.0 - smoothstep(0.72, 1.0, d));
    lineAlpha *= mask;

    vec3 contour = mix(uColor1, uColor2, clamp(uAudio * 1.4 + (1.0 - d), 0.0, 1.0));
    vec3 glow = uColor2 * mask * d * clamp(0.25 + uAudio, 0.25, 1.0) * 0.55;
    vec3 whiteCore = vec3(1.0) * smoothstep(0.82, 1.0, d) * (0.12 + uAudio * 0.2);
    vec3 finalColor = bg + contour * lineAlpha + glow + whiteCore;

    finalColor += uColor1 * edge * 0.08 * (0.5 + uAudio);
    finalColor *= smoothstep(1.45, 0.25, length(center));
    finalColor *= 0.96 + sin(vUv.y * 900.0) * 0.04;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function useTopologyTexture(text: string, blurIntensity: number) {
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }, [canvas]);

  useEffect(() => {
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayText = text.toUpperCase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.filter = `blur(${Math.max(1, blurIntensity * 80)}px)`;

    let fontSize = 520;
    do {
      ctx.font = `900 ${fontSize}px Inter, Arial Black, system-ui, sans-serif`;
      fontSize -= 16;
    } while (ctx.measureText(displayText).width > canvas.width * 1.22 && fontSize > 160);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(1.28, 1.0);
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    ctx.fillText(displayText, 0, 0);

    texture.needsUpdate = true;
  }, [text, blurIntensity, canvas, texture]);

  return texture;
}

function TopologyScene() {
  const { speed, chaos, distortion, textInput, baseColor, secondaryColor, bloomIntensity } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const texture = useTopologyTexture(textInput, 0.35 + distortion * 0.25);
  const { size } = useThree();

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const { energy, beat, bass, treble } = getReactiveAudio();
    const audio = Math.min(1.35, energy * 0.85 + beat * 0.65 + bass * 0.35 + treble * 0.2);
    const uniforms = materialRef.current.uniforms;
    uniforms.uTime.value += delta;
    uniforms.uTexture.value = texture;
    uniforms.uAudio.value += (audio - uniforms.uAudio.value) * 0.12;
    uniforms.uThickness.value = 0.1 + Math.min(0.28, bloomIntensity * 0.025 + beat * 0.08);
    uniforms.uAmplitude.value = 0.08 + distortion * 0.28 + chaos * 0.16;
    uniforms.uSpeed.value = 0.65 + speed * 0.75;
    uniforms.uLiquify.value = 0.42 + chaos * 0.55 + bass * 0.2;
    uniforms.uFrequency.value = 18 + chaos * 18 + treble * 8;
    uniforms.uAspect.value = size.width / Math.max(size.height, 1);
    uniforms.uColor1.value.set(baseColor);
    uniforms.uColor2.value.set(secondaryColor);
  });

  return (
    <mesh position={[0, 0, -1]}>
      <planeGeometry args={[24, 12]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={topologyFragment}
        uniforms={{
          uTime: { value: 0 },
          uTexture: { value: texture },
          uThickness: { value: 0.15 },
          uAmplitude: { value: 0.12 },
          uSpeed: { value: 1 },
          uAudio: { value: 0 },
          uLiquify: { value: 0.5 },
          uColor1: { value: new THREE.Color(baseColor) },
          uColor2: { value: new THREE.Color(secondaryColor) },
          uFrequency: { value: 20 },
          uAspect: { value: size.width / Math.max(size.height, 1) },
        }}
        transparent={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// 4. PULSE SCENE (Aggressive Bass Stage)
const pulseFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uBeat;
  uniform float uTreble;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // 3D grid function
  float drawGrid(vec2 uv, float tilt, float pan) {
      uv.y -= tilt;
      if (uv.y < 0.0) return 0.0;
      float z = 1.0 / uv.y;
      vec2 gridUv = vec2(uv.x * z + pan, z - uTime * (5.0 + uBass * 10.0));
      float gridX = abs(fract(gridUv.x * 5.0) - 0.5);
      float gridY = abs(fract(gridUv.y * 5.0) - 0.5);
      float lineX = smoothstep(0.1, 0.0, gridX / z * 1.5);
      float lineY = smoothstep(0.1, 0.0, gridY / z * 1.5);
      float line = max(lineX, lineY);
      return line * exp(-z * 0.06);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    
    // Beat shaking
    p.y += sin(uTime * 30.0) * 0.02 * uBeat;
    p.x += cos(uTime * 25.0) * 0.02 * uBeat;

    // Floor & Ceiling Grid
    float floorGrid = drawGrid(p, -0.4 + uBass * 0.05, 0.0);
    float ceilGrid = drawGrid(-p, -0.4 + uBass * 0.05, sin(uTime) * 0.2); 
    
    // Background pulsing flash
    vec3 pulseColor = mix(uColor, vec3(1.0, 0.1, 0.5), uBeat);
    vec3 stageColor = pulseColor * (0.05 + floorGrid * (1.0 + uBass*2.0) + ceilGrid * (1.0 + uBass*2.0));
    
    // V-shaped light beams hitting the center stage
    float beamMask = max(0.0, 1.0 - abs(p.x * 2.0 - p.y) * 2.0) + max(0.0, 1.0 - abs(p.x * -2.0 - p.y) * 2.0);
    stageColor += pulseColor * beamMask * 0.1 * (1.0 + uBass * 4.0) * exp(-abs(p.y)*2.0);

    // Laser strobe
    float laserId = floor(p.x * 8.0 + uTime * 6.0);
    float laser = step(0.9, hash(vec2(laserId, floor(uTime*12.0)))) * step(0.0, p.y + 0.3);
    stageColor += laser * pulseColor * (0.8 + uBass * 3.0) * exp(-abs(p.y) * 2.0);

    // Vignette
    float vignette = length(p);
    stageColor *= smoothstep(2.5, 0.3, vignette);
    
    // Screen scanlines
    float scanline = sin(vUv.y * 800.0) * 0.04 + 0.96;
    stageColor *= scanline;
    
    // Aggressive noise based on bass
    float noise = hash(p * 123.0 + uTime) - 0.5;
    stageColor += noise * 0.2 * (1.0 + uBass * 3.0);

    gl_FragColor = vec4(stageColor, 1.0);
  }
`;

function PulseScene() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor } = useStore();

  useFrame((state) => {
    if(!matRef.current) return;
    const { bass, treble, beat } = getReactiveAudio();
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uBass.value = bass;
    matRef.current.uniforms.uBeat.value = beat;
    matRef.current.uniforms.uTreble.value = treble;
    matRef.current.uniforms.uColor.value.set(baseColor);
  });

  return (
    <mesh position={[0,0,-3]}>
      <planeGeometry args={[22, 12]} />
      <shaderMaterial 
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={pulseFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uBeat: { value: 0 },
          uTreble: { value: 0 },
          uColor: { value: new THREE.Color() }
        }}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

const glassTextVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glassTextFragment = `
  uniform sampler2D uText;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBeat;
  uniform float uBass;
  uniform float uChaos;
  uniform float uFlowTime;
  uniform float uPaintTime;
  uniform vec2 uGlassMotion;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  vec4 sampleText(vec2 uv) {
    vec4 tex = texture2D(uText, uv);
    return vec4(vec3(tex.r), max(tex.a, tex.r));
  }

  void main() {
    vec2 uv = vUv;
    vec2 motionUv = uv + uGlassMotion * (0.018 + uBass * 0.018 + uBeat * 0.012);
    vec2 aspectUv = vec2(motionUv.x, motionUv.y * 1.18);
    vec2 grid = vec2(11.0, 7.0);
    vec2 tile = floor(aspectUv * grid);
    vec2 cell = fract(aspectUv * grid);
    vec2 center = cell - 0.5;

    float id = hash(tile);
    float id2 = hash(tile + 19.37);
    float id3 = hash(tile + 51.91);
    float t = uTime * (0.35 + id * 0.22);
    vec2 tileMotion = vec2(
      sin(uTime * (0.7 + id * 0.4) + id2 * 6.283),
      cos(uTime * (0.62 + id3 * 0.38) - id * 6.283)
    ) * (uEnergy * 0.055 + uBass * 0.045 + uBeat * 0.035);
    center += tileMotion;
    float roundedBox = max(abs(center.x), abs(center.y));
    float edge = smoothstep(0.49, 0.43, roundedBox);
    float border = 1.0 - smoothstep(0.42, 0.49, roundedBox);

    float swirl = sin(center.x * (7.0 + id * 10.0) + t + id2 * 6.283)
                * cos(center.y * (8.0 + id3 * 9.0) - t * 1.3);
    float localNoise = noise(tile * 1.7 + cell * (2.0 + id * 3.0) + uTime * 0.06);
    vec2 lens = normalize(center + 0.001) * (0.018 + id * 0.045);
    lens += vec2(swirl, localNoise - 0.5) * (0.035 + uEnergy * 0.06 + uBass * 0.05);
    lens += center * (0.05 + id2 * 0.09 + uBeat * 0.06);

    vec2 seamWarp = vec2(
      sin(tile.y * 1.73 + uTime * 0.2),
      cos(tile.x * 1.47 - uTime * 0.16)
    ) * (0.008 + uChaos * 0.018);
    vec2 refractedUv = uv + (lens + seamWarp) * edge;
    vec4 textBehind = sampleText(refractedUv);
    vec4 textGhost = sampleText(uv + vec2(localNoise - 0.5, swirl) * 0.012);

    vec3 bg = vec3(0.018, 0.018, 0.02);
    vec3 textColor = vec3(0.82, 0.82, 0.8) * textBehind.a;
    textColor += vec3(0.24) * textGhost.a * (1.0 - edge);

    float grey = mix(0.2, 0.76, id);
    grey += (localNoise - 0.5) * 0.18;
    grey += uEnergy * 0.08 + uBeat * 0.08;
    vec3 glass = vec3(grey);

    float innerShade = smoothstep(0.0, 0.55, length(center));
    float whiteCore = smoothstep(0.45, 0.02, length(center * vec2(1.05, 0.86)));
    float highlight = smoothstep(0.055, 0.0, abs(center.x - 0.18 - id * 0.18))
                    + smoothstep(0.055, 0.0, abs(center.y - 0.28 + id2 * 0.16));
    highlight *= 0.16 + id3 * 0.26;

    vec3 neonA = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + uFlowTime * 1.2 + id * 6.283);
    vec3 neonB = 0.5 + 0.5 * cos(vec3(3.1, 0.8, 5.4) + uTime * 2.0 - id2 * 6.283 + swirl * 2.5);
    vec3 neon = mix(neonA, neonB, 0.45 + 0.35 * sin(uTime + id3 * 6.283));

    vec2 paintUv = center * (2.4 + id * 2.2);
    paintUv += vec2(
      sin(uPaintTime * (0.42 + id * 0.18) + id2 * 6.283),
      cos(uPaintTime * (0.34 + id3 * 0.2) - id * 6.283)
    );
    float paintA = noise(paintUv + vec2(uPaintTime * 0.18, -uPaintTime * 0.11));
    float paintB = noise(paintUv * 1.9 + vec2(-uPaintTime * 0.09, uPaintTime * 0.16) + tile * 0.23);
    float paintMask = smoothstep(0.32, 0.86, paintA * 0.68 + paintB * 0.5);
    paintMask *= smoothstep(0.52, 0.12, length(center));
    vec3 paintColor = 0.5 + 0.5 * cos(vec3(0.2, 2.4, 4.7) + paintA * 5.8 + paintB * 2.4 + id * 6.283);

    float edgeGlow = smoothstep(0.24, 0.5, roundedBox) * edge;
    float gapX = min(cell.x, 1.0 - cell.x);
    float gapY = min(cell.y, 1.0 - cell.y);
    float seamDistance = min(gapX, gapY);
    float seam = smoothstep(0.025, 0.0, seamDistance);
    float verticalSeam = smoothstep(0.026, 0.0, gapX);
    float horizontalSeam = smoothstep(0.026, 0.0, gapY);
    float verticalFlow = smoothstep(0.12, 0.0, abs(fract(cell.y * 3.2 + tile.x * 0.13 - uFlowTime * (0.85 + id * 0.8)) - 0.5));
    float horizontalFlow = smoothstep(0.12, 0.0, abs(fract(cell.x * 3.2 + tile.y * 0.17 + uFlowTime * (0.72 + id2 * 0.9)) - 0.5));
    float seamFlow = max(verticalSeam * verticalFlow, horizontalSeam * horizontalFlow);
    float seamSpark = seam * smoothstep(0.7, 1.0, noise(tile * 2.1 + vec2(uFlowTime * 0.8, -uFlowTime * 0.55)));

    vec3 col = bg;
    col += textColor * (0.55 + edge * 0.85);
    col = mix(col, glass, 0.34 * edge);
    col += paintColor * paintMask * edge * (0.18 + uEnergy * 0.16);
    col = mix(col, vec3(1.0), whiteCore * 0.42 * edge);
    col += neon * edgeGlow * 0.12;
    col += neon * seamFlow * (0.92 + uBeat * 0.75);
    col += vec3(1.0) * seamFlow * 0.32;
    col += neon * seamSpark * (0.24 + uEnergy * 0.5);
    col += vec3(0.18) * innerShade * edge;
    col += vec3(0.55) * highlight * edge;
    col -= vec3(0.12) * seam;
    col += vec3(0.18) * border * edge;

    float vignette = smoothstep(0.95, 0.25, length(uv - 0.5));
    col *= 0.72 + vignette * 0.5;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const foregroundRippleTextFragment = `
  uniform sampler2D uText;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBeat;
  uniform vec3 uTextColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float wave = sin((uv.y * 18.0 + center.x * 4.0) - uTime * (2.4 + uEnergy * 2.2));
    float ripple = sin(length(center * vec2(1.45, 0.9)) * 42.0 - uTime * (4.0 + uBeat * 3.0));
    float slice = floor(uv.y * 42.0);
    float jitter = (hash(vec2(slice, floor(uTime * 16.0))) - 0.5) * 0.018 * (0.35 + uEnergy + uBeat);
    vec2 scanUv = uv + vec2((wave * 0.012 + ripple * 0.008 + jitter), 0.0);

    vec4 text = texture2D(uText, scanUv);
    float mask = max(text.r, text.a);
    float scanLine = smoothstep(0.0, 0.04, abs(fract(uv.y * 18.0 - uTime * (0.9 + uEnergy)) - 0.5));
    float edgeNoise = hash(floor(uv * vec2(420.0, 210.0)) + floor(uTime * 8.0));
    float grain = step(0.965 - uEnergy * 0.04, edgeNoise);

    vec3 uvA = vec3(uv.x, uv.y, uv.x);
    vec3 uvB = vec3(uv.y, uv.x, uv.y);
    vec3 neonA = 0.5 + 0.5 * cos(vec3(0.0, 2.2, 4.4) + uTime * 1.8 + uvA * vec3(8.0, 5.0, 7.0));
    vec3 neonB = 0.5 + 0.5 * cos(vec3(3.1, 0.7, 5.2) - uTime * 1.25 + ripple * 2.2 + uvB * vec3(6.0, 9.0, 4.0));
    vec3 neon = mix(neonA, neonB, 0.45 + 0.35 * wave);
    neon = mix(uTextColor, neon, 0.62);
    vec3 hotCore = mix(uTextColor, neon, 0.72);
    vec3 core = hotCore * mask * (0.9 + uEnergy * 0.24);
    vec3 glow = neon * mask * (0.42 + uEnergy * 0.55 + uBeat * 0.55);
    vec3 scan = mix(vec3(1.0), neon, 0.82) * mask * (1.0 - scanLine) * 0.55;
    vec3 col = core + glow + scan + neon * grain * mask * 0.45;
    float alpha = clamp(mask * (0.7 + uEnergy * 0.28) + grain * mask * 0.25, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

function RandomGlassBlocksScene() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const foregroundTextRef = useRef<THREE.ShaderMaterial>(null);
  const flowTimeRef = useRef(0);
  const paintTimeRef = useRef(0);
  const mouseMotionRef = useRef(new THREE.Vector2(0, 0));
  const { textInput, textColor, textFontSize, textLetterSpacing, textFontWeight, speed, chaos } = useStore();
  const displayText = (textInput || 'NEONPULSE').toUpperCase();
  const textTexture = useCleanTextTexture(displayText, false, textFontSize * 1.25, textLetterSpacing, textFontWeight);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const { energy, beat, bass } = getReactiveAudio();
    const uniforms = materialRef.current.uniforms;
    const tempoDrive = 0.8 + energy * 4.2 + bass * 2.8 + beat * 7.5;
    flowTimeRef.current += delta * tempoDrive * Math.max(0.35, speed);
    paintTimeRef.current += delta * (0.55 + energy * 0.7 + bass * 0.45) * Math.max(0.35, speed);

    uniforms.uText.value = textTexture;
    uniforms.uTime.value = state.clock.elapsedTime * speed;
    uniforms.uFlowTime.value = flowTimeRef.current;
    uniforms.uPaintTime.value = paintTimeRef.current;
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * 0.12;
    uniforms.uBeat.value += (beat - uniforms.uBeat.value) * 0.2;
    uniforms.uBass.value += (bass - uniforms.uBass.value) * 0.14;
    uniforms.uChaos.value = chaos;
    mouseMotionRef.current.lerp(state.pointer, 0.08);
    const performanceAmount = 0.75 + chaos * 0.35;
    const mouseAmount = 0.75 + chaos * 0.25;
    uniforms.uGlassMotion.value.set(
      mouseMotionRef.current.x * mouseAmount + Math.sin(state.clock.elapsedTime * 0.9 * speed) * (0.22 + bass * 0.5 + beat * 0.35) * performanceAmount,
      mouseMotionRef.current.y * mouseAmount + Math.cos(state.clock.elapsedTime * 0.72 * speed) * (0.18 + energy * 0.45 + beat * 0.28) * performanceAmount
    );

    if (foregroundTextRef.current) {
      foregroundTextRef.current.uniforms.uText.value = textTexture;
      foregroundTextRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
      foregroundTextRef.current.uniforms.uEnergy.value += (energy - foregroundTextRef.current.uniforms.uEnergy.value) * 0.14;
      foregroundTextRef.current.uniforms.uBeat.value += (beat - foregroundTextRef.current.uniforms.uBeat.value) * 0.22;
      foregroundTextRef.current.uniforms.uTextColor.value.set(textColor);
    }
  });

  return (
    <group>
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[24, 13]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={glassTextVertex}
          fragmentShader={glassTextFragment}
          uniforms={{
            uText: { value: textTexture },
            uTime: { value: 0 },
            uEnergy: { value: 0 },
            uBeat: { value: 0 },
            uBass: { value: 0 },
            uChaos: { value: chaos },
            uFlowTime: { value: 0 },
            uPaintTime: { value: 0 },
            uGlassMotion: { value: new THREE.Vector2(0, 0) },
          }}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 1.2]}>
        <planeGeometry args={[18, 9]} />
        <shaderMaterial
          ref={foregroundTextRef}
          vertexShader={glassTextVertex}
          fragmentShader={foregroundRippleTextFragment}
          uniforms={{
            uText: { value: textTexture },
            uTime: { value: 0 },
            uEnergy: { value: 0 },
            uBeat: { value: 0 },
            uTextColor: { value: new THREE.Color(textColor) },
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// === ROUTER ===
function SceneRouter({ sceneOverride }: { sceneOverride?: string }) {
  const { currentScene } = useStore();
  const scene = sceneOverride || currentScene;
  switch(scene) {
    case 'Cyber': return <CyberScene />;
    case 'Topology': return <TopologyScene />;
    case 'Liquid': return <LiquidScene />;
    case 'Pulse': return <PulseScene />;
    case 'Void': return <VoidScene />;
    case 'Dumbar': return <RandomGlassBlocksScene />;
    default: return <VoidScene />;
  }
}

function useCleanTextTexture(text: string, isDumbar: boolean = false, fontSize: number = 5, letterSpacing: number = -0.1, fontWeight: number = 900) {
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const texture = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);

  const drawTextWithLetterSpacing = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number) => {
    if (letterSpacing === 0) {
      ctx.fillText(text, x, y);
      return;
    }

    const previousAlign = ctx.textAlign;
    ctx.textAlign = 'left';

    const characters = Array.from(text);
    let totalWidth = -letterSpacing;
    for (const char of characters) {
      totalWidth += ctx.measureText(char).width + letterSpacing;
    }

    let currentX = x - totalWidth / 2;
    for (const char of characters) {
      ctx.fillText(char, currentX, y);
      currentX += ctx.measureText(char).width + letterSpacing;
    }

    ctx.textAlign = previousAlign;
  };

  useEffect(() => {
    // High res for crisp text
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 2048, 1024);

    ctx.fillStyle = 'rgba(255,255,255,1.0)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${fontWeight} ${Math.round(fontSize * 96)}px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;

    if (isDumbar) {
      // Dumbar style: transparent background, crisp white text on transparent.
      drawTextWithLetterSpacing(ctx, text, 1024, 512, letterSpacing);
    } else {
      drawTextWithLetterSpacing(ctx, text, 1024, 512, letterSpacing);
    }

    texture.needsUpdate = true;
  }, [text, canvas, texture, isDumbar, fontSize, letterSpacing, fontWeight]);

  return texture;
}

const chromeTextFragment = `
  uniform sampler2D tText;
  uniform float uTime;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uGlow;
  varying vec2 vUv;

  float maskAt(vec2 uv) {
    vec4 tex = texture2D(tText, uv);
    return max(tex.a, tex.r);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    float wave = sin(p.y * 9.0 + uTime * 0.7) * 0.006 + sin(p.x * 13.0 - uTime * 0.43) * 0.004;
    vec2 warpedUv = uv + vec2(wave * (1.0 + uBass), -wave * 0.45);

    float px = 1.0 / 2048.0;
    float py = 1.0 / 1024.0;
    float m = maskAt(warpedUv);
    float nearA = 0.0;
    nearA = max(nearA, maskAt(warpedUv + vec2(px * 7.0, 0.0)));
    nearA = max(nearA, maskAt(warpedUv - vec2(px * 7.0, 0.0)));
    nearA = max(nearA, maskAt(warpedUv + vec2(0.0, py * 7.0)));
    nearA = max(nearA, maskAt(warpedUv - vec2(0.0, py * 7.0)));
    nearA = max(nearA, maskAt(warpedUv + vec2(px * 14.0, py * 8.0)));
    nearA = max(nearA, maskAt(warpedUv - vec2(px * 14.0, py * 8.0)));

    float farA = 0.0;
    farA = max(farA, maskAt(warpedUv + vec2(px * 28.0, py * 18.0)));
    farA = max(farA, maskAt(warpedUv - vec2(px * 28.0, py * 18.0)));
    farA = max(farA, maskAt(warpedUv + vec2(px * 44.0, -py * 18.0)));
    farA = max(farA, maskAt(warpedUv - vec2(px * 44.0, -py * 18.0)));

    float edge = clamp(nearA - m, 0.0, 1.0);
    float shadow = clamp(farA - nearA, 0.0, 1.0);
    float alpha = clamp(m + edge * 0.92 + shadow * 0.46, 0.0, 1.0);
    if (alpha < 0.01) discard;

    float n1 = noise(uv * 18.0 + vec2(uTime * 0.38, -uTime * 0.22));
    float n2 = noise(uv * 43.0 - vec2(uTime * 0.18, uTime * 0.14));
    float liquid = sin((uv.x + n1 * 0.12) * 48.0 + uTime * 1.2) * 0.5 + 0.5;
    float contour = smoothstep(0.38, 0.92, abs(sin((uv.x * 1.8 + uv.y * 2.4 + n2 * 0.7) * 18.0)));
    float bevel = clamp(
      maskAt(warpedUv - vec2(px * 10.0, -py * 10.0)) -
      maskAt(warpedUv + vec2(px * 10.0, -py * 10.0)),
      -1.0,
      1.0
    );
    float highlight = pow(max(0.0, 0.55 + bevel * 0.72 + liquid * 0.22), 3.6);

    vec3 blackChrome = vec3(0.008, 0.009, 0.011);
    vec3 graphite = vec3(0.06, 0.065, 0.07);
    vec3 silver = vec3(0.56, 0.58, 0.60);
    vec3 whiteHot = vec3(0.98, 1.0, 1.0);
    vec3 col = mix(graphite, silver, m * (0.42 + liquid * 0.38));
    col = mix(col, blackChrome, edge * 0.85);
    col += whiteHot * highlight * m * (0.28 + uTreble * 0.12);
    col += whiteHot * contour * edge * 0.22;
    col -= blackChrome * shadow * 3.4;
    col += vec3(0.18, 0.21, 0.23) * shadow * 0.32;
    col = clamp(col * (0.82 + uGlow * 0.18 + uBeat * 0.08), vec3(0.0), vec3(0.98));

    gl_FragColor = vec4(col, alpha * 0.94);
  }
`;

// === CINEMATIC TYPOGRAPHY ===
function VisualText({ sceneOverride }: { sceneOverride?: string }) {
  const textRef = useRef<THREE.Mesh>(null);
  const chromeMatRef = useRef<THREE.ShaderMaterial>(null);
  const { currentScene, textInput, textAnimStyle, textGlow, textSpeed, textReactive, baseColor, textFontSize, textLetterSpacing, textFontWeight } = useStore();
  const scene = sceneOverride || currentScene;

  const displayText = textInput.toUpperCase();
  const tex = useCleanTextTexture(displayText, false, textFontSize, textLetterSpacing, textFontWeight);

  useFrame((state) => {
    if(!textRef.current) return;
    const { bass, treble, beat } = getReactiveAudio();
    const t = state.clock.elapsedTime * textSpeed;
    const react = bass * textReactive + (beat * 0.5 * textReactive);

    if (scene === 'Void') {
      textRef.current.scale.set(1.05 + react * 0.08, 1.0 + react * 0.04, 1);
      textRef.current.position.x = Math.sin(t * 0.72) * 0.34 + Math.sin(t * 1.37) * 0.11;
      textRef.current.position.y = Math.cos(t * 0.57) * 0.22 + Math.sin(t * 1.11) * 0.08;
      textRef.current.rotation.z = Math.sin(t * 0.31) * 0.045 + Math.sin(t * 0.83) * 0.018;
      if (chromeMatRef.current) {
        chromeMatRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        chromeMatRef.current.uniforms.uBass.value = bass;
        chromeMatRef.current.uniforms.uTreble.value = treble;
        chromeMatRef.current.uniforms.uBeat.value = beat;
        chromeMatRef.current.uniforms.uGlow.value = textGlow;
      }
      return;
    }

    if(textAnimStyle === 'Cinematic') {
      textRef.current.scale.setScalar(1 + react * 0.2);
      textRef.current.position.y = Math.sin(t) * 0.2;
      textRef.current.rotation.set(0,0,0);
    } else if (textAnimStyle === 'Glitch') {
      textRef.current.scale.setScalar(1 + react);
      textRef.current.rotation.set(0,0,0);
      if(Math.random() > 0.8 || beat > 0.5) {
        textRef.current.position.x = (Math.random()-0.5)*0.5 * react;
      } else {
        textRef.current.position.x = 0;
      }
    } else if (textAnimStyle === 'Beat') {
      textRef.current.scale.setScalar(1.5 + (react * 1.5) + (beat * 1.0));
      textRef.current.position.set(0, 0, 1 + bass * 2.0);
      textRef.current.rotation.z = Math.sin(t * 10.0) * 0.05 * beat;
    } else if (textAnimStyle === 'Floating') {
      textRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
      textRef.current.position.y = Math.sin(t) * 0.5;
      textRef.current.scale.setScalar(1 + (react * 0.1));
    } else if (textAnimStyle === 'Massive') {
      textRef.current.scale.setScalar(4 + react * 2.5);
      textRef.current.position.z = -2 + (beat * 2.0);
      textRef.current.rotation.set(0,0,0);
    } else {
      textRef.current.scale.setScalar(1 + react * 0.5);
    }
    
    // Adjust material properties dynamically if needed
    const mat = textRef.current.material as THREE.MeshBasicMaterial;
    if(mat && mat.color) {
       mat.color.set(baseColor);
       mat.color.multiplyScalar(textGlow + beat * 2.0);
    }
  });

  if(!textInput.trim() || scene === 'Dumbar' || scene === 'Topology') return null;

  if (scene === 'Void') {
    return (
      <mesh ref={textRef} position={[0, 0, 1.2]}>
        <planeGeometry args={[20.5, 8.2]} />
        <shaderMaterial
          ref={chromeMatRef}
          vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={chromeTextFragment}
          uniforms={{
            tText: { value: tex },
            uTime: { value: 0 },
            uBass: { value: 0 },
            uTreble: { value: 0 },
            uBeat: { value: 0 },
            uGlow: { value: textGlow },
          }}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    );
  }

  return (
    <mesh ref={textRef} position={[0, 0, 1]}>
      <planeGeometry args={[20, 10]} />
      <meshBasicMaterial 
        map={tex} 
        transparent 
        opacity={0.9} 
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// === HIGH-END POST PROCESSING ===
function PostProcessing({ reduced = false }: { reduced?: boolean }) {
  const { audioDriveMode, audioFxReactive, autoVjEnabled, bloomIntensity, rgbSplitAmount, distortion, glitchActive, currentScene } = useStore();
  const [dynamicBloom, setDynamicBloom] = useState(bloomIntensity);
  const [dynamicSplit, setDynamicSplit] = useState(rgbSplitAmount);
  const [dynamicDistortion, setDynamicDistortion] = useState(distortion);
  const [dynamicGlitch, setDynamicGlitch] = useState(false);
  const lastUpdateRef = useRef(0);
  const dynamicRef = useRef({ bloom: bloomIntensity, split: rgbSplitAmount, distortion, glitch: false });

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - lastUpdateRef.current < 1 / (reduced ? 18 : 30)) return;
    lastUpdateRef.current = now;

    const { energy, beat, bass, subBass, mid, treble, highMid, spectralFlux, transient, spectralCentroid, dynamicRange } = getAudioDriveSnapshot(audioDriveMode);
    const isReferencePastel = currentScene === 'Void';
    const morph = autoVjEnabled && audioFxReactive && !isReferencePastel ? 1 : 0;
    
    const targetBloom = isReferencePastel ? 0 : bloomIntensity + (energy * 0.95 + beat * 1.7 + treble * 0.45 + spectralFlux * 1.1 + transient * 0.85) * morph;
    const targetSplit = isReferencePastel ? 0.001 : rgbSplitAmount + (bass * 0.014 + subBass * 0.012 + beat * 0.02 + highMid * 0.012 + spectralCentroid * 0.014 + spectralFlux * 0.018 + distortion * 0.006) * morph;
    const targetDistortion = isReferencePastel ? 0.015 : distortion + (subBass * 0.42 + bass * 0.24 + mid * 0.16 + dynamicRange * 0.34 + spectralFlux * 0.42 + beat * 0.24) * morph;
    const targetGlitch = !isReferencePastel && (glitchActive || (morph > 0 && (beat > 0.65 || treble > 0.58 || bass > 0.72 || transient > 0.68 || spectralFlux > 0.64)));

    const next = {
      bloom: dynamicRef.current.bloom + (targetBloom - dynamicRef.current.bloom) * (reduced ? 0.16 : 0.1),
      split: dynamicRef.current.split + (targetSplit - dynamicRef.current.split) * (reduced ? 0.28 : 0.2),
      distortion: dynamicRef.current.distortion + (targetDistortion - dynamicRef.current.distortion) * (reduced ? 0.2 : 0.16),
      glitch: reduced ? false : targetGlitch,
    };

    setDynamicBloom(next.bloom);
    setDynamicSplit(next.split);
    setDynamicDistortion(next.distortion);
    if (next.glitch !== dynamicRef.current.glitch) setDynamicGlitch(next.glitch);
    dynamicRef.current = next;
  });

  return (
    <EffectComposer multisampling={0}>
      {currentScene !== 'Void' && !reduced && (
        <Bloom 
          luminanceThreshold={0.2} 
          luminanceSmoothing={0.9} 
          intensity={dynamicBloom} 
          mipmapBlur
        />
      )}
      {dynamicGlitch && (
        <Glitch 
          delay={new THREE.Vector2(0.15, 0.8)} 
          duration={new THREE.Vector2(0.06, 0.22)} 
          strength={new THREE.Vector2(0.18 + dynamicDistortion * 0.3, 0.55 + dynamicDistortion * 0.6)} 
          mode={GlitchMode.SPORADIC}
          ratio={0.85}
        />
      )}
      <ChromaticAberration offset={new THREE.Vector2(reduced ? dynamicSplit * 0.75 : dynamicSplit, reduced ? dynamicSplit * 0.75 : dynamicSplit)} />
      {currentScene !== 'Void' && !reduced && <Vignette eskil={false} offset={0.1} darkness={1.1} />}
    </EffectComposer>
  );
}

function MusicCameraRig() {
  const { camera } = useThree();
  const { audioDriveMode, musicCameraEnabled, speed, chaos } = useStore();
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(0, 0, 5), []);

  useFrame((state) => {
    const { bass, subBass, mid, treble, beat, energy } = getAudioDriveSnapshot(audioDriveMode);
    const amount = musicCameraEnabled ? 0.8 : 0;
    const time = state.clock.elapsedTime * (0.2 + speed * 0.18);
    const orbit = time + bass * 1.8 * amount + treble * 0.8 * amount;
    const radius = 5 + subBass * 2.8 * amount + beat * 0.9 * amount;
    const lift = Math.sin(time * 1.7) * (0.35 + mid * 1.2) * amount;

    targetPosition.set(
      Math.sin(orbit) * (0.35 + chaos * 0.22) * amount,
      lift,
      radius + Math.cos(orbit * 0.7) * 0.75 * amount
    );

    camera.position.lerp(targetPosition, 0.055);
    lookTarget.set(
      Math.sin(time * 1.3) * treble * 0.55 * amount,
      Math.cos(time * 1.1) * mid * 0.45 * amount,
      beat * 0.18 * amount
    );
    camera.lookAt(lookTarget);

    if (camera instanceof THREE.PerspectiveCamera) {
      const nextFov = 60 + energy * 8 * amount + beat * 4 * amount;
      camera.fov += (nextFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function AudioMorphTone() {
  const { scene } = useThree();
  const { audioDriveMode, autoVjEnabled, bgColor, baseColor, secondaryColor } = useStore();
  const quietColor = useMemo(() => new THREE.Color(), []);
  const pulseColor = useMemo(() => new THREE.Color(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    quietColor.set(bgColor);

    if (!autoVjEnabled) {
      scene.background = quietColor;
      return;
    }

    const { bass, treble, energy, beat } = getAudioDriveSnapshot(audioDriveMode);
    pulseColor.set(treble > bass ? secondaryColor : baseColor);
    targetColor.copy(quietColor).lerp(pulseColor, Math.min(0.45, energy * 0.28 + beat * 0.16));
    scene.background = targetColor.clone();
  });

  return null;
}

function PulseEnergyOverlay({ sceneOverride }: { sceneOverride?: string }) {
  const {
    currentScene,
    textInput,
    textAnimStyle,
    textFontSize,
    textFontWeight,
    textLetterSpacing,
    textGlow,
    textSpeed,
    textColor,
  } = useStore();
  const scene = sceneOverride || currentScene;
  if (scene !== 'Pulse') return null;

  const displayText = (textInput?.trim() || 'GAFA').toUpperCase();
  const normalizedStyle = ['Cinematic', 'Massive', 'Glitch', 'Hologram', 'Floating', 'Beat'].includes(textAnimStyle)
    ? textAnimStyle.toLowerCase()
    : 'glitch';
  const titleStyle = {
    '--pulse-title-size': `${Math.max(28, Math.min(148, textFontSize * 18))}px`,
    '--pulse-title-weight': textFontWeight,
    '--pulse-title-spacing': `${textLetterSpacing}em`,
    '--pulse-title-speed': `${Math.max(0.35, 1.45 / Math.max(textSpeed, 0.2))}s`,
    '--pulse-title-glow': `${Math.max(10, Math.min(72, 12 + textGlow * 11))}px`,
    '--pulse-title-color': textColor,
  } as React.CSSProperties;

  const fragments = Array.from({ length: 22 }, (_, index) => {
    const style = {
      '--x': `${(index * 37) % 100}%`,
      '--y': `${22 + ((index * 19) % 52)}%`,
      '--w': `${24 + ((index * 13) % 86)}px`,
      '--d': `${(index % 7) * -0.31}s`,
      '--a': `${-14 + ((index * 23) % 28)}deg`,
    } as React.CSSProperties;

    return <i key={index} className="pulse-energy-fragment" style={style} />;
  });

  const plates = Array.from({ length: 9 }, (_, index) => {
    const style = {
      '--px': `${8 + ((index * 23) % 82)}%`,
      '--py': `${34 + ((index * 17) % 30)}%`,
      '--pw': `${42 + ((index * 29) % 118)}px`,
      '--ph': `${16 + ((index * 11) % 44)}px`,
      '--pa': `${-22 + ((index * 31) % 44)}deg`,
      '--pd': `${(index % 5) * -0.37}s`,
    } as React.CSSProperties;

    return <i key={index} className="pulse-energy-plate" style={style} />;
  });

  const trails = Array.from({ length: 8 }, (_, index) => {
    const style = {
      '--ty': `${26 + index * 6}%`,
      '--td': `${index * -0.42}s`,
      '--tw': `${34 + ((index * 17) % 42)}%`,
    } as React.CSSProperties;

    return <i key={index} className="pulse-energy-trail" style={style} />;
  });

  return (
    <div className="pulse-energy-overlay" aria-hidden="true">
      <div className="pulse-energy-haze" />
      <div className="pulse-energy-band" />
      {trails}
      {plates}
      {fragments}
      <div
        className={`pulse-energy-title pulse-energy-title--${normalizedStyle}`}
        data-text={displayText}
        style={titleStyle}
      >
        <span>{displayText}</span>
      </div>
      <div className="pulse-energy-scan" />
      <div className="pulse-energy-noise" />
    </div>
  );
}

export function Visualizer({ screenIdOverride }: { screenIdOverride?: string } = {}) {
  const {
    activeScreenId,
    audioDriveMode,
    autoVjEnabled,
    bgColor,
    brightness,
    contrast,
    currentScene,
    outputMode,
    saturation,
    screenAudioReactive,
    screenTransitionAmount,
    screenTransitionStyle,
    syncedScreenSignal,
    visualScreens,
    language,
  } = useStore();
  const labels = screenText[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const isScreenOutput = Boolean(screenIdOverride);
  const effectiveScreenId = screenIdOverride || activeScreenId;
  const activeScreen = visualScreens.find((screen) => screen.id === effectiveScreenId) || visualScreens[0];
  const enabledScreens = visualScreens.filter((screen) => screen.enabled);
  const sceneOverride = isScreenOutput
    ? (outputMode === 'mirror' ? currentScene : activeScreen?.scene)
    : currentScene;
  const displaySignal = syncedScreenSignal;
  const deviceAspectClass = activeScreen?.device === 'phone'
    ? 'inset-x-[36%] inset-y-[8%]'
    : activeScreen?.device === 'tablet'
      ? 'inset-x-[20%] inset-y-[10%]'
      : activeScreen?.device === 'projector'
        ? 'inset-x-[8%] inset-y-[12%]'
        : 'inset-4';

  useEffect(() => {
    let frame = 0;
    let lastUpdate = 0;
    const updateFilter = () => {
      const now = performance.now();
      if (containerRef.current && now - lastUpdate >= 50) {
        lastUpdate = now;
        let audioContrast = 0;
        let audioBrightness = 0;
        let audioSaturation = 0;

        if (autoVjEnabled) {
          const { bass, treble, energy, beat, spectralFlux, transient, spectralCentroid } = getAudioDriveSnapshot(audioDriveMode);
          audioContrast = energy * 0.1 + beat * 0.05 + spectralFlux * 0.12;
          audioBrightness = bass * 0.06 + beat * 0.05 + transient * 0.07;
          audioSaturation = treble * 0.28 + energy * 0.1 + spectralCentroid * 0.18;
        }

        containerRef.current.style.filter = `contrast(${contrast + audioContrast}) brightness(${brightness + audioBrightness}) saturate(${saturation + audioSaturation})`;
      }
      frame = requestAnimationFrame(updateFilter);
    };

    updateFilter();
    return () => cancelAnimationFrame(frame);
  }, [audioDriveMode, autoVjEnabled, brightness, contrast, saturation]);
  
  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 h-full min-h-0 w-full overflow-hidden"
      style={{ filter: `contrast(${contrast}) brightness(${brightness}) saturate(${saturation})` }}
    >
      <Canvas
        className="screen-canvas !absolute !inset-0 !h-full !w-full"
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={isScreenOutput ? [0.75, 1] : [1, 2]}
        gl={{ antialias: !isScreenOutput, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[bgColor]} />
        <AudioMorphTone />
        <MusicCameraRig />
        <SceneRouter sceneOverride={sceneOverride} />
        <AudioMutationOverlay />
        <VisualText sceneOverride={sceneOverride} />
        <PostProcessing reduced={isScreenOutput} />
      </Canvas>
      <PulseEnergyOverlay sceneOverride={sceneOverride} />
      {isScreenOutput && !activeScreen?.enabled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 text-[11px] font-bold uppercase tracking-[0.35em] text-white/50">
          {labels.outputDisabled}
        </div>
      )}
      {isScreenOutput && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div
            className={`absolute ${deviceAspectClass} rounded-lg border transition-all duration-150 ${
              screenTransitionStyle === 'strobe' && displaySignal > 0.55
                ? 'border-white bg-white/10'
                : 'border-cyan-300/55'
            }`}
            style={{
              boxShadow: `0 0 ${18 + displaySignal * 72}px rgba(103,232,249,${0.12 + displaySignal * 0.22}) inset, 0 0 ${12 + displaySignal * 48}px rgba(103,232,249,${0.12 + displaySignal * 0.18})`,
              opacity: screenTransitionStyle === 'cut' ? 1 : 0.58 + displaySignal * 0.34,
              transform: screenTransitionStyle === 'scan' ? `translateX(${Math.sin(displaySignal * Math.PI * 2) * 8}px)` : undefined,
            }}
          >
            <div
              className="absolute left-0 top-0 h-full w-full rounded-lg"
              style={{
                background: screenTransitionStyle === 'scan'
                  ? `linear-gradient(90deg, transparent ${Math.max(0, displaySignal * 100 - 12)}%, rgba(103,232,249,0.28) ${displaySignal * 100}%, transparent ${Math.min(100, displaySignal * 100 + 12)}%)`
                  : screenTransitionStyle === 'crossfade'
                    ? `rgba(103,232,249,${displaySignal * 0.08})`
                    : 'transparent',
              }}
            />
          </div>
          <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-200">{activeScreen?.name || 'Screen'}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/45">
              <span>{getOutputModeLabel(language, outputMode)}</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>{getTransitionLabel(language, screenTransitionStyle)}</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>{Math.round(displaySignal * 100)}%</span>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 flex max-w-[70%] gap-2 overflow-hidden">
            {enabledScreens.map((screen) => (
              <div
                key={screen.id}
                className={`rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                  screen.id === effectiveScreenId
                    ? 'border-cyan-300 bg-cyan-300 text-black'
                    : 'border-white/10 bg-black/45 text-white/45'
                }`}
              >
                {screen.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
