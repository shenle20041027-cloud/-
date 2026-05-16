/**
 * 高级频率分析器
 * 提供详细的频率波段分析和实时数据供动效系统使用
 */

export interface FrequencyBands {
  // 低频段 (20-250Hz) - 影响整体动感和震感
  subBass: number;      // 20-60Hz - 超低频，极致感
  bass: number;         // 60-250Hz - 低频，强劲感

  // 中频段 (250-2000Hz) - 影响中间层次
  lowMid: number;       // 250-500Hz - 低中音
  mid: number;          // 500-2000Hz - 中音

  // 高频段 (2000-20000Hz) - 影响尖锐感和细节
  highMid: number;      // 2000-6000Hz - 高中音
  treble: number;       // 6000-20000Hz - 高频

  // 综合指标
  volume: number;       // 整体音量
  energy: number;       // 能量平均值
  beat: number;         // 节拍检测
}

export interface FrequencyConfig {
  // 各频段的感应度
  subBassSense: number;
  bassSense: number;
  midSense: number;
  trebleSense: number;
  
  // 其他参数
  noiseGate: number;
  beatThreshold: number;
  beatMultiplier: number;
  smoothing: number;
}

const DEFAULT_CONFIG: FrequencyConfig = {
  subBassSense: 1.0,
  bassSense: 1.0,
  midSense: 1.0,
  trebleSense: 1.0,
  noiseGate: 0.1,
  beatThreshold: 1.3,
  beatMultiplier: 1.0,
  smoothing: 0.8,
};

export class FrequencyAnalyzer {
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  private config: FrequencyConfig;
  private energyHistory: number[] = [];
  private energyIndex: number = 0;
  private smoothedData: FrequencyBands;
  private lastData: FrequencyBands;

  constructor(analyser: AnalyserNode, config: Partial<FrequencyConfig> = {}) {
    this.analyser = analyser;
    this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 初始化能量历史
    this.energyHistory = new Array(64).fill(0);
    this.energyIndex = 0;

    // 初始化数据
    const emptyBands: FrequencyBands = {
      subBass: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
      volume: 0,
      energy: 0,
      beat: 0,
    };
    
    this.smoothedData = { ...emptyBands };
    this.lastData = { ...emptyBands };
  }

  /**
   * 更新配置
   */
  public setConfig(config: Partial<FrequencyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 分析音频数据并返回频率信息
   */
  public analyze(gain: number = 1.0): FrequencyBands {
    this.analyser.getByteFrequencyData(this.dataArray);
    const data = this.dataArray;
    const length = data.length; // 1024 bins at 44100Hz = ~21.5Hz per bin

    const noiseGate = this.config.noiseGate * 255;

    // 频率映射
    // fftSize = 2048 时的频率分布：
    // 44100Hz / 2048 = ~21.5Hz per bin
    // Sub: 20-60Hz -> bins 0-3
    // Bass: 60-250Hz -> bins 3-12
    // LowMid: 250-500Hz -> bins 12-24
    // Mid: 500-2000Hz -> bins 24-93
    // HighMid: 2000-6000Hz -> bins 93-280
    // Treble: 6000-20000Hz -> bins 280+
    
    let volumeSum = 0;
    let subSum = 0;
    let bassSum = 0;
    let lowMidSum = 0;
    let midSum = 0;
    let highMidSum = 0;
    let trebleSum = 0;

    for (let i = 0; i < length; i++) {
      let val = data[i];
      if (val < noiseGate) val = 0;
      
      volumeSum += val;

      // 分段统计
      if (i >= 0 && i < 3) subSum += val;
      else if (i >= 3 && i < 12) bassSum += val;
      else if (i >= 12 && i < 24) lowMidSum += val;
      else if (i >= 24 && i < 93) midSum += val;
      else if (i >= 93 && i < 280) highMidSum += val;
      else if (i >= 280) trebleSum += val;
    }

    // 计算归一化的频率值
    const volume = (volumeSum / length / 255) * gain;
    const subBass = (subSum / 3 / 255) * gain * this.config.subBassSense;
    const bass = (bassSum / 9 / 255) * gain * this.config.bassSense;
    const lowMid = (lowMidSum / 12 / 255) * gain * this.config.midSense;
    const mid = (midSum / 69 / 255) * gain * this.config.midSense;
    const highMid = (highMidSum / 187 / 255) * gain * this.config.trebleSense;
    const treble = (trebleSum / (length - 280) / 255) * gain * this.config.trebleSense;

    // 计算能量
    const instantaneousEnergy = volume;
    this.energyHistory[this.energyIndex] = instantaneousEnergy;
    this.energyIndex = (this.energyIndex + 1) % this.energyHistory.length;

    let energyAverage = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      energyAverage += this.energyHistory[i];
    }
    energyAverage /= this.energyHistory.length;

    // 检测节拍
    const ratio = instantaneousEnergy / (energyAverage + 0.001);
    const beat = ratio > this.config.beatThreshold && instantaneousEnergy > 0.1 
      ? ratio * this.config.beatMultiplier 
      : 0;

    // 应用平滑
    const smoothing = this.config.smoothing;
    const currentData: FrequencyBands = {
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      treble,
      volume,
      energy: energyAverage,
      beat,
    };

    // 平滑所有值
    this.smoothedData = {
      subBass: this.lastData.subBass * smoothing + subBass * (1 - smoothing),
      bass: this.lastData.bass * smoothing + bass * (1 - smoothing),
      lowMid: this.lastData.lowMid * smoothing + lowMid * (1 - smoothing),
      mid: this.lastData.mid * smoothing + mid * (1 - smoothing),
      highMid: this.lastData.highMid * smoothing + highMid * (1 - smoothing),
      treble: this.lastData.treble * smoothing + treble * (1 - smoothing),
      volume: this.lastData.volume * smoothing + volume * (1 - smoothing),
      energy: energyAverage, // 不平滑能量值
      beat, // 不平滑节拍值
    };

    this.lastData = { ...this.smoothedData };
    return this.smoothedData;
  }

  /**
   * 获取当前的平滑数据
   */
  public getCurrentData(): FrequencyBands {
    return { ...this.smoothedData };
  }

  /**
   * 重置分析器
   */
  public reset(): void {
    this.energyHistory.fill(0);
    this.energyIndex = 0;
    const empty: FrequencyBands = {
      subBass: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
      volume: 0,
      energy: 0,
      beat: 0,
    };
    this.smoothedData = { ...empty };
    this.lastData = { ...empty };
  }

  /**
   * 获取频率值的组合强度 (用于整体效果强度)
   */
  public getFrequencyIntensity(): number {
    const data = this.smoothedData;
    return (data.subBass + data.bass + data.mid + data.highMid) / 4;
  }

  /**
   * 获取低频强度 (20-250Hz)
   */
  public getLowFrequencyIntensity(): number {
    const data = this.smoothedData;
    return (data.subBass + data.bass) / 2;
  }

  /**
   * 获取中频强度 (250-2000Hz)
   */
  public getMidFrequencyIntensity(): number {
    const data = this.smoothedData;
    return (data.lowMid + data.mid) / 2;
  }

  /**
   * 获取高频强度 (2000-20000Hz)
   */
  public getHighFrequencyIntensity(): number {
    const data = this.smoothedData;
    return (data.highMid + data.treble) / 2;
  }
}
