import { useState, useEffect } from 'react';
import { Zap, BarChart3, Volume2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { t } from '@/lib/i18n';
import { audioEngine } from '@/lib/AudioEngine';

export function FrequencyResponsePanel() {
  const {
    language,
    audioSourceMode,
    lowFreqReact,
    midFreqReact,
    highFreqReact,
    frequencySmoothing,
    frequencyEnabled,
    urlAudioSmoothing,
    urlAudioBeatSensitivity,
    setFrequencyReact,
    setUrlAudioParam,
  } = useStore();

  const i18n = t[language];
  const [frequencyData, setFrequencyData] = useState({
    lowFreq: 0,
    midFreq: 0,
    highFreq: 0,
  });

  // 实时更新频率数据用于可视化
  useEffect(() => {
    if (audioSourceMode === 'url' && frequencyEnabled) {
      const updateFrequencyViz = () => {
        const current = audioEngine.current;
        setFrequencyData({
          lowFreq: (current.subBass + current.bass) / 2,
          midFreq: (current.lowMid + current.mid) / 2,
          highFreq: (current.highMid + current.treble) / 2,
        });
      };

      const interval = setInterval(updateFrequencyViz, 50);
      return () => clearInterval(interval);
    }
  }, [audioSourceMode, frequencyEnabled]);

  const handleFrequencyChange = (key: 'lowFreqReact' | 'midFreqReact' | 'highFreqReact', value: number) => {
    setFrequencyReact(key, value);
  };

  const handleSmoothingChange = (value: number) => {
    setFrequencyReact('frequencySmoothing', value);
  };

  const handleUrlAudioChange = (key: 'urlAudioSmoothing' | 'urlAudioBeatSensitivity', value: number) => {
    setUrlAudioParam(key, value);
  };

  const isUrlMode = audioSourceMode === 'url';

  return (
    <div className="w-full p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-3">
          <BarChart3 size={16} className="text-purple-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            频率响应 / FREQUENCY RESPONSE
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
          <div className={`w-1.5 h-1.5 rounded-full ${frequencyEnabled ? 'bg-purple-400' : 'bg-white/20'}`} />
          {frequencyEnabled ? '已启用' : '已禁用'}
        </div>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
          启用频率响应
        </label>
        <button
          onClick={() => setFrequencyReact('frequencyEnabled', !frequencyEnabled)}
          className={`relative w-11 h-6 rounded-full transition-all ${
            frequencyEnabled ? 'bg-purple-500/40' : 'bg-white/10'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-purple-400 rounded-full transition-transform ${
              frequencyEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {frequencyEnabled && (
        <>
          {/* 实时频率可视化 */}
          <div className="bg-black/40 rounded-lg p-4 border border-white/5">
            <p className="text-[9px] uppercase font-bold text-white/40 tracking-widest mb-3">
              实时频率显示
            </p>
            <div className="flex items-end justify-around gap-2 h-20">
              {/* 低频 */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 bg-gradient-to-t from-red-600 to-red-400 rounded-t transition-all"
                  style={{ height: `${Math.max(8, frequencyData.lowFreq * 80)}px` }}
                />
                <span className="text-[8px] text-white/50">低频</span>
              </div>

              {/* 中频 */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 bg-gradient-to-t from-yellow-600 to-yellow-400 rounded-t transition-all"
                  style={{ height: `${Math.max(8, frequencyData.midFreq * 80)}px` }}
                />
                <span className="text-[8px] text-white/50">中频</span>
              </div>

              {/* 高频 */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all"
                  style={{ height: `${Math.max(8, frequencyData.highFreq * 80)}px` }}
                />
                <span className="text-[8px] text-white/50">高频</span>
              </div>
            </div>
          </div>

          {/* 低频反应 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                <Volume2 size={12} className="text-red-400" />
                低频反应 (20-250Hz)
              </label>
              <span className="text-[11px] font-mono text-red-400/80">{lowFreqReact.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={lowFreqReact}
              onChange={(e) => handleFrequencyChange('lowFreqReact', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-400"
            />
          </div>

          {/* 中频反应 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                <Volume2 size={12} className="text-yellow-400" />
                中频反应 (250-2000Hz)
              </label>
              <span className="text-[11px] font-mono text-yellow-400/80">{midFreqReact.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={midFreqReact}
              onChange={(e) => handleFrequencyChange('midFreqReact', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-400"
            />
          </div>

          {/* 高频反应 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                <Volume2 size={12} className="text-blue-400" />
                高频反应 (2000-20000Hz)
              </label>
              <span className="text-[11px] font-mono text-blue-400/80">{highFreqReact.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={highFreqReact}
              onChange={(e) => handleFrequencyChange('highFreqReact', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-400"
            />
          </div>

          {/* 分隔线 */}
          <div className="border-t border-white/10" />

          {/* 频率平滑 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                <Zap size={12} className="text-purple-400" />
                频率平滑
              </label>
              <span className="text-[11px] font-mono text-purple-400/80">{frequencySmoothing.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={frequencySmoothing}
              onChange={(e) => handleSmoothingChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-400"
            />
            <p className="text-[9px] leading-relaxed text-white/30">
              控制频率数据的平滑程度，较低的值会使响应更敏捷
            </p>
          </div>

          {/* URL音频特定参数 */}
          {isUrlMode && (
            <>
              <div className="border-t border-white/10" />

              <div className="bg-cyan-400/5 border border-cyan-400/20 rounded-lg p-3">
                <p className="text-[9px] uppercase font-bold text-cyan-400 tracking-widest mb-3">
                  🎵 URL音频专属参数
                </p>

                {/* URL音频平滑 */}
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
                      URL平滑度
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400/80">
                      {urlAudioSmoothing.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={urlAudioSmoothing}
                    onChange={(e) => handleUrlAudioChange('urlAudioSmoothing', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* 节拍敏感度 */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
                      节拍敏感度
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400/80">
                      {urlAudioBeatSensitivity.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={urlAudioBeatSensitivity}
                    onChange={(e) => handleUrlAudioChange('urlAudioBeatSensitivity', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <p className="text-[9px] leading-relaxed text-white/30">
                    更高的值会让节拍检测更容易被触发
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!frequencyEnabled && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] leading-relaxed text-white/40">
          点击上方切换按钮启用频率响应功能
        </div>
      )}
    </div>
  );
}
