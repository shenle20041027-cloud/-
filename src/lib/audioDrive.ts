import { audioEngine } from './AudioEngine';

export type AudioDriveMode = 'mic' | 'music' | 'low' | 'mid' | 'high';

export interface AudioDriveSnapshot {
  volume: number;
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  energy: number;
  beat: number;
  spectralCentroid: number;
  spectralFlux: number;
  transient: number;
  dynamicRange: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

let musicProjectSnapshot: AudioDriveSnapshot = {
  volume: 0,
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  treble: 0,
  energy: 0,
  beat: 0,
  spectralCentroid: 0,
  spectralFlux: 0,
  transient: 0,
  dynamicRange: 0,
};

export function setMusicProjectSnapshot(next: Partial<AudioDriveSnapshot>) {
  musicProjectSnapshot = {
    ...musicProjectSnapshot,
    ...next,
  };
}

const pulse = (time: number, rate: number) => {
  const wave = Math.sin(time * rate);
  return Math.pow(Math.max(0, wave), 2.2);
};

export function getAudioDriveSnapshot(mode: AudioDriveMode): AudioDriveSnapshot {
  if (mode === 'mic') {
    return { ...audioEngine.current };
  }

  if (mode === 'music') {
    musicProjectSnapshot = {
      volume: musicProjectSnapshot.volume * 0.94,
      subBass: musicProjectSnapshot.subBass * 0.9,
      bass: musicProjectSnapshot.bass * 0.9,
      lowMid: musicProjectSnapshot.lowMid * 0.92,
      mid: musicProjectSnapshot.mid * 0.92,
      highMid: musicProjectSnapshot.highMid * 0.9,
      treble: musicProjectSnapshot.treble * 0.9,
      energy: musicProjectSnapshot.energy * 0.94,
      beat: musicProjectSnapshot.beat * 0.7,
      spectralCentroid: musicProjectSnapshot.spectralCentroid * 0.92,
      spectralFlux: musicProjectSnapshot.spectralFlux * 0.78,
      transient: musicProjectSnapshot.transient * 0.72,
      dynamicRange: musicProjectSnapshot.dynamicRange * 0.94,
    };
    return { ...musicProjectSnapshot };
  }

  const time = typeof performance === 'undefined' ? Date.now() * 0.001 : performance.now() * 0.001;
  const slowPulse = pulse(time, 3.2);
  const mediumPulse = pulse(time, 5.5);
  const fastPulse = pulse(time, 9.5);

  if (mode === 'low') {
    return {
      volume: 0.35 + slowPulse * 0.55,
      subBass: 0.55 + slowPulse * 0.45,
      bass: 0.5 + slowPulse * 0.45,
      lowMid: 0.12 + slowPulse * 0.12,
      mid: 0.08,
      highMid: 0.03,
      treble: 0.02,
      energy: 0.45 + slowPulse * 0.4,
      beat: slowPulse > 0.86 ? 1.05 : 0,
      spectralCentroid: 0.18 + slowPulse * 0.08,
      spectralFlux: slowPulse > 0.78 ? 0.48 : 0.08,
      transient: slowPulse > 0.88 ? 0.72 : 0.06,
      dynamicRange: 0.62 + slowPulse * 0.18,
    };
  }

  if (mode === 'mid') {
    return {
      volume: 0.3 + mediumPulse * 0.42,
      subBass: 0.04,
      bass: 0.1 + mediumPulse * 0.08,
      lowMid: 0.42 + mediumPulse * 0.35,
      mid: 0.5 + mediumPulse * 0.38,
      highMid: 0.22 + mediumPulse * 0.18,
      treble: 0.08,
      energy: 0.34 + mediumPulse * 0.34,
      beat: mediumPulse > 0.9 ? 0.65 : 0,
      spectralCentroid: 0.38 + mediumPulse * 0.16,
      spectralFlux: mediumPulse > 0.72 ? 0.42 : 0.12,
      transient: mediumPulse > 0.88 ? 0.58 : 0.08,
      dynamicRange: 0.42 + mediumPulse * 0.22,
    };
  }

  return {
    volume: 0.24 + fastPulse * 0.34,
    subBass: 0.02,
    bass: 0.04,
    lowMid: 0.08,
    mid: 0.18 + fastPulse * 0.12,
    highMid: 0.45 + fastPulse * 0.4,
    treble: 0.52 + fastPulse * 0.42,
    energy: 0.26 + fastPulse * 0.3,
    beat: clamp01(fastPulse * 0.5),
    spectralCentroid: 0.68 + fastPulse * 0.22,
    spectralFlux: 0.18 + fastPulse * 0.58,
    transient: fastPulse > 0.82 ? 0.72 : fastPulse * 0.32,
    dynamicRange: 0.28 + fastPulse * 0.34,
  };
}
