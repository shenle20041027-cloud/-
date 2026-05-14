import { useStore } from '@/store/useStore';
import { Monitor } from 'lucide-react';
import { t } from '@/lib/i18n';

export function PresetPanel() {
  const { applyPreset, currentScene, language } = useStore();
  
  const presets = [
    { id: 'Cyberpunk', name: 'Cyberpunk', desc: 'Neon blue, high glitch', scene: 'Cyber' },
    { id: 'Liquid Dream', name: 'Liquid Dream', desc: 'Slow purple fluid', scene: 'Liquid' },
    { id: 'Dark Space', name: 'Dark Space', desc: 'Monochrome void', scene: 'Void' },
    { id: 'Neon Pulse', name: 'Neon Pulse', desc: 'Aggressive pink bass', scene: 'Pulse' },
    { id: 'Dumbar Base', name: 'Studio Dumbar', desc: 'High-contrast kinetic typography', scene: 'Dumbar' },
  ];

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-white/80">
        <Monitor size={16} className="text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Visual Templates</span>
      </div>
      
      <div className="flex flex-col gap-3">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset.id)}
            className={`flex flex-col items-start p-3 rounded-lg transition-all duration-300 border ${
              currentScene === preset.scene
                ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'
            }`}
          >
            <span className={`text-[11px] font-bold tracking-wider ${
               currentScene === preset.scene ? 'text-black' : 'text-white'
            }`}>{preset.name}</span>
            <span className={`text-[10px] mt-1 ${
               currentScene === preset.scene ? 'text-black/60' : 'text-white/40'
            }`}>{preset.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
