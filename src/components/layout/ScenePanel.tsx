import { useStore } from '@/store/useStore';
import { LayoutGrid } from 'lucide-react';

const scenesConfig = [
  { id: 'Void', name: 'Dark Space' },
  { id: 'Liquid', name: 'Fluid Matrix' },
  { id: 'Cyber', name: 'Hologram Grid' },
  { id: 'Pulse', name: 'Sonic Pulse' },
  { id: 'Dumbar', name: 'Dumbar Type' },
];

export function ScenePanel() {
  const { currentScene, setCurrentScene } = useStore();

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-white/80">
        <LayoutGrid size={16} className="text-blue-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Active Architecture</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {scenesConfig.map((scene) => (
          <button
            key={scene.id}
            onClick={() => setCurrentScene(scene.id)}
            className={`py-3 px-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300 border ${
              currentScene === scene.id
                ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                : "bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white"
            }`}
          >
            {scene.name}
          </button>
        ))}
      </div>
    </div>
  );
}
