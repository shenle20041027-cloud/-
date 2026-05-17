import { useStore } from '@/store/useStore';
import { Zap } from 'lucide-react';
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

const Toggle = ({ label, active, onToggle }: any) => (
  <div className="flex justify-between items-center mb-4">
    <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">{label}</span>
    <button 
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${active ? 'bg-yellow-500' : 'bg-white/10'}`}
    >
      <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform duration-300 ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

export function FxPanel() {
  const { bloomIntensity, distortion, rgbSplitAmount, glitchActive, setFxControl, language } = useStore();
  const i18n = t[language];

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-white/80">
        <Zap size={16} className="text-yellow-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.FX_STACK || 'Post Processing'}</span>
      </div>
      
      <div className="pt-2">
        <Slider 
          label={i18n.BLOOM_INTENSITY || 'Bloom Intensity'}
          value={bloomIntensity} 
          onChange={(v: number) => setFxControl('bloomIntensity', v)} 
          max={5} 
        />
        <Slider 
          label={i18n.RGB_SPLIT || 'RGB Split'}
          value={rgbSplitAmount} 
          onChange={(v: number) => setFxControl('rgbSplitAmount', v)} 
          max={0.05} 
          step={0.001}
        />
        <Slider 
          label={i18n.LENS_DISTORTION || 'Lens Distortion'}
          value={distortion} 
          onChange={(v: number) => setFxControl('distortion', v)} 
          max={2} 
        />
        <Toggle 
          label={i18n.DIGITAL_GLITCH || 'Digital Glitch'}
          active={glitchActive}
          onToggle={() => setFxControl('glitchActive', !glitchActive)}
        />
      </div>
    </div>
  );
}
