import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Glitch, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { Text } from '@react-three/drei';
import { GlitchMode, BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { audioEngine } from '@/lib/AudioEngine';
import { useStore } from '@/store/useStore';

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

// 1. VOID SCENE (Deep glowing particles)
const voidVertex = `
  uniform float uTime;
  uniform float uSubBass;
  uniform float uBass;
  uniform float uMid;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Sub-bass causes large vertical wave distortion
    p.y += sin(p.x * 2.0 + uTime) * 1.5 * uSubBass;
    // Bass causes depth expansion
    p.z += cos(p.y * 2.0 + uTime) * 1.5 * uBass;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    // Mids affect particle size
    gl_PointSize = (10.0 + 30.0 * uMid) * (1.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const voidFragment = `
  uniform vec3 uColor;
  uniform float uEnergy;
  void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);
    if(r > 1.0) discard;
    float alpha = exp(-r * (3.0 - uEnergy * 2.0));
    gl_FragColor = vec4(uColor * alpha, alpha);
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
  const { baseColor, speed } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  
  const [positions] = useMemo(() => {
    const count = 5000;
    const pos = new Float32Array(count * 3);
    for(let i=0; i<count; i++) {
      pos[i*3] = (Math.random() - 0.5) * 40;
      pos[i*3+1] = (Math.random() - 0.5) * 40;
      pos[i*3+2] = (Math.random() - 0.5) * 40;
    }
    return [pos];
  }, []);

  useFrame((state, delta) => {
    if(!materialRef.current || !pointsRef.current) return;
    const { subBass, bass, mid, energy, beat } = audioEngine.current;
    
    // Beat causes sudden rotation surge
    pointsRef.current.rotation.y += delta * 0.1 * speed * (1 + beat * 5.0 + subBass);
    pointsRef.current.rotation.x += delta * 0.05 * speed * bass;
    
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSubBass.value = subBass;
    materialRef.current.uniforms.uBass.value = bass;
    materialRef.current.uniforms.uMid.value = mid;
    materialRef.current.uniforms.uEnergy.value = energy;
    materialRef.current.uniforms.uColor.value.set(baseColor);
    
    // Additive scale on beat
    pointsRef.current.scale.setScalar(1.0 + (beat * 0.1));
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
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
          uColor: { value: new THREE.Color() }
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
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
    const { volume, bass, lowMid, energy, beat, treble } = audioEngine.current;
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
  
  // Use user text or default to "YOU"
  const textTexture = useTextTexture(textInput || "YOU", textFontSize, textLetterSpacing, textFontWeight);
  
  useFrame((state) => {
    if(!matRef.current) return;
    const { bass, energy } = audioEngine.current;
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
    const { bass, treble, beat } = audioEngine.current;
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

const spectrumVertex = `
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const spectrumFragment = `
  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform float uEnergy;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    float verticalFade = smoothstep(-0.6, 1.0, vUv.y);
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    vec3 color = mix(uBaseColor * 0.45, uAccentColor, verticalFade);
    color += uBaseColor * pow(verticalFade, 3.0) * (0.6 + uEnergy);
    gl_FragColor = vec4(color, edge * (0.72 + uEnergy * 0.28));
  }
`;

function SpectrumScene() {
  const groupRef = useRef<THREE.Group>(null);
  const floorRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor, secondaryColor, speed } = useStore();

  const bars = useMemo(() => {
    const items: Array<{ x: number; z: number; phase: number; band: number }> = [];
    const columns = 17;
    const rows = 9;
    for (let x = 0; x < columns; x++) {
      for (let z = 0; z < rows; z++) {
        items.push({
          x: (x - (columns - 1) / 2) * 0.62,
          z: (z - (rows - 1) / 2) * 0.66,
          phase: x * 0.35 + z * 0.52,
          band: (x / (columns - 1) + z / (rows - 1)) * 0.5
        });
      }
    }
    return items;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const { subBass, bass, mid, highMid, treble, energy, beat } = audioEngine.current;
    const levels = [subBass, bass, mid, highMid, treble];
    const time = state.clock.elapsedTime * speed;

    groupRef.current.rotation.y = Math.sin(time * 0.25) * 0.18;
    groupRef.current.position.y = -0.95 - beat * 0.12;

    groupRef.current.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh;
      const config = bars[index];
      const bandIndex = Math.min(levels.length - 1, Math.floor(config.band * levels.length));
      const band = levels[bandIndex] || 0;
      const ripple = Math.sin(time * 2.4 + config.phase) * 0.24 + 0.76;
      const height = 0.18 + band * 4.6 + energy * 0.75 * ripple + beat * 1.3;
      mesh.scale.y += (height - mesh.scale.y) * 0.24;
      mesh.position.y = mesh.scale.y * 0.5;
      mesh.rotation.y = Math.sin(time + config.phase) * 0.12 * energy;

      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uBaseColor.value.set(baseColor);
      mat.uniforms.uAccentColor.value.set(secondaryColor);
      mat.uniforms.uEnergy.value = energy;
    });

    if (floorRef.current) {
      floorRef.current.uniforms.uTime.value = time;
      floorRef.current.uniforms.uEnergy.value = energy;
      floorRef.current.uniforms.uColor.value.set(baseColor);
    }
  });

  return (
    <group>
      <mesh position={[0, -1.08, -1.5]} rotation={[-Math.PI / 2, 0, 0]} scale={[18, 14, 1]}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <shaderMaterial
          ref={floorRef}
          vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={`
            uniform float uTime;
            uniform float uEnergy;
            uniform vec3 uColor;
            varying vec2 vUv;
            void main() {
              vec2 p = vUv * 2.0 - 1.0;
              float grid = max(smoothstep(0.97, 1.0, abs(sin((p.x + uTime * 0.04) * 28.0))), smoothstep(0.97, 1.0, abs(sin((p.y - uTime * 0.08) * 22.0))));
              float fade = smoothstep(1.4, 0.1, length(p));
              gl_FragColor = vec4(uColor * grid * fade * (0.22 + uEnergy * 0.55), grid * fade);
            }
          `}
          uniforms={{
            uTime: { value: 0 },
            uEnergy: { value: 0 },
            uColor: { value: new THREE.Color() }
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <group ref={groupRef} position={[0, -0.95, -2.2]}>
        {bars.map((bar, index) => (
          <mesh key={`${bar.x}-${bar.z}-${index}`} position={[bar.x, 0.1, bar.z]}>
            <boxGeometry args={[0.34, 1, 0.34]} />
            <shaderMaterial
              vertexShader={spectrumVertex}
              fragmentShader={spectrumFragment}
              uniforms={{
                uBaseColor: { value: new THREE.Color(baseColor) },
                uAccentColor: { value: new THREE.Color(secondaryColor) },
                uEnergy: { value: 0 }
              }}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const kaleidoFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform vec3 uBaseColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAccentColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.78;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float slices = 8.0 + floor(uBass * 8.0);
    float folded = abs(mod(angle + uTime * (0.15 + uTreble * 0.6), 6.283185 / slices) - 3.141592 / slices);
    vec2 k = vec2(cos(folded), sin(folded)) * radius;

    float rings = sin(radius * (20.0 + uBass * 18.0) - uTime * 4.0);
    float spokes = sin(k.x * 22.0 + uTime * 2.0) * sin(k.y * 18.0 - uTime * 1.6);
    float cells = smoothstep(0.42, 0.96, rings * 0.5 + spokes * 0.5 + uMid * 0.45);
    float petals = smoothstep(0.65, 0.1, abs(sin(folded * slices * 0.5 + radius * 7.0 - uTime)));
    float sparkle = step(0.985 - uTreble * 0.04, hash(floor(k * 24.0 + uTime * 3.0)));

    vec3 color = mix(uBaseColor * 0.08, uSecondaryColor, cells);
    color = mix(color, uBaseColor, petals * (0.25 + uEnergy * 0.55));
    color += uAccentColor * sparkle * (0.5 + uTreble * 1.8);
    color *= smoothstep(1.35, 0.05, radius);
    color += uBaseColor * pow(max(0.0, 1.0 - radius), 4.0) * (0.5 + uBass);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function KaleidoScene() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor, secondaryColor, accentColor, speed } = useStore();

  useFrame((state) => {
    if (!matRef.current) return;
    const { bass, mid, treble, energy } = audioEngine.current;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    matRef.current.uniforms.uBass.value = bass;
    matRef.current.uniforms.uMid.value = mid;
    matRef.current.uniforms.uTreble.value = treble;
    matRef.current.uniforms.uEnergy.value = energy;
    matRef.current.uniforms.uBaseColor.value.set(baseColor);
    matRef.current.uniforms.uSecondaryColor.value.set(secondaryColor);
    matRef.current.uniforms.uAccentColor.value.set(accentColor);
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[24, 14]} />
      <shaderMaterial
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={kaleidoFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uBaseColor: { value: new THREE.Color(baseColor) },
          uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          uAccentColor: { value: new THREE.Color(accentColor) }
        }}
        depthWrite={false}
      />
    </mesh>
  );
}

const tunnelFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform vec3 uBaseColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAccentColor;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.78;
    float r = max(length(p), 0.001);
    float a = atan(p.y, p.x);

    float twist = sin(r * 5.0 - uTime * 1.3) * (0.25 + uMid * 0.6);
    float tunnel = 1.0 / r + uTime * (0.7 + uBass * 1.8);
    float bands = smoothstep(0.68, 0.98, abs(sin(tunnel * 2.8 + twist)));
    float ribs = smoothstep(0.88, 1.0, abs(sin(a * (10.0 + floor(uTreble * 12.0)) + tunnel)));
    float sparks = step(0.986 - uTreble * 0.035, hash(floor(a * 38.0) + floor(tunnel * 8.0)));

    vec3 color = mix(uBaseColor * 0.08, uSecondaryColor, bands);
    color += uBaseColor * ribs * (0.45 + uEnergy);
    color += uAccentColor * sparks * (0.6 + uTreble * 2.2);
    color *= smoothstep(1.25, 0.12, r);
    color += uBaseColor * pow(max(0.0, 0.18 - r) * 5.0, 2.0) * (1.0 + uBass * 2.5);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function TunnelScene() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor, secondaryColor, accentColor, speed } = useStore();

  useFrame((state) => {
    if (!matRef.current) return;
    const { bass, mid, treble, energy } = audioEngine.current;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    matRef.current.uniforms.uBass.value = bass;
    matRef.current.uniforms.uMid.value = mid;
    matRef.current.uniforms.uTreble.value = treble;
    matRef.current.uniforms.uEnergy.value = energy;
    matRef.current.uniforms.uBaseColor.value.set(baseColor);
    matRef.current.uniforms.uSecondaryColor.value.set(secondaryColor);
    matRef.current.uniforms.uAccentColor.value.set(accentColor);
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[24, 14]} />
      <shaderMaterial
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={tunnelFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uBaseColor: { value: new THREE.Color(baseColor) },
          uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          uAccentColor: { value: new THREE.Color(accentColor) }
        }}
        depthWrite={false}
      />
    </mesh>
  );
}

function WaveTerrainScene() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { baseColor, secondaryColor, speed } = useStore();

  useFrame((state) => {
    if (!meshRef.current || !matRef.current) return;
    const { subBass, bass, mid, highMid, treble, energy, beat } = audioEngine.current;
    const time = state.clock.elapsedTime * speed;
    const geometry = meshRef.current.geometry as THREE.PlaneGeometry;
    const position = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const distance = Math.sqrt(x * x + y * y);
      const ridge = Math.sin(x * 1.4 + time * 2.0) * bass;
      const cross = Math.cos(y * 1.9 - time * 1.4) * mid;
      const ring = Math.sin(distance * (2.0 + highMid * 2.5) - time * 3.2) * (0.2 + subBass);
      const shimmer = Math.sin((x + y) * 6.0 + time * 8.0) * treble * 0.15;
      position.setZ(i, (ridge + cross + ring + shimmer) * (0.5 + energy) + beat * 0.4);
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
    meshRef.current.rotation.z = Math.sin(time * 0.12) * 0.08;
    matRef.current.color.set(baseColor);
    matRef.current.emissive.set(secondaryColor);
    matRef.current.emissiveIntensity = 0.35 + energy * 1.4;
    matRef.current.wireframe = true;
  });

  return (
    <group position={[0, -1.1, -4]} rotation={[-Math.PI / 2.6, 0, 0]}>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 4, 3]} intensity={8} color={baseColor} />
      <mesh ref={meshRef}>
        <planeGeometry args={[16, 12, 80, 58]} />
        <meshStandardMaterial ref={matRef} color={baseColor} emissive={secondaryColor} metalness={0.4} roughness={0.28} />
      </mesh>
    </group>
  );
}

function CrystalScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { baseColor, secondaryColor, accentColor, speed } = useStore();

  const crystals = useMemo(() => {
    return new Array(42).fill(0).map((_, index) => {
      const ring = Math.floor(index / 7) + 1;
      const angle = index * 2.399;
      return {
        x: Math.cos(angle) * ring * 0.36,
        y: Math.sin(angle) * ring * 0.24,
        z: -ring * 0.14,
        rot: angle,
        scale: 0.45 + (index % 7) * 0.08
      };
    });
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const { bass, mid, treble, energy, beat } = audioEngine.current;
    const time = state.clock.elapsedTime * speed;
    groupRef.current.rotation.y = time * 0.18;
    groupRef.current.rotation.z = Math.sin(time * 0.3) * 0.2;

    groupRef.current.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh;
      const pulse = 1 + bass * 0.5 + beat * 0.7 + Math.sin(time * 2.0 + index) * mid * 0.18;
      mesh.scale.setScalar(crystals[index].scale * pulse);
      mesh.rotation.x = time * (0.35 + index * 0.01) + crystals[index].rot;
      mesh.rotation.y = time * (0.25 + treble * 0.8) + index;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(index % 3 === 0 ? baseColor : index % 3 === 1 ? secondaryColor : accentColor);
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.35 + energy * 1.3 + beat;
    });
  });

  return (
    <group>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 4]} intensity={16} color={baseColor} />
      <pointLight position={[-4, -2, 2]} intensity={10} color={secondaryColor} />
      <group ref={groupRef} position={[0, 0, -1.7]}>
        {crystals.map((crystal, index) => (
          <mesh key={index} position={[crystal.x, crystal.y, crystal.z]} rotation={[crystal.rot, crystal.rot * 0.4, crystal.rot * 0.2]}>
            <octahedronGeometry args={[1, 1]} />
            <meshStandardMaterial transparent opacity={0.72} metalness={0.15} roughness={0.12} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const signalBloomFragment = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uEnergy;
  uniform vec3 uBaseColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAccentColor;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float sdEllipse(vec2 p, vec2 r) {
    return length(p / r) - 1.0;
  }

  float softBlob(vec2 p, vec2 center, vec2 radius, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    p -= center;
    p = mat2(c, -s, s, c) * p;
    p.x += sin(p.y * 18.0 + uTime * 1.3) * 0.018 * (1.0 + uEnergy);
    p.y += sin(p.x * 14.0 - uTime * 1.1) * 0.014 * (1.0 + uBass);
    return sdEllipse(p, radius);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= 1.78;

    float time = uTime * 0.6;
    float d = 10.0;
    d = min(d, softBlob(p, vec2(-0.82 + sin(time) * 0.06, 0.38), vec2(0.34 + uBass * 0.08, 0.16), -0.12));
    d = min(d, softBlob(p, vec2(0.08, 0.34 + sin(time * 0.9) * 0.04), vec2(0.42 + uMid * 0.08, 0.34), 0.24));
    d = min(d, softBlob(p, vec2(-0.08, -0.38), vec2(0.50 + uBass * 0.1, 0.14), -0.06));
    d = min(d, softBlob(p, vec2(0.86 + cos(time * 0.7) * 0.05, -0.34), vec2(0.34 + uMid * 0.05, 0.16), 0.08));
    d = min(d, softBlob(p, vec2(0.55, 0.27), vec2(0.22, 0.11 + uTreble * 0.04), -0.18));

    float fill = smoothstep(0.025, -0.03, d);
    float halo = exp(-max(d, 0.0) * (5.0 - uBass * 1.5));
    float hotEdge = smoothstep(0.055, 0.0, abs(d));

    vec3 ember = mix(vec3(0.72, 0.33, 0.08), uBaseColor, 0.72);
    vec3 red = mix(vec3(1.0, 0.0, 0.02), uSecondaryColor, 0.68);
    vec3 whiteHot = mix(vec3(1.0), uAccentColor, 0.55);

    float row = floor((uv.y + uTime * 0.03) * 88.0);
    float rowNoise = hash(row + floor(uTime * 9.0));
    float broken = step(0.68 - uEnergy * 0.28, rowNoise);
    float segment = step(0.45, hash(floor(uv.x * 34.0) + row * 7.0));
    float redScan = broken * segment * smoothstep(0.985, 1.0, abs(sin((uv.y + uTime * 0.035) * 280.0)));
    redScan *= smoothstep(0.05, -0.02, d + 0.02);

    float slitA = smoothstep(0.018, 0.0, abs(p.y - 0.43 - sin(p.x * 12.0 + time) * 0.01)) * smoothstep(0.28, 0.0, abs(p.x - 0.08));
    float slitB = smoothstep(0.014, 0.0, abs(p.y + 0.37 - sin(p.x * 10.0 - time) * 0.012)) * smoothstep(0.48, 0.0, abs(p.x + 0.02));
    float slitC = smoothstep(0.012, 0.0, abs(p.y + 0.31)) * smoothstep(0.18, 0.0, abs(p.x - 0.85));
    float slits = max(max(slitA, slitB), slitC) * fill;

    float smear = 0.0;
    for (float i = 1.0; i < 8.0; i += 1.0) {
      float trailX = uv.x - i * 0.012 * (1.0 + uBass);
      smear += smoothstep(0.985, 1.0, abs(sin((trailX + uv.y * 0.11 + uTime * 0.09) * 120.0 + i))) / i;
    }
    smear *= fill * (0.12 + uTreble * 0.35);

    float staticNoise = (hash2(floor(uv * vec2(360.0, 190.0)) + uTime) - 0.5) * 0.035 * (1.0 + uEnergy);
    float vignette = smoothstep(1.25, 0.18, length(p));

    vec3 color = vec3(0.0);
    color += ember * fill * (0.9 + uBass * 0.5);
    color += ember * halo * (0.42 + uEnergy * 0.42);
    color += red * hotEdge * (0.45 + uTreble);
    color += red * redScan * (1.4 + uEnergy * 2.2);
    color += red * smear;
    color += whiteHot * slits * (1.2 + uTreble * 1.8);
    color += staticNoise;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function SignalBloomScene() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { baseColor, secondaryColor, accentColor, speed } = useStore();

  useFrame((state) => {
    if (!matRef.current) return;
    const { bass, mid, treble, energy } = audioEngine.current;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    matRef.current.uniforms.uBass.value = bass;
    matRef.current.uniforms.uMid.value = mid;
    matRef.current.uniforms.uTreble.value = treble;
    matRef.current.uniforms.uEnergy.value = energy;
    matRef.current.uniforms.uBaseColor.value.set(baseColor);
    matRef.current.uniforms.uSecondaryColor.value.set(secondaryColor);
    matRef.current.uniforms.uAccentColor.value.set(accentColor);
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[24, 14]} />
      <shaderMaterial
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={signalBloomFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uBaseColor: { value: new THREE.Color(baseColor) },
          uSecondaryColor: { value: new THREE.Color(secondaryColor) },
          uAccentColor: { value: new THREE.Color(accentColor) }
        }}
        depthWrite={false}
      />
    </mesh>
  );
}

const TRAIL_COUNT = 12;

function DumbarScene() {
  const { textInput, textFontSize, textLetterSpacing } = useStore();
  const groupRef = useRef<THREE.Group>(null);
  const bgMatRef = useRef<THREE.MeshBasicMaterial>(null);
  
  const historyRef = useRef<any[]>(Array(TRAIL_COUNT).fill(null).map(() => ({ x:0, y:0, scaleX:1, scaleY:1, rotZ:0 })));
  
  const targetState = useRef({ 
    bg: new THREE.Color('#020202'), 
    fg: new THREE.Color('#ffffff'), 
    out: new THREE.Color('#333333'),
    outlineWidth: 0.05
  });

  useFrame((state) => {
    if(!groupRef.current) return;
    const { bass, treble, beat, energy, subBass, highMid } = audioEngine.current;
    
    // Dynamic theme colors inspired by Google Sans Flex / Studio Dumbar
    if (energy > 0.7 && beat > 0.4) {
      targetState.current.bg.set('#00ff3c'); // Intense Green
      targetState.current.fg.set('#000000'); // Black core
      targetState.current.out.set('#ffffff'); // White outline glow
      targetState.current.outlineWidth = 0.15;
    } else if (bass > 0.5 || subBass > 0.5) {
      targetState.current.bg.set('#050000'); // Deep dark pulse
      targetState.current.fg.set('#ffffff');
      targetState.current.out.set('#ff003c'); // Red slit-scan trail
      targetState.current.outlineWidth = 0.08 + (bass * 0.1);
    } else {
      targetState.current.bg.set('#050505');
      targetState.current.fg.set('#ffffff');
      targetState.current.out.set('#222222');
      targetState.current.outlineWidth = 0.05;
    }
    
    if (bgMatRef.current) {
       bgMatRef.current.color.lerp(targetState.current.bg, 0.15);
    }
    
    const time = state.clock.elapsedTime;
    
    const targetScaleX = 1 + (bass * 2.5) + (energy * 1.5) + (beat * 1.0);
    const targetScaleY = 1 + (highMid * 1.0) - (subBass * 0.2) + (beat * 0.5);
    
    // Kinetic wavy motion
    const waveDistortionX = Math.sin(time * 5.0) * (energy + bass) * 0.6;
    const waveDistortionY = Math.cos(time * 3.7) * (energy) * 0.4;
    const rotZ = Math.sin(time * 2.0) * bass * 0.3;
    
    const currentFront = {
      x: waveDistortionX,
      y: waveDistortionY,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      rotZ: rotZ
    };
    
    historyRef.current.unshift(currentFront);
    historyRef.current.pop();
    
    groupRef.current.children.forEach((mesh: any, i: number) => {
      const hist = historyRef.current[i];
      if (!hist) return;
      
      mesh.position.x += (hist.x - mesh.position.x) * 0.4;
      mesh.position.y += (hist.y - mesh.position.y) * 0.4;
      mesh.scale.x += (hist.scaleX - mesh.scale.x) * 0.4;
      mesh.scale.y += (hist.scaleY - mesh.scale.y) * 0.4;
      mesh.rotation.z += (hist.rotZ - mesh.rotation.z) * 0.4;
      
      mesh.position.z = -i * 0.2; 
      
      if (!mesh.color) mesh.color = new THREE.Color();
      if (!mesh.outlineColor) mesh.outlineColor = new THREE.Color();

      if (i === 0) {
        mesh.color.lerp(targetState.current.fg, 0.2);
        mesh.outlineWidth = 0;
      } else {
        mesh.color.lerp(targetState.current.bg, 0.2);
        mesh.outlineColor.lerp(targetState.current.out, 0.2);
        mesh.outlineWidth = targetState.current.outlineWidth;
        mesh.fillOpacity = 1.0;
      }

      if (mesh.sync) mesh.sync();
    });
  });

  const displayText = (textInput || "YOU").toUpperCase();

  return (
    <group>
      <mesh position={[0,0,-20]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial ref={bgMatRef} color="#000" />
      </mesh>
      
      <group ref={groupRef} position={[0, 0, 0]}>
        {new Array(TRAIL_COUNT).fill(0).map((_, i) => (
           <Text
             key={i}
             font="https://fonts.gstatic.com/ea/notosanssc/v1/NotoSansSC-Bold.otf"
             fontSize={textFontSize}
             letterSpacing={textLetterSpacing}
             anchorX="center"
             anchorY="middle"
           >
             {displayText}
           </Text>
        ))}
      </group>
    </group>
  );
}

// === ROUTER ===
function SceneRouter() {
  const { currentScene } = useStore();
  switch(currentScene) {
    case 'Cyber': return <CyberScene />;
    case 'Liquid': return <LiquidScene />;
    case 'Pulse': return <PulseScene />;
    case 'Void': return <VoidScene />;
    case 'Dumbar': return <DumbarScene />;
    case 'Spectrum': return <SpectrumScene />;
    case 'Kaleido': return <KaleidoScene />;
    case 'Tunnel': return <TunnelScene />;
    case 'Terrain': return <WaveTerrainScene />;
    case 'Crystal': return <CrystalScene />;
    case 'SignalBloom': return <SignalBloomScene />;
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

const liquidTextFragment = `
  uniform sampler2D tText;
  uniform float uTime;
  uniform float uBass;
  uniform float uLowMid;
  uniform float uEnergy;
  uniform float uGlow;
  uniform vec3 uTextColor;
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

  float textMask(vec2 uv) {
    return texture2D(tText, uv).r;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * (0.72 + uEnergy * 0.2);
    float n = noise(uv * 5.5 + vec2(t * 0.22, -t * 0.18));
    vec2 flow = vec2(
      sin(uv.y * 10.0 + t * 1.4) + sin((uv.x + uv.y) * 7.0 - t * 0.8),
      cos(uv.x * 8.0 - t * 1.1) + sin((uv.x - uv.y) * 6.0 + t)
    );
    vec2 liquidUv = uv + flow * (0.0035 + uEnergy * 0.007 + uBass * 0.004) + (n - 0.5) * (0.004 + uLowMid * 0.004);

    float mask = textMask(liquidUv);
    float px = 0.0028 + uBass * 0.0012;
    float glow = 0.0;
    glow += textMask(liquidUv + vec2(px, 0.0));
    glow += textMask(liquidUv - vec2(px, 0.0));
    glow += textMask(liquidUv + vec2(0.0, px));
    glow += textMask(liquidUv - vec2(0.0, px));
    glow += textMask(liquidUv + vec2(px * 2.0, px));
    glow += textMask(liquidUv - vec2(px * 2.0, -px));
    glow /= 6.0;

    float edge = max(glow - mask, 0.0);
    float aura = smoothstep(0.03, 0.7, glow);
    float inner = smoothstep(0.18, 0.95, mask);
    float ripple = 0.5 + 0.5 * sin((uv.x + uv.y) * 34.0 - t * 3.2 + n * 2.0);

    vec3 neonYellow = vec3(0.8, 1.0, 0.0);
    vec3 neonPurple = vec3(0.4, 0.0, 1.0);
    vec3 acidCyan = vec3(0.35, 1.0, 0.86);
    vec3 core = mix(uTextColor, vec3(1.0), 0.45);
    vec3 edgeColor = mix(neonPurple, neonYellow, ripple);

    vec3 color = core * inner * (0.85 + uGlow * 0.15);
    color += edgeColor * edge * (1.2 + uEnergy * 0.55);
    color += acidCyan * aura * (0.18 + uBass * 0.2);
    color += neonPurple * aura * aura * (0.22 + uLowMid * 0.16);

    float alpha = clamp(inner + aura * (0.32 + uGlow * 0.05), 0.0, 0.92);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

// === CINEMATIC TYPOGRAPHY ===
function VisualText() {
  const textRef = useRef<THREE.Mesh>(null);
  const liquidTextMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const liquidTextTimeRef = useRef(0);
  const liquidTextSpeedRef = useRef(0.14);
  const { currentScene, textInput, textAnimStyle, textGlow, textSpeed, textReactive, baseColor, textFontSize, textLetterSpacing, textFontWeight } = useStore();

  const displayText = (textInput || " ").toUpperCase();
  const tex = useCleanTextTexture(displayText, false, textFontSize, textLetterSpacing, textFontWeight);

  useFrame((state, delta) => {
    if(!textRef.current) return;
    const { bass, lowMid, treble, beat, energy } = audioEngine.current;
    const transient = beat;
    const t = state.clock.elapsedTime * textSpeed;
    const react = bass * textReactive + (beat * 0.5 * textReactive);

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

    if (liquidTextMaterialRef.current) {
      const targetSpeed = 0.09 + energy * 0.32 + bass * 0.42 + lowMid * 0.18 + beat * 0.28 + transient * 0.2;
      liquidTextSpeedRef.current += (targetSpeed - liquidTextSpeedRef.current) * 0.06;
      liquidTextTimeRef.current += delta * liquidTextSpeedRef.current * Math.max(0.25, textSpeed);

      const uniforms = liquidTextMaterialRef.current.uniforms;
      uniforms.tText.value = tex;
      uniforms.uTime.value = liquidTextTimeRef.current;
      uniforms.uBass.value += (bass - uniforms.uBass.value) * 0.08;
      uniforms.uLowMid.value += (lowMid - uniforms.uLowMid.value) * 0.07;
      uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * 0.07;
      uniforms.uGlow.value = textGlow;
      uniforms.uTextColor.value.set(baseColor);
    }
  });

  if(!textInput || textInput === " " || currentScene === 'Dumbar') return null;

  return (
    <mesh ref={textRef} position={[0, 0, 1]}>
      <planeGeometry args={[20, 10]} />
      {currentScene === 'Liquid' ? (
        <shaderMaterial
          ref={liquidTextMaterialRef}
          vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={liquidTextFragment}
          uniforms={{
            tText: { value: tex },
            uTime: { value: 0 },
            uBass: { value: 0 },
            uLowMid: { value: 0 },
            uEnergy: { value: 0 },
            uGlow: { value: textGlow },
            uTextColor: { value: new THREE.Color(baseColor) },
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      ) : (
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      )}
    </mesh>
  );
}

// === HIGH-END POST PROCESSING ===
function PostProcessing() {
  const { bloomIntensity, rgbSplitAmount, glitchActive } = useStore();
  const [dynamicBloom, setDynamicBloom] = useState(bloomIntensity);
  const [dynamicSplit, setDynamicSplit] = useState(rgbSplitAmount);

  useFrame(() => {
    const { energy, beat, bass } = audioEngine.current;
    
    // Dynamic bloom
    const targetBloom = bloomIntensity + (energy * 0.5) + (beat * 2.0);
    setDynamicBloom(prev => prev + (targetBloom - prev) * 0.1); 

    // Dynamic Chromatic Aberration
    const targetSplit = rgbSplitAmount + (bass * 0.015) + (beat * 0.03);
    setDynamicSplit(prev => prev + (targetSplit - prev) * 0.2);
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom 
        luminanceThreshold={0.2} 
        luminanceSmoothing={0.9} 
        intensity={dynamicBloom} 
        mipmapBlur
      />
      {glitchActive && (
        <Glitch 
          delay={new THREE.Vector2(0.5, 1.5)} 
          duration={new THREE.Vector2(0.1, 0.3)} 
          strength={new THREE.Vector2(0.3, 1.0)} 
          mode={GlitchMode.SPORADIC}
          ratio={0.85}
        />
      )}
      <ChromaticAberration offset={new THREE.Vector2(dynamicSplit, dynamicSplit)} />
      <Vignette eskil={false} offset={0.1} darkness={1.1} />
    </EffectComposer>
  );
}

export function Visualizer() {
  const { contrast, brightness, saturation, bgColor } = useStore();
  
  return (
    <div 
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        filter: `contrast(${contrast}) brightness(${brightness}) saturate(${saturation})`
      }}
    >
      <Canvas
        className="pointer-events-none"
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[bgColor]} />
        <SceneRouter />
        <VisualText />
        <PostProcessing />
      </Canvas>
    </div>
  );
}

