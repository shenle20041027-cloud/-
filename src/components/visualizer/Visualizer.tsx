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

function useTextTexture(text: string) {
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
    ctx.font = 'italic 900 280px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw multiple strokes spreading outwards
    const trailCount = 30;
    for (let i = 0; i < trailCount; i++) {
      const offsetX = Math.pow(i, 1.4) * 8.0; // Exponential spread
      ctx.globalAlpha = Math.max(0.0, 1.0 - (i / trailCount));
      // Left trail
      ctx.strokeText(text, 512 - offsetX, 280);
      // Right trail
      ctx.strokeText(text, 512 + offsetX, 280);
    }
    ctx.globalAlpha = 1.0;

    // Draw the core glitchy fill text
    ctx.fillStyle = 'white';
    ctx.font = 'italic 900 320px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(text, 512, 280);

    // Apply minor smearing horizontally on the basic form to bake in some motion blur
    ctx.globalAlpha = 0.3;
    ctx.fillText(text, 512 - 20, 280);
    ctx.fillText(text, 512 + 20, 280);
    ctx.globalAlpha = 1.0;

    texture.needsUpdate = true;
  }, [text, canvas, texture]);

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

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.5; // aspect ratio approximation
    
    // Add subtle wave distortion from audio
    p += vec2(sin(p.y * 3.0 + uTime), cos(p.x * 2.0 + uTime)) * (0.02 + uEnergy * 0.05);

    float d = 100.0;
    
    // Blob 1: Center pulsing
    d = smin(d, sdCircle(p - vec2(0.0, 0.0), 0.3 + uBass * 0.1), 0.2);
    
    // Blob 2: Orbiting fast
    vec2 pos2 = vec2(sin(uTime * 1.5), cos(uTime * 1.5)) * 0.5;
    d = smin(d, sdCircle(p - pos2, 0.15 + uLowMid * 0.1), 0.2);
    
    // Blob 3: Figure 8
    vec2 pos3 = vec2(sin(uTime * 0.8) * 0.8, sin(uTime * 1.6) * 0.4);
    d = smin(d, sdBox(p - pos3, vec2(0.2)), 0.3);
    
    // Blob 4: Random drift
    vec2 pos4 = vec2(cos(uTime * 0.5) * 0.6, sin(uTime * 0.7) * 0.6);
    d = smin(d, sdCircle(p - pos4, 0.2), 0.2);

    // Inner Cutout / Negative Space (creates hollow organic shapes like letters)
    float d_hole = sdCircle(p - vec2(sin(uTime), cos(uTime*1.2)) * 0.2, 0.15 + uEnergy*0.1);
    d = max(d, -d_hole); // subtract hole

    // Rendering
    // Background: Mauvey Pink #A8828C
    vec3 bgCol = vec3(0.66, 0.51, 0.55);
    
    // Colors for the shapes
    vec3 innerCol = vec3(0.0, 0.0, 0.0); // Inside is Black
    
    // Stroke / Outlines
    // We want a bright yellow/green core outline, and a purple outer outline
    float outlineWidth = 0.02 + uEnergy * 0.01;
    
    // Create the contour logic
    float fill = smoothstep(0.0, -0.01, d);             // 1 if inside, 0 if outside
    float strokeCore = smoothstep(0.01, -0.01, abs(d) - outlineWidth*0.5); // 1 on the exact boundary
    float strokeOuter = smoothstep(0.04, -0.01, abs(d) - outlineWidth); // slightly wider outer glow
    
    vec3 neonYellow = vec3(0.8, 1.0, 0.0);
    vec3 neonPurple = vec3(0.4, 0.0, 1.0);
    
    vec3 col = mix(bgCol, innerCol, fill);
    
    // Add strokes
    col = mix(col, neonPurple, strokeOuter * 0.8);
    col = mix(col, neonYellow, strokeCore);
    
    gl_FragColor = vec4(col, 1.0);
  }
`;

function LiquidScene() {
  const { speed } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame((state) => {
    if(!materialRef.current) return;
    const { bass, lowMid, energy } = audioEngine.current;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    materialRef.current.uniforms.uBass.value = bass;
    materialRef.current.uniforms.uLowMid.value = lowMid;
    materialRef.current.uniforms.uEnergy.value = energy;
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
  const { speed, baseColor, textInput } = useStore();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  
  // Use user text or default to "YOU"
  const textTexture = useTextTexture(textInput || "YOU");
  
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

const TRAIL_COUNT = 12;

function DumbarScene() {
  const { textInput } = useStore();
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
             fontSize={5}
             letterSpacing={-0.1}
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
    default: return <VoidScene />;
  }
}

function useCleanTextTexture(text: string, isDumbar: boolean = false) {
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const texture = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);

  useEffect(() => {
    // High res for crisp text
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 2048, 1024);

    if (isDumbar) {
      // Dumbar style: transparent background, crisp black or white text depending on inversion later
      // But let's just draw stark white text on transparent, we can tint via meshBasicMaterial
      ctx.fillStyle = 'rgba(255,255,255,1.0)';
      ctx.font = '900 480px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Slight letter spacing simulation by inserting thin spaces? No, native letter-spacing is hard.
      // We'll just rely on standard kerning.
      ctx.fillText(text, 1024, 512);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,1.0)';
      ctx.font = '900 360px Inter, system-ui, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw text
      ctx.fillText(text, 1024, 512);
    }

    texture.needsUpdate = true;
  }, [text, canvas, texture, isDumbar]);

  return texture;
}

// === CINEMATIC TYPOGRAPHY ===
function VisualText() {
  const textRef = useRef<THREE.Mesh>(null);
  const { currentScene, textInput, textAnimStyle, textGlow, textSpeed, textReactive, baseColor } = useStore();

  const displayText = (textInput || " ").toUpperCase();
  const tex = useCleanTextTexture(displayText, false);

  useFrame((state) => {
    if(!textRef.current) return;
    const { bass, treble, beat } = audioEngine.current;
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
  });

  if(!textInput || textInput === " " || currentScene === 'Dumbar') return null;

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
  const { isFullscreen, contrast, brightness, saturation, bgColor } = useStore();
  
  return (
    <div 
      className="absolute inset-0 w-full h-full"
      style={{
        filter: `contrast(${contrast}) brightness(${brightness}) saturate(${saturation})`
      }}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={[bgColor]} />
        <SceneRouter />
        <VisualText />
        <PostProcessing />
      </Canvas>
    </div>
  );
}

