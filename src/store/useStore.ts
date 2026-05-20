import { create } from 'zustand';

interface VisualizerState {
  audioReady: boolean;
  setAudioReady: (ready: boolean) => void;
  
  // Language
  language: 'EN' | 'ZH';
  setLanguage: (lang: 'EN' | 'ZH') => void;
  
  // Audio Controls
  inputGain: number;
  bassReact: number;
  midReact: number;
  trebReact: number;
  setAudioControl: (key: 'inputGain' | 'bassReact' | 'midReact' | 'trebReact', value: number) => void;

  // FX Controls
  bloomIntensity: number;
  bloomThreshold: number;
  glitchActive: boolean;
  rgbSplitAmount: number;
  distortion: number;
  setFxControl: (key: 'bloomIntensity' | 'bloomThreshold' | 'glitchActive' | 'rgbSplitAmount' | 'distortion', value: number | boolean) => void;

  // Performance Controls
  speed: number;
  chaos: number;
  setPerformanceControl: (key: 'speed' | 'chaos', value: number) => void;
  
  // Scene
  currentScene: string;
  setCurrentScene: (scene: string) => void;

  // Text Engine
  textInput: string;
  textAnimStyle: string;
  textGlow: number;
  textSpeed: number;
  textReactive: number;
  textFontSize: number;
  textFontWeight: number;
  textLetterSpacing: number;
  setTextEngine: (key: 'textInput' | 'textAnimStyle' | 'textGlow' | 'textSpeed' | 'textReactive' | 'textFontSize' | 'textFontWeight' | 'textLetterSpacing', value: string | number) => void;

  // Enhancements
  baseColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  saturation: number;
  contrast: number;
  brightness: number;
  gamma: number;
  exposure: number;
  setColorGrading: (key: Extract<keyof VisualizerState, 'baseColor' | 'secondaryColor' | 'accentColor' | 'bgColor' | 'saturation' | 'contrast' | 'brightness' | 'gamma' | 'exposure'>, value: string | number) => void;

  // Audio Advanced
  subBassSense: number;
  bassSense: number;
  midSense: number;
  trebleSense: number;
  noiseGate: number;
  beatMultiplier: number;
  setAudioParam: (key: Extract<keyof VisualizerState, 'subBassSense' | 'bassSense' | 'midSense' | 'trebleSense' | 'noiseGate' | 'beatMultiplier'>, value: number) => void;

  isFullscreen: boolean;
  setIsFullscreen: (val: boolean) => void;
  activeLeftPanel: string;
  setActiveLeftPanel: (panel: string) => void;
  applyPreset: (presetId: string) => void;
}

export const useStore = create<VisualizerState>((set) => ({
  audioReady: false,
  setAudioReady: (ready) => set({ audioReady: ready }),

  // Language
  language: 'EN',
  setLanguage: (lang) => set({ language: lang }),

  // Audio Defaults
  inputGain: 1.0,
  bassReact: 1.5,
  midReact: 1.0,
  trebReact: 1.2,
  setAudioControl: (key, value) => set({ [key]: value }),

  // FX Defaults
  bloomIntensity: 1.5,
  bloomThreshold: 0.2,
  glitchActive: false,
  rgbSplitAmount: 0.005,
  distortion: 0.0,
  setFxControl: (key, value) => set({ [key]: value }),

  // Performance Defaults
  speed: 1.0,
  chaos: 0.0,
  setPerformanceControl: (key, value) => set({ [key]: value }),

  // Scene
  currentScene: 'Cyber',
  setCurrentScene: (scene) => set({ currentScene: scene }),

  // Text Engine Defaults
  textInput: 'NEONPULSE',
  textAnimStyle: 'Cinematic Title',
  textGlow: 1.0,
  textSpeed: 1.0,
  textReactive: 1.0,
  textFontSize: 5.0,
  textFontWeight: 900,
  textLetterSpacing: -0.1,
  setTextEngine: (key, value) => set({ [key]: value }),

  baseColor: '#00f3ff',
  secondaryColor: '#bf00ff',
  accentColor: '#ffffff',
  bgColor: '#030008',
  saturation: 1.0,
  contrast: 1.0,
  brightness: 1.0,
  gamma: 1.0,
  exposure: 1.2,
  setColorGrading: (key, value) => set({ [key]: value as any }),

  subBassSense: 1.0,
  bassSense: 1.0,
  midSense: 1.0,
  trebleSense: 1.0,
  noiseGate: 0.1,
  beatMultiplier: 1.0,
  setAudioParam: (key, value) => set({ [key]: value }),

  isFullscreen: false,
  setIsFullscreen: (val) => set({ isFullscreen: val }),
  activeLeftPanel: 'Presets',
  setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel }),
  applyPreset: (presetId) => {
    switch(presetId) {
       case 'Cyberpunk':
          set({ currentScene: 'Cyber', baseColor: '#00f3ff', secondaryColor: '#bf00ff', bloomIntensity: 2, textAnimStyle: 'Glitch' });
          break;
       case 'Liquid Dream':
          set({ currentScene: 'Liquid', baseColor: '#b026ff', secondaryColor: '#00ccff', bloomIntensity: 1.5, textAnimStyle: 'Floating' });
          break;
       case 'Neon Pulse':
          set({ currentScene: 'Pulse', baseColor: '#ff007f', secondaryColor: '#ff003c', glitchActive: true, bloomIntensity: 3, textAnimStyle: 'Beat' });
          break;
       case 'Dark Space':
          set({ currentScene: 'Void', baseColor: '#ffffff', secondaryColor: '#444444', bloomIntensity: 1, textAnimStyle: 'Massive' });
          break;
       case 'Dumbar Base':
          set({ currentScene: 'Dumbar', baseColor: '#ffffff', secondaryColor: '#000000', bgColor: '#050505', textAnimStyle: 'Dumbar', contrast: 1.5, saturation: 1.0 });
          break;
    }
  }
}));
