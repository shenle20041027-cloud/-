import { useStore } from '@/store/useStore';
import { Aperture, Activity, Eye, Focus } from 'lucide-react';
import { t } from '@/lib/i18n';

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

export function CameraPanel() {
  const { currentScene, language } = useStore();
  const i18n = t[language];

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-3">
          <Aperture size={16} className="text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.AI_VISION_SYSTEM || 'AI Vision System'}</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
           <span className="text-[8px] uppercase tracking-widest text-white/40">{i18n.REC_INDICATOR || 'Rec'}</span>
        </div>
      </div>
      
      {currentScene !== 'Pulse' ? (
        <div className="w-full h-32 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center gap-3">
           <Eye size={24} className="text-white/20" />
           <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 text-center px-4">{i18n.SWITCH_NEON_PRESET || "Switch to 'Neon Pulse' Preset to activate vision rendering"}</span>
        </div>
      ) : (
        <div className="w-full aspect-video bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative overflow-hidden group">
           <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_0%,rgba(0,255,255,0.1)_50%,rgba(0,0,0,0)_100%)] animate-scan-fast pointer-events-none" />
           <Activity size={32} className="text-blue-400 opacity-50" />
           <div className="absolute top-2 left-2 text-[8px] font-mono text-white/50">CAM_01_ACTIVE</div>
           <div className="absolute bottom-2 right-2 text-[8px] font-mono text-white/50">TRACKING_HUMAN</div>
        </div>
      )}

      <div className="pt-2">
         <Toggle label={i18n.HUMAN_DETECTION || 'Human Detection'} active={true} onToggle={() => {}} />
         <Toggle label={i18n.PARTICLE_EXTRACTION || 'Particle Extraction'} active={true} onToggle={() => {}} />
         <Toggle label={i18n.AUDIENCE_REACTION || 'Audience Reaction'} active={true} onToggle={() => {}} />
         <Slider label={i18n.MOTION_TRACKING || 'Motion Tracking'} value={0.85} onChange={() => {}} />
         <Slider label={i18n.EXTRACTION_EDGE || 'Extraction Edge'} value={0.4} onChange={() => {}} />
      </div>
    </div>
  );
}
