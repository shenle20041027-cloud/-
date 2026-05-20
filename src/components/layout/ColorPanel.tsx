import { useStore } from '@/store/useStore';
import { Palette, Pipette } from 'lucide-react';
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

const ColorPickerInput = ({ label, value, onChange }: any) => (
  <div className="flex items-center justify-between mb-3 bg-white/5 p-2 rounded-lg border border-white/5">
    <span className="text-[10px] uppercase font-bold text-white/60 tracking-widest pl-2">{label}</span>
    <label className="relative w-8 h-8 rounded-md overflow-hidden cursor-pointer border border-white/20 shadow-inner group" style={{ backgroundColor: value }}>
      <input 
        type="color" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 pointer-events-none">
        <Pipette size={12} className="text-white" />
      </div>
    </label>
  </div>
);

export function ColorPanel() {
  const { 
    baseColor, secondaryColor, accentColor, bgColor,
    saturation, contrast, brightness, gamma, exposure,
    setColorGrading, language 
  } = useStore();
  const i18n = t[language];

  const colors = [
    { name: 'Cyber Blue', base: '#00f3ff', secondary: '#7c3cff', accent: '#ffffff', bg: '#02030a' },
    { name: 'Amber Signal', base: '#d78a2d', secondary: '#ff1010', accent: '#ffffff', bg: '#000000' },
    { name: 'Acid Green', base: '#39ff14', secondary: '#194cff', accent: '#ffffff', bg: '#000504' },
    { name: 'Hot Magenta', base: '#ff2f8f', secondary: '#ffe94a', accent: '#5ffcff', bg: '#050008' },
    { name: 'Monochrome', base: '#ffffff', secondary: '#777777', accent: '#ffffff', bg: '#000000' },
  ];

  const applyPalette = (palette: typeof colors[number]) => {
    setColorGrading('baseColor', palette.base);
    setColorGrading('secondaryColor', palette.secondary);
    setColorGrading('accentColor', palette.accent);
    setColorGrading('bgColor', palette.bg);
  };

  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-white/80">
        <Palette size={16} className="text-pink-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.COLOR_MOOD || 'Color & Mood'}</span>
      </div>
      
      <div className="flex flex-col gap-1">
        <ColorPickerInput label={i18n.COLOR_PRIMARY || 'Primary'} value={baseColor} onChange={(v: string) => setColorGrading('baseColor', v)} />
        <ColorPickerInput label={i18n.COLOR_SECONDARY || 'Secondary'} value={secondaryColor} onChange={(v: string) => setColorGrading('secondaryColor', v)} />
        <ColorPickerInput label={i18n.COLOR_ACCENT || 'Accent'} value={accentColor} onChange={(v: string) => setColorGrading('accentColor', v)} />
        <ColorPickerInput label={i18n.COLOR_BACKGROUND || 'Background'} value={bgColor} onChange={(v: string) => setColorGrading('bgColor', v)} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {colors.map((palette) => (
          <button
            key={palette.name}
            type="button"
            title={palette.name}
            aria-label={palette.name}
            onClick={() => applyPalette(palette)}
            className="h-9 rounded-lg border border-white/10 overflow-hidden hover:scale-105 hover:border-white/40 transition-all focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <span className="grid h-full grid-cols-3">
              <span style={{ backgroundColor: palette.base }} />
              <span style={{ backgroundColor: palette.secondary }} />
              <span style={{ backgroundColor: palette.accent }} />
            </span>
          </button>
        ))}
      </div>

      <div className="h-px w-full bg-white/5 my-2" />

      <div className="pt-2">
        <Slider label={i18n.SATURATION || 'Saturation'} value={saturation} onChange={(v: number) => setColorGrading('saturation', v)} max={3} />
        <Slider label={i18n.CONTRAST || 'Contrast'} value={contrast} onChange={(v: number) => setColorGrading('contrast', v)} max={3} />
        <Slider label={i18n.BRIGHTNESS || 'Brightness'} value={brightness} onChange={(v: number) => setColorGrading('brightness', v)} max={3} />
        <Slider label={i18n.EXPOSURE || 'Exposure'} value={exposure} onChange={(v: number) => setColorGrading('exposure', v)} max={3} />
      </div>
    </div>
  );
}
