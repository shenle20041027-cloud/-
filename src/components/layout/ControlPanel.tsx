import React, { useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Move } from 'lucide-react';
import { t } from '@/lib/i18n';

export function ControlPanel() {
  const { setPerformanceControl, language } = useStore();
  const i18n = t[language];
  const padRef = useRef<HTMLDivElement>(null);
  const [padPos, setPadPos] = useState({ x: 0.5, y: 0.5 }); // Initialize to center
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updatePad(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) updatePad(e);
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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
    setPerformanceControl('speed', 0.2 + x * 2.8);
    setPerformanceControl('chaos', y * 2.0);
  };

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
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
    </div>
  );
}
