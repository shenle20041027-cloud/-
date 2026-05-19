import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { BrainCircuit, Move, Orbit, Power, Save, Wand2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import { getAudioDriveSnapshot, type AudioDriveMode } from '@/lib/audioDrive';

const Toggle = ({ label, active, onToggle }: any) => (
  <div className="flex justify-between items-center gap-4">
    <span className="text-[10px] uppercase font-bold text-white/45 tracking-widest leading-tight">{label}</span>
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative transition-colors duration-300 shrink-0 ${active ? 'bg-orange-400' : 'bg-white/10'}`}
    >
      <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform duration-300 ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

const MicMeter = ({ label, value, active }: { label: string; value: number; active?: boolean }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest">
      <span className="text-white/45">{label}</span>
      <span className={active ? 'text-orange-300' : 'text-white/45'}>{active ? 'LIVE' : Math.round(value * 100)}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${active ? 'bg-orange-300' : 'bg-white'}`}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  </div>
);

export function ControlPanel() {
  const {
    autoVjEnabled,
    audioDriveMode,
    musicCameraEnabled,
    visualMemories,
    setAutoVjControl,
    setAudioDriveMode,
    saveVisualMemory,
    applyVisualMemory,
    setPerformanceControl,
    language
  } = useStore();
  const i18n = t[language];
  const padRef = useRef<HTMLDivElement>(null);
  const [padPos, setPadPos] = useState({ x: 0.5, y: 0.5 }); // Initialize to center
  const [isDragging, setIsDragging] = useState(false);
  const [micLevels, setMicLevels] = useState({ volume: 0, bass: 0, beat: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updatePad(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) updatePad(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updatePad = (e: React.PointerEvent) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = 1.0 - ((e.clientY - rect.top) / rect.height); // Invert Y so up is 1.0

    // Clamp
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    setPadPos({ x, y });
    setPerformanceControl('speed', 0.25 + x * 2.25); // Map X to glass/scene motion speed
    setPerformanceControl('chaos', y * 2.0); // Map Y to chaos
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  useEffect(() => {
    let animationFrameId = 0;

    const updateMicLevels = () => {
      const { volume, bass, subBass, mid, highMid, treble, beat } = getAudioDriveSnapshot(audioDriveMode);
      setMicLevels({
        volume: Math.min(1, volume * 2.5),
        bass: Math.min(1, Math.max(bass, subBass, mid, highMid, treble) * 2.2),
        beat: Math.min(1, beat),
      });
      animationFrameId = requestAnimationFrame(updateMicLevels);
    };

    updateMicLevels();
    return () => cancelAnimationFrame(animationFrameId);
  }, [audioDriveMode]);

  const driveOptions: Array<{ mode: AudioDriveMode; label: string }> = [
    { mode: 'mic', label: i18n.DRIVE_MIC || 'Mic' },
    { mode: 'music', label: i18n.DRIVE_MUSIC || 'Music' },
    { mode: 'low', label: i18n.DRIVE_LOW || 'Low' },
    { mode: 'mid', label: i18n.DRIVE_MID || 'Mid' },
    { mode: 'high', label: i18n.DRIVE_HIGH || 'High' },
  ];

  return (
    <div className="w-full p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-3">
           <Move size={16} className="text-orange-400" />
           <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.PERFORMANCE_PAD}</span>
        </div>
        <span className="text-[10px] font-mono text-white/40">X:{padPos.x.toFixed(2)} Y:{padPos.y.toFixed(2)}</span>
      </div>
      
      <div 
        ref={padRef}
        className="relative w-full aspect-square bg-[#030205] border border-white/10 rounded-xl cursor-crosshair touch-none overflow-hidden hover:border-white/30 transition-colors shadow-inner"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Grid lines and background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.05)_0%,transparent_70%)]"></div>
        <div className="absolute h-px w-full bg-white/5 top-1/2"></div>
        <div className="absolute w-px h-full bg-white/5 left-1/2"></div>
        
        {/* Cursor */}
        <div 
          className="absolute w-6 h-6 -ml-3 -mt-3 pointer-events-none transition-all duration-75"
          style={{ 
            left: `${padPos.x * 100}%`, 
            top: `${(1 - padPos.y) * 100}%` 
          }}
        >
          <div className="absolute inset-0 border-2 border-white rounded-full opacity-80 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
        </div>
        <div className="absolute bottom-3 left-3 text-[9px] text-white/30 uppercase max-w-full font-bold tracking-widest pointer-events-none break-keep w-32">{i18n.PAD_INFO}</div>
      </div>

      <div className="mt-2 flex flex-col gap-4 border-t border-white/10 pt-5">
        <div className="flex items-center gap-3 text-white/80">
          <Wand2 size={15} className="text-orange-300" />
          <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.AUDIO_MORPH_ENGINE || 'Audio Morph Engine'}</span>
        </div>

        <button
          onClick={() => setAutoVjControl('autoVjEnabled', !autoVjEnabled)}
          className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-all ${
            autoVjEnabled
              ? 'border-orange-400/60 bg-orange-400 text-black shadow-[0_0_24px_rgba(251,146,60,0.18)]'
              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Power size={15} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-widest">{i18n.MUSIC_DYNAMICS_LINK || 'Music Dynamics Link'}</span>
              <span className={`mt-1 block text-[9px] leading-snug ${autoVjEnabled ? 'text-black/60' : 'text-white/35'}`}>
                {i18n.MUSIC_DYNAMICS_HINT || 'Sound strength and beat drive the current visual motion.'}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider">{autoVjEnabled ? (i18n.ON || 'ON') : (i18n.OFF || 'OFF')}</span>
        </button>

        <Toggle
          label={i18n.ORBIT_CAMERA_WITH_MUSIC || 'Orbit camera with music'}
          active={musicCameraEnabled}
          onToggle={() => setAutoVjControl('musicCameraEnabled', !musicCameraEnabled)}
        />

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">{i18n.AUDIO_DRIVE_SOURCE || 'Drive Source'}</span>
          <div className="grid grid-cols-5 gap-2">
            {driveOptions.map((option) => (
              <button
                key={option.mode}
                onClick={() => setAudioDriveMode(option.mode)}
                className={`h-9 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  audioDriveMode === option.mode
                    ? 'border-orange-300 bg-orange-300 text-black'
                    : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/75">
              {audioDriveMode === 'mic' ? (i18n.LIVE_MIC_INPUT || 'Live Mic Input') : (i18n.AUDIO_DRIVE_SOURCE || 'Drive Source')}
            </span>
            <span className={`h-2 w-2 rounded-full ${autoVjEnabled ? 'bg-orange-300 shadow-[0_0_12px_rgba(253,186,116,0.9)]' : 'bg-white/20'}`} />
          </div>
          <div className="flex flex-col gap-3">
            <MicMeter label={i18n.DRIVE_LEVEL || 'Drive Level'} value={micLevels.volume} />
            <MicMeter label={i18n.DRIVE_BAND_ENERGY || 'Band Energy'} value={micLevels.bass} />
            <MicMeter label={i18n.DRIVE_PULSE || 'Pulse'} value={micLevels.beat} active={micLevels.beat > 0.1} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white/80">
            <BrainCircuit size={15} className="text-cyan-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.VISUAL_MEMORY || 'Visual Memory'}</span>
          </div>
          <button
            onClick={saveVisualMemory}
            className="h-8 w-8 rounded-lg bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
            title={i18n.SAVE_CURRENT_VISUAL_STATE || 'Save current visual state'}
          >
            <Save size={14} />
          </button>
        </div>

        {visualMemories.length === 0 ? (
          <div className="text-[10px] leading-relaxed text-white/35 border border-dashed border-white/10 rounded-lg p-3">
            {i18n.VISUAL_MEMORY_EMPTY || 'Save a look after tuning scene, colors and FX. Memories are recalled manually, so music keeps the current visual identity.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visualMemories.map((memory, index) => (
              <button
                key={memory.id}
                onClick={() => applyVisualMemory(memory.id)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white hover:text-black transition-colors"
              >
                <Orbit size={13} className="shrink-0" />
                <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider">
                  {index + 1}. {memory.currentScene}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
