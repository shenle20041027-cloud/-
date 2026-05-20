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
let musicProjectLastUpdate = 0;

let remoteAudioEnabled = false;
let remoteAudioLastUpdate = 0;
let remoteImpulse = 0;
let remoteImpulseLastUpdate = 0;
let remoteAudioSnapshot: AudioDriveSnapshot = {
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
  musicProjectLastUpdate = typeof performance === 'undefined' ? Date.now() : performance.now();
  musicProjectSnapshot = {
    ...musicProjectSnapshot,
    ...next,
  };
}

export function setRemoteAudioEnabled(enabled: boolean) {
  remoteAudioEnabled = enabled;
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  remoteAudioLastUpdate = now;
  remoteImpulseLastUpdate = now;
}

export function setRemoteAudioSnapshot(next: Partial<AudioDriveSnapshot>, syncedSignal = 0) {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  remoteAudioLastUpdate = now;
  const screenImpact = clamp01((syncedSignal - 0.22) * 1.35);
  const incomingImpact = clamp01(Math.max(
    next.beat ?? 0,
    (next.transient ?? 0) * 0.95,
    (next.spectralFlux ?? 0) * 0.88,
    (next.energy ?? 0) * 0.72,
    (next.volume ?? 0) * 0.65,
    screenImpact,
  ));
  if (incomingImpact > remoteImpulse * 0.72) {
    remoteImpulse = Math.max(remoteImpulse * 0.35, incomingImpact);
    remoteImpulseLastUpdate = now;
  }
  remoteAudioSnapshot = {
    volume: Math.max(remoteAudioSnapshot.volume * 0.35, next.volume ?? remoteAudioSnapshot.volume),
    subBass: Math.max(remoteAudioSnapshot.subBass * 0.35, next.subBass ?? remoteAudioSnapshot.subBass),
    bass: Math.max(remoteAudioSnapshot.bass * 0.35, next.bass ?? remoteAudioSnapshot.bass),
    lowMid: Math.max(remoteAudioSnapshot.lowMid * 0.35, next.lowMid ?? remoteAudioSnapshot.lowMid),
    mid: Math.max(remoteAudioSnapshot.mid * 0.35, next.mid ?? remoteAudioSnapshot.mid),
    highMid: Math.max(remoteAudioSnapshot.highMid * 0.35, next.highMid ?? remoteAudioSnapshot.highMid),
    treble: Math.max(remoteAudioSnapshot.treble * 0.35, next.treble ?? remoteAudioSnapshot.treble),
    energy: Math.max(remoteAudioSnapshot.energy * 0.35, next.energy ?? remoteAudioSnapshot.energy),
    beat: Math.max(remoteAudioSnapshot.beat * 0.18, next.beat ?? remoteAudioSnapshot.beat),
    spectralCentroid: next.spectralCentroid ?? remoteAudioSnapshot.spectralCentroid,
    spectralFlux: Math.max(remoteAudioSnapshot.spectralFlux * 0.18, next.spectralFlux ?? remoteAudioSnapshot.spectralFlux),
    transient: Math.max(remoteAudioSnapshot.transient * 0.18, next.transient ?? remoteAudioSnapshot.transient),
    dynamicRange: Math.max(remoteAudioSnapshot.dynamicRange * 0.35, next.dynamicRange ?? remoteAudioSnapshot.dynamicRange),
  };
}

const pulse = (time: number, rate: number) => {
  const wave = Math.sin(time * rate);
  return Math.pow(Math.max(0, wave), 2.2);
};

export function getAudioDriveSnapshot(mode: AudioDriveMode): AudioDriveSnapshot {
  if (remoteAudioEnabled) {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const elapsed = now - remoteAudioLastUpdate;
    const impulseElapsed = now - remoteImpulseLastUpdate;
    const bodyHold = elapsed < 140 ? 1 : Math.max(0, 1 - (elapsed - 140) / 720);
    const hitHold = elapsed < 90 ? 1 : Math.max(0, 1 - (elapsed - 90) / 420);
    const impulseHold = impulseElapsed < 80 ? 1 : Math.max(0, 1 - (impulseElapsed - 80) / 520);
    const impact = clamp01(remoteImpulse * impulseHold);

    return {
      volume: clamp01(Math.max(remoteAudioSnapshot.volume * 1.12 * bodyHold, impact * 0.58)),
      subBass: clamp01(Math.max(remoteAudioSnapshot.subBass * 1.26 * bodyHold, impact * 0.72)),
      bass: clamp01(Math.max(remoteAudioSnapshot.bass * 1.3 * bodyHold, impact * 0.7)),
      lowMid: clamp01(Math.max(remoteAudioSnapshot.lowMid * 1.18 * bodyHold, impact * 0.42)),
      mid: clamp01(Math.max(remoteAudioSnapshot.mid * 1.14 * bodyHold, impact * 0.36)),
      highMid: clamp01(Math.max(remoteAudioSnapshot.highMid * 1.2 * bodyHold, impact * 0.46)),
      treble: clamp01(Math.max(remoteAudioSnapshot.treble * 1.22 * bodyHold, impact * 0.44)),
      energy: clamp01(Math.max(remoteAudioSnapshot.energy * 1.28 * bodyHold, impact * 0.82)),
      beat: clamp01(Math.max(remoteAudioSnapshot.beat * 1.75 * hitHold, impact * 0.78)),
      spectralCentroid: clamp01(remoteAudioSnapshot.spectralCentroid),
      spectralFlux: clamp01(Math.max(remoteAudioSnapshot.spectralFlux * 1.62 * hitHold, impact * 0.72)),
      transient: clamp01(Math.max(remoteAudioSnapshot.transient * 1.72 * hitHold, impact * 0.86)),
      dynamicRange: clamp01(Math.max(remoteAudioSnapshot.dynamicRange * 1.14 * bodyHold, impact * 0.5)),
    };
  }

  if (mode === 'mic') {
    return { ...audioEngine.current };
  }

  if (mode === 'music') {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const elapsed = now - musicProjectLastUpdate;
    const bodyHold = elapsed < 80 ? 1 : Math.max(0, 1 - (elapsed - 80) / 520);
    const hitHold = elapsed < 55 ? 1 : Math.max(0, 1 - (elapsed - 55) / 260);

    return {
      volume: clamp01(musicProjectSnapshot.volume * bodyHold),
      subBass: clamp01(musicProjectSnapshot.subBass * bodyHold),
      bass: clamp01(musicProjectSnapshot.bass * bodyHold),
      lowMid: clamp01(musicProjectSnapshot.lowMid * bodyHold),
      mid: clamp01(musicProjectSnapshot.mid * bodyHold),
      highMid: clamp01(musicProjectSnapshot.highMid * bodyHold),
      treble: clamp01(musicProjectSnapshot.treble * bodyHold),
      energy: clamp01(musicProjectSnapshot.energy * bodyHold),
      beat: clamp01(musicProjectSnapshot.beat * hitHold),
      spectralCentroid: clamp01(musicProjectSnapshot.spectralCentroid * bodyHold),
      spectralFlux: clamp01(musicProjectSnapshot.spectralFlux * hitHold),
      transient: clamp01(musicProjectSnapshot.transient * hitHold),
      dynamicRange: clamp01(musicProjectSnapshot.dynamicRange * bodyHold),
    };
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
