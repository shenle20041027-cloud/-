export class AudioEngine {
  private static instance: AudioEngine;
  
  public context: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  public dataArray: Uint8Array | null = null;
  public source: MediaStreamAudioSourceNode | null = null;
  
  // Expose analyzed data for Three.js to read synchronously without React state overhead
  public current = {
    volume: 0,
    subBass: 0, // 20-60Hz
    bass: 0,    // 60-250Hz
    lowMid: 0,  // 250-500Hz
    mid: 0,     // 500-2000Hz
    highMid: 0, // 2000-6000Hz
    treble: 0,  // 6000-20000Hz
    energy: 0,
    beat: 0, 
  };

  private beatThreshold = 1.3;
  private energyHistory: number[] = new Array(64).fill(0);
  private energyIndex = 0;

  private constructor() {}

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public isSimulating: boolean = false;
  private simTime: number = 0;

  public async initialize(): Promise<void> {
    if (this.context) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      await this.context.resume();
      
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isSimulating = false;
    } catch (err) {
      console.warn('Failed to initialize audio capture. Falling back to simulated audio:', err);
      this.isSimulating = true;
      // We don't throw error so the app can continue
    }
  }

  public update(gain: number = 1.0, config?: { subBassSense: number; bassSense: number; midSense: number; trebleSense: number; noiseGate: number; beatMultiplier: number }): void {
    if (this.isSimulating) {
      this.simTime += 0.016;
      const beat = Math.pow(Math.sin(this.simTime * 4), 2);
      this.current.volume = (0.2 + beat * 0.3) * gain;
      this.current.subBass = beat * 1.5 * gain;
      this.current.bass = beat * 0.8 * gain;
      this.current.lowMid = (Math.sin(this.simTime * 2) * 0.2 + 0.3) * gain;
      this.current.mid = (Math.sin(this.simTime * 4) * 0.2 + 0.3) * gain;
      this.current.highMid = (Math.sin(this.simTime * 6) * 0.1 + 0.2) * gain;
      this.current.treble = (Math.sin(this.simTime * 8) * 0.1 + 0.2) * gain;
      this.current.energy = this.current.volume;
      this.current.beat = beat > 0.8 ? 1 : 0;
      return;
    }

    if (!this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const data = this.dataArray;
    const length = data.length; // 1024 bins at 44100Hz = ~21.5Hz per bin
    
    const noiseGate = (config?.noiseGate ?? 0.1) * 255;

    // Frequencies approximate mappings:
    // Sub: 20-60Hz -> bins 1-3
    // Bass: 60-250Hz -> bins 3-12
    // LowMid: 250-500Hz -> bins 12-24
    // Mid: 500-2000Hz -> bins 24-93
    // HighMid: 2000-6000Hz -> bins 93-280
    // Treble: 6000-20000Hz -> bins 280+

    let vSum = 0, subSum = 0, bSum = 0, lmSum = 0, mSum = 0, hmSum = 0, tSum = 0;

    for (let i = 0; i < length; i++) {
      let val = data[i];
      if (val < noiseGate) val = 0;
      vSum += val;

      if (i >= 1 && i < 3) subSum += val;
      else if (i >= 3 && i < 12) bSum += val;
      else if (i >= 12 && i < 24) lmSum += val;
      else if (i >= 24 && i < 93) mSum += val;
      else if (i >= 93 && i < 280) hmSum += val;
      else if (i >= 280) tSum += val;
    }

    const subSense = config?.subBassSense ?? 1.0;
    const bassSense = config?.bassSense ?? 1.0;
    const midSense = config?.midSense ?? 1.0;
    const trebSense = config?.trebleSense ?? 1.0;
    const bm = config?.beatMultiplier ?? 1.0;

    const volume = (vSum / length / 255) * gain;
    this.current.volume = volume;
    this.current.subBass = (subSum / 2 / 255) * gain * subSense;
    this.current.bass = (bSum / 9 / 255) * gain * bassSense;
    this.current.lowMid = (lmSum / 12 / 255) * gain * midSense;
    this.current.mid = (mSum / 69 / 255) * gain * midSense;
    this.current.highMid = (hmSum / 187 / 255) * gain * trebSense;
    this.current.treble = (tSum / (length - 280) / 255) * gain * trebSense;

    // Advanced Energy & Beat Detection
    const instantaneousEnergy = volume;
    this.energyHistory[this.energyIndex] = instantaneousEnergy;
    this.energyIndex = (this.energyIndex + 1) % this.energyHistory.length;

    let localEnergyAverage = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
        localEnergyAverage += this.energyHistory[i];
    }
    localEnergyAverage /= this.energyHistory.length;

    this.current.energy = localEnergyAverage;

    // Beat Detection (Sudden peak in energy compared to local average)
    const ratio = instantaneousEnergy / (localEnergyAverage + 0.001);
    if (ratio > this.beatThreshold && instantaneousEnergy > 0.1) {
        this.current.beat = ratio * bm;
    } else {
        this.current.beat = 0;
    }
  }

  public destroy() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.context?.close();
    this.context = null;
  }
}

export const audioEngine = AudioEngine.getInstance();
