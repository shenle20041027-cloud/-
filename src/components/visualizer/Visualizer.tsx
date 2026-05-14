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
        video.play();
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
  uniform vec3 uColor;
  varying vec2 vUv;
  
  float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
  float noise(vec2 x) {
    vec2 i = floor(x); vec2 f = fract(x);
    float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  
  mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= 1.5;
    
    vec2 p = uv;
    p *= rot(uTime * 0.1);
    
    float n1 = noise(p * 2.0 + uTime * 0.5 + uBass) * 0.5;
    float n2 = noise(p * 4.0 - uTime * 0.2 + uLowMid) * 0.25;
    float n3 = noise(p * 8.0 + uTime * 0.8) * 0.125;
    float fbm = n1 + n2 + n3;
    
    float circle = length(uv) - (0.5 + uBass * 0.2 + fbm * 0.3);
    float glow = 0.05 / abs(circle);
    
    vec3 col = uColor * glow * (1.0 + fbm);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function LiquidScene() {
  const { baseColor, speed } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame((state) => {
    if(!materialRef.current) return;
    const { bass, lowMid } = audioEngine.current;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    materialRef.current.uniforms.uBass.value = bass;
    materialRef.current.uniforms.uLowMid.value = lowMid;
    materialRef.current.uniforms.uColor.value.set(baseColor);
  });

  return (
    <mesh position={[0,0,-2]} scale={[20, 10, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial 
        ref={materialRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={liquidFragment}
        uniforms={{
          uTime: { value: 0 },
          uBass: { value: 0 },
          uLowMid: { value: 0 },
          uColor: { value: new THREE.Color() }
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// 3. CYBER GRID (Perspective lines and glitching geometry)
function CyberScene() {
  const group = useRef<THREE.Group>(null);
  const { speed, baseColor } = useStore();
  
  useFrame((state, delta) => {
    if(!group.current) return;
    const { bass, beat, highMid } = audioEngine.current;
    group.current.position.z = (state.clock.elapsedTime * 5 * speed) % 2;
    group.current.rotation.z += delta * (0.05 + highMid * 0.5);
    group.current.scale.setScalar(1 + bass * 0.1 + beat * 0.2);
  });

  return (
    <group>
      <group ref={group} position={[0,-2,-10]} rotation={[Math.PI/2, 0, 0]}>
        <gridHelper args={[40, 40, baseColor, baseColor]} />
      </group>
      <group position={[0,2,-10]} rotation={[-Math.PI/2, 0, 0]}>
        <gridHelper args={[40, 40, baseColor, baseColor]} />
      </group>
    </group>
  );
}

// 4. HOLOGRAM SCENE (Using Webcam via Shader)
const hologramFragment = `
  uniform sampler2D tCamera;
  uniform float uTime;
  uniform float uBass;
  uniform float uBeat;
  uniform float uTreble;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv;
    // Glitch effect on X based on bass and beat
    if(sin(p.y * 100.0 + uTime) > 0.9) {
      p.x += (sin(uTime * 10.0) * 0.02 * (uBass + uBeat));
    }
    
    vec4 cam = texture2D(tCamera, p);
    float luma = dot(cam.rgb, vec3(0.299, 0.587, 0.114));
    
    // Scanlines driven by treble
    float scanline = sin(vUv.y * 200.0 - uTime * (10.0 + uTreble * 50.0)) * 0.1 + 0.9;
    
    vec3 finalColor = uColor * luma * scanline * (1.0 + uBass * 0.5 + uBeat * 2.0);
    gl_FragColor = vec4(finalColor, min(1.0, luma * 2.0));
  }
`;

function HologramScene() {
  const camTex = useWebcamTexture();
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
      <planeGeometry args={[16*0.6, 9*0.6]} />
      <shaderMaterial 
        ref={matRef}
        vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={hologramFragment}
        uniforms={{
          tCamera: { value: camTex },
          uTime: { value: 0 },
          uBass: { value: 0 },
          uBeat: { value: 0 },
          uTreble: { value: 0 },
          uColor: { value: new THREE.Color() }
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function DumbarScene() {
  const { bgColor, baseColor, textInput } = useStore();
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  
  useFrame((state) => {
    if(!groupRef.current) return;
    const { bass, treble, beat } = audioEngine.current;
    
    // Background flashes on beat
    if (matRef.current) {
        if (beat > 0.5) {
            matRef.current.color.set(baseColor);
        } else {
            matRef.current.color.set(bgColor).lerp(new THREE.Color(baseColor), bass * 0.2);
        }
    }

    groupRef.current.scale.x = 1 + (bass * 2.5) + (beat * 2.0);
    groupRef.current.scale.y = 0.8 + (treble * 0.5) + (beat * 1.0);

    groupRef.current.children.forEach((child, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      child.position.x += dir * (0.02 + bass * 0.1 + beat * 0.5);
      if(child.position.x > 15) child.position.x = -15;
      if(child.position.x < -15) child.position.x = 15;
    });
  });

  const lines = new Array(7).fill(0);
  const displayText = (textInput || "KINETIC").toUpperCase();
  const repeatingText = `${displayText} \u2014 ${displayText} \u2014 ${displayText} \u2014 ${displayText}`;

  return (
    <group>
      <mesh position={[0,0,-20]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial ref={matRef} color={bgColor} />
      </mesh>
      <group ref={groupRef} position={[0, 0, -5]}>
        {lines.map((_, i) => (
          <Text
            key={i}
            position={[0, (i - 3) * 2.5, 0]}
            fontSize={2.5}
            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
            letterSpacing={-0.05}
            anchorX="center"
            anchorY="middle"
            whiteSpace="overflowWrap"
            color={baseColor}
          >
            {repeatingText}
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
    case 'Pulse': return <HologramScene />;
    case 'Void': return <VoidScene />;
    case 'Dumbar': return <DumbarScene />;
    default: return <VoidScene />;
  }
}

// === CINEMATIC TYPOGRAPHY ===
function VisualText() {
  const textRef = useRef<THREE.Mesh>(null);
  const { currentScene, textInput, textAnimStyle, textGlow, textSpeed, textReactive, baseColor } = useStore();

  useFrame((state) => {
    if(!textRef.current) return;
    const { bass, treble, beat } = audioEngine.current;
    const t = state.clock.elapsedTime * textSpeed;
    const react = bass * textReactive + (beat * 0.5 * textReactive);

    if(textAnimStyle === 'Cinematic') {
      textRef.current.scale.setScalar(1 + react * 0.2);
      textRef.current.position.y = Math.sin(t) * 0.2;
    } else if (textAnimStyle === 'Glitch') {
      textRef.current.scale.setScalar(1 + react);
      if(Math.random() > 0.8 || beat > 0.5) {
        textRef.current.position.x = (Math.random()-0.5)*0.5 * react;
      } else {
        textRef.current.position.x = 0;
      }
    } else if (textAnimStyle === 'Floating') {
      textRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
      textRef.current.position.y = Math.sin(t) * 0.5;
      textRef.current.scale.setScalar(1 + (react * 0.1));
    } else if (textAnimStyle === 'Massive') {
      textRef.current.scale.setScalar(4 + react * 2.5);
      textRef.current.position.z = -2 + (beat * 2.0);
    } 
    
    // Adjust material properties dynamically if needed
    const mat = textRef.current.material as THREE.MeshBasicMaterial;
    if(mat && mat.color) {
       mat.color.set(baseColor);
       mat.color.multiplyScalar(textGlow + beat * 2.0);
    }
  });

  if(!textInput || currentScene === 'Dumbar') return null;

  return (
    <Text
      ref={textRef}
      position={[0, 0, 1]}
      fontSize={1}
      font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
      anchorX="center"
      anchorY="middle"
      textAlign="center"
      maxWidth={15}
    >
      {textInput.toUpperCase()}
      <meshBasicMaterial transparent opacity={0.9} />
    </Text>
  );
}

// === HIGH-END POST PROCESSING ===
function PostProcessing() {
  const { bloomIntensity, rgbSplitAmount, glitchActive } = useStore();
  const [dynamicBloom, setDynamicBloom] = useState(bloomIntensity);

  useFrame(() => {
    const { energy, beat } = audioEngine.current;
    
    // Dynamic bloom
    const targetBloom = bloomIntensity + (energy * 0.5) + (beat * 2.0);
    setDynamicBloom(prev => prev + (targetBloom - prev) * 0.1); 
  });

  return (
    <EffectComposer multisampling={4}>
      <Bloom 
        luminanceThreshold={0.1} 
        luminanceSmoothing={0.9} 
        intensity={dynamicBloom} 
        mipmapBlur
      />
      {glitchActive && (
        <Glitch 
          delay={new THREE.Vector2(0.5, 1.5)} 
          duration={new THREE.Vector2(0.1, 0.3)} 
          strength={new THREE.Vector2(0.1, 0.5)} 
          mode={GlitchMode.SPORADIC}
          ratio={0.85}
        />
      )}
      <ChromaticAberration offset={new THREE.Vector2(rgbSplitAmount, rgbSplitAmount)} />
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

