/**
 * 频率响应视觉效果增强
 * 根据URL音频的中高低频实时调整动效
 */

import * as THREE from 'three';
import { audioEngine } from './AudioEngine';

export interface FrequencyVisualEffects {
  // 基于频率的缩放因子
  lowFreqScale: number;      // 低频缩放 (20-250Hz)
  midFreqScale: number;      // 中频缩放 (250-2000Hz)
  highFreqScale: number;     // 高频缩放 (2000-20000Hz)
  
  // 基于频率的颜色调整
  lowFreqColorIntensity: number;
  midFreqColorIntensity: number;
  highFreqColorIntensity: number;
  
  // 基于频率的效果强度
  bloomIntensityMultiplier: number;
  glitchIntensityMultiplier: number;
  aberrationMultiplier: number;
  
  // 基于频率的变换
  rotationIntensity: number;
  positionJitterIntensity: number;
}

export class FrequencyVisualEngine {
  private lowFreqReact: number = 1.5;
  private midFreqReact: number = 1.0;
  private highFreqReact: number = 1.2;
  private frequencySmoothing: number = 0.8;

  constructor() {}

  public setReactivity(
    lowFreqReact: number,
    midFreqReact: number,
    highFreqReact: number,
    frequencySmoothing: number
  ): void {
    this.lowFreqReact = lowFreqReact;
    this.midFreqReact = midFreqReact;
    this.highFreqReact = highFreqReact;
    this.frequencySmoothing = frequencySmoothing;
  }

  /**
   * 计算基于频率的视觉效果
   */
  public computeEffects(): FrequencyVisualEffects {
    const { subBass, bass, lowMid, mid, highMid, treble, energy, beat } = audioEngine.current;

    // 计算频率强度
    const lowFreq = (subBass + bass) / 2;
    const midFreq = (lowMid + mid) / 2;
    const highFreq = (highMid + treble) / 2;

    // 缩放因子：通过反应度和频率强度计算
    const lowFreqScale = 1.0 + lowFreq * this.lowFreqReact;
    const midFreqScale = 1.0 + midFreq * this.midFreqReact;
    const highFreqScale = 1.0 + highFreq * this.highFreqReact;

    // 颜色强度
    const lowFreqColorIntensity = lowFreq * 1.5;
    const midFreqColorIntensity = midFreq * 1.2;
    const highFreqColorIntensity = highFreq * 1.8;

    // 效果乘数
    const bloomIntensityMultiplier = 1.0 + (lowFreq * 1.5) + (midFreq * 0.8) + (highFreq * 0.5);
    const glitchIntensityMultiplier = 1.0 + (highFreq * 2.0) + (beat * 1.5);
    const aberrationMultiplier = 1.0 + (highFreq * 3.0) + (bass * 0.5);

    // 变换强度
    const rotationIntensity = lowFreq * 0.3 + midFreq * 0.2 + beat * 0.5;
    const positionJitterIntensity = highFreq * 0.4 + beat * 0.3;

    return {
      lowFreqScale,
      midFreqScale,
      highFreqScale,
      lowFreqColorIntensity,
      midFreqColorIntensity,
      highFreqColorIntensity,
      bloomIntensityMultiplier,
      glitchIntensityMultiplier,
      aberrationMultiplier,
      rotationIntensity,
      positionJitterIntensity,
    };
  }

  /**
   * 创建颜色渐变效果基于频率
   */
  public createFrequencyColor(baseColor: THREE.Color): THREE.Color {
    const effects = this.computeEffects();
    const color = baseColor.clone();

    // 根据频率调整颜色
    // 低频：偏红色
    // 中频：保持原色
    // 高频：偏蓝色
    const redBoost = effects.lowFreqColorIntensity * 0.3;
    const blueBoost = effects.highFreqColorIntensity * 0.3;

    color.r = Math.min(1, color.r + redBoost);
    color.b = Math.min(1, color.b + blueBoost);

    return color;
  }

  /**
   * 应用频率驱动的旋转
   */
  public applyFrequencyRotation(object: THREE.Object3D, timeElapsed: number): void {
    const effects = this.computeEffects();
    const { bass, midFreq: mid, treble } = this.getFrequencyData();

    object.rotation.x += (mid * this.midFreqReact) * 0.01 * effects.rotationIntensity;
    object.rotation.y += (bass * this.lowFreqReact) * 0.01 * effects.rotationIntensity;
    object.rotation.z += (treble * this.highFreqReact) * 0.005 * effects.rotationIntensity;
  }

  /**
   * 应用频率驱动的位置抖动
   */
  public applyFrequencyJitter(object: THREE.Object3D): void {
    const effects = this.computeEffects();
    const { highFreq } = this.getFrequencyData();

    // 使用噪声函数生成平滑的抖动
    const time = Date.now() * 0.001;
    object.position.x += Math.sin(time * 10 + highFreq * 5) * effects.positionJitterIntensity * 0.1;
    object.position.y += Math.cos(time * 12 + highFreq * 7) * effects.positionJitterIntensity * 0.1;
  }

  /**
   * 应用频率驱动的缩放
   */
  public applyFrequencyScale(object: THREE.Object3D): void {
    const effects = this.computeEffects();

    object.scale.x *= effects.lowFreqScale;
    object.scale.y *= effects.midFreqScale;
    object.scale.z *= (effects.lowFreqScale + effects.highFreqScale) / 2;
  }

  /**
   * 获取处理后的频率数据
   */
  private getFrequencyData() {
    const { subBass, bass, lowMid, mid, highMid, treble } = audioEngine.current;

    return {
      lowFreq: (subBass + bass) / 2,
      midFreq: (lowMid + mid) / 2,
      highFreq: (highMid + treble) / 2,
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      treble,
    };
  }

  /**
   * 获取综合的视觉强度 (0-1)
   */
  public getVisualIntensity(): number {
    const { lowFreq, midFreq, highFreq } = this.getFrequencyData();
    const { energy } = audioEngine.current;

    return Math.max(
      lowFreq * this.lowFreqReact,
      midFreq * this.midFreqReact,
      highFreq * this.highFreqReact,
      energy
    );
  }
}

export const frequencyVisualEngine = new FrequencyVisualEngine();
