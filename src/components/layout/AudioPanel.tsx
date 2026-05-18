import { useStore } from '@/store/useStore';
import { Settings2, Volume2, Activity } from 'lucide-react';
import { t } from '@/lib/i18n';

const Slider = ({ label, value, onChange, min = 0, max = 2, step = 0.01 }: any) => (
  <div className="flex flex-col gap-2 mb-4">
    <div className="flex justify-between text-[10px] uppercase font-bold text-white/40 tracking-widest">
      <span>{label}</span>
      <span className="text-white bg-white/5 px-2 py-0.5 rounded border border-white/5">{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-150 transition-all cursor-pointer"
    />
  </div>
);

export function AudioPanel() {
  const { inputGain, bassReact, midReact, trebReact, setAudioControl, language,
          subBassSense, bassSense, midSense, trebleSense, noiseGate, beatMultiplier, setAudioParam } = useStore();
  const i18n = t[language];

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-green-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.ADVANCED_AUDIO_CONSOLE || 'Advanced Audio Console'}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      </div>
      
      <div className="pt-2">
        <div className="mb-6 border-b border-white/5 pb-4">
          <h3 className="text-[9px] uppercase tracking-widest text-white/30 mb-4 font-bold">{i18n.INPUT_DYNAMICS || 'Input & Dynamics'}</h3>
          <Slider 
            label={i18n.MASTER_GAIN || 'Master Gain'} 
            value={inputGain} 
            onChange={(v: number) => setAudioControl('inputGain', v)} 
            max={5} 
          />
          <Slider 
            label={i18n.NOISE_GATE || 'Noise Gate'} 
            value={noiseGate} 
            onChange={(v: number) => setAudioParam('noiseGate', v)} 
            max={1} 
          />
          <Slider 
            label={i18n.BEAT_MULTIPLIER || 'Beat Detection Multiplier'} 
            value={beatMultiplier} 
            onChange={(v: number) => setAudioParam('beatMultiplier', v)} 
            max={3} 
          />
        </div>

        <div className="border-b border-white/5 pb-4 mb-4">
          <h3 className="text-[9px] uppercase tracking-widest text-white/30 mb-4 font-bold">{i18n.FREQUENCY_SENSITIVITIES || 'Frequency Sensitivities'}</h3>
          <Slider 
            label={i18n.SUB_BASS || 'Sub Bass (20-60Hz)'} 
            value={subBassSense} 
            onChange={(v: number) => setAudioParam('subBassSense', v)} 
            max={3} 
          />
          <Slider 
            label={i18n.BASS_RANGE || 'Bass (60-250Hz)'} 
            value={bassSense} 
            onChange={(v: number) => setAudioParam('bassSense', v)} 
            max={3} 
          />
          <Slider 
            label={i18n.MID_RANGE || 'Mid (250-2000Hz)'} 
            value={midSense} 
            onChange={(v: number) => setAudioParam('midSense', v)} 
            max={3} 
          />
          <Slider 
            label={i18n.TREBLE_RANGE || 'Treble (6000Hz+)'} 
            value={trebleSense} 
            onChange={(v: number) => setAudioParam('trebleSense', v)} 
            max={3} 
          />
        </div>

        <div>
          <h3 className="text-[9px] uppercase tracking-widest text-white/30 mb-4 font-bold">{i18n.LEGACY_ROUTING || 'Legacy Routing'}</h3>
          <Slider 
            label={i18n.BASS_ROUTING || 'Bass Routing'} 
            value={bassReact} 
            onChange={(v: number) => setAudioControl('bassReact', v)} 
            max={3} 
          />
          <Slider 
            label={i18n.MID_ROUTING || 'Mid Routing'} 
            value={midReact} 
            onChange={(v: number) => setAudioControl('midReact', v)} 
            max={3} 
          />
        </div>
      </div>
    </div>
  );
}
