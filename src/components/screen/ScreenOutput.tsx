import { MonitorOff, Wifi, WifiOff } from 'lucide-react';
import { useScreenSync } from '@/lib/screenSync';
import { screenText } from '@/lib/screenText';
import { useStore } from '@/store/useStore';
import { Visualizer } from '@/components/visualizer/Visualizer';

export function ScreenOutput({ screenId }: { screenId: string }) {
  const { connected } = useScreenSync('screen', screenId);
  const { language, visualScreens } = useStore();
  const labels = screenText[language];
  const screen = visualScreens.find((item) => item.id === screenId);

  if (!screen) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <MonitorOff size={32} className="text-white/40" />
          <div>
            <div className="text-sm font-bold uppercase tracking-widest">{labels.unknownScreen}</div>
            <div className="mt-2 text-xs text-white/40">{screenId}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen min-h-screen w-screen overflow-hidden bg-black text-white">
      <Visualizer screenIdOverride={screenId} />
      <div className="pointer-events-none absolute right-4 top-4 z-40 rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          {connected ? <Wifi size={13} className="text-cyan-300" /> : <WifiOff size={13} className="text-red-300" />}
          <span className={connected ? 'text-cyan-200' : 'text-red-200'}>{connected ? labels.synced : labels.waiting}</span>
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-white/45">{screen.name}</div>
      </div>
    </div>
  );
}
