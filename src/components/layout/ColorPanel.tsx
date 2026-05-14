import { useStore } from '@/store/useStore';
import { Palette, Pipette } from 'lucide-react';

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

const ColorPickerInput = ({ label, value, onChange }: any) => (
  <div className="flex items-center justify-between mb-3 bg-white/5 p-2 rounded-lg border border-white/5">
    <span className="text-[10px] uppercase font-bold text-white/60 tracking-widest pl-2">{label}</span>
    <div className="relative w-8 h-8 rounded-md overflow-hidden cursor-pointer border border-white/20 shadow-inner group">
      <input 
        type="color" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 pointer-events-none">
        <Pipette size={12} className="text-white" />
      </div>
    </div>
  </div>
);

export function ColorPanel() {
  const { 
    baseColor, secondaryColor, accentColor, bgColor,
    saturation, contrast, brightness, gamma, exposure,
    setColorGrading 
  } = useStore();

  const colors = [
    { name: 'Cyber Blue', value: '#00f3ff' },
    { name: 'Neon Purple', value: '#b026ff' },
    { name: 'Acid Green', value: '#39ff14' },
    { name: 'Infrared', value: '#ff003c' },
    { name: 'Monochrome', value: '#ffffff' },
  ];

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-white/80">
        <Palette size={16} className="text-pink-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Color & Mood</span>
      </div>
      
      <div className="flex flex-col gap-1">
        <ColorPickerInput label="Primary" value={baseColor} onChange={(v: string) => setColorGrading('baseColor', v)} />
        <ColorPickerInput label="Secondary" value={secondaryColor} onChange={(v: string) => setColorGrading('secondaryColor', v)} />
        <ColorPickerInput label="Accent" value={accentColor} onChange={(v: string) => setColorGrading('accentColor', v)} />
        <ColorPickerInput label="Background" value={bgColor} onChange={(v: string) => setColorGrading('bgColor', v)} />
      </div>

      <div className="h-px w-full bg-white/5 my-2" />

      <div className="pt-2">
        <Slider label="Saturation" value={saturation} onChange={(v: number) => setColorGrading('saturation', v)} max={3} />
        <Slider label="Contrast" value={contrast} onChange={(v: number) => setColorGrading('contrast', v)} max={3} />
        <Slider label="Brightness" value={brightness} onChange={(v: number) => setColorGrading('brightness', v)} max={3} />
        <Slider label="Exposure" value={exposure} onChange={(v: number) => setColorGrading('exposure', v)} max={3} />
      </div>
    </div>
  );
}
