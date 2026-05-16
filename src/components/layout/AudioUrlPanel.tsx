import { useState } from 'react';
import { Link2, Mic2, Radio, Square } from 'lucide-react';
import { audioEngine } from '@/lib/AudioEngine';
import { t } from '@/lib/i18n';
import { useStore } from '@/store/useStore';

export function AudioUrlPanel() {
  const {
    audioReady,
    audioSourceMode,
    audioUrl,
    language,
    setAudioReady,
    setAudioSourceMode,
    setAudioUrl,
  } = useStore();
  const i18n = t[language];
  const [localUrl, setLocalUrl] = useState(audioUrl);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sourceLabel = {
    microphone: i18n.AUDIO_SOURCE_MIC,
    url: i18n.AUDIO_SOURCE_URL,
    simulation: i18n.AUDIO_SOURCE_SIM,
  }[audioSourceMode];

  const handleConnectUrl = async () => {
    setLoading(true);
    setError('');
    setStatus(i18n.URL_LOADING);

    try {
      const mode = await audioEngine.useUrl(localUrl);
      setAudioUrl(localUrl);
      setAudioReady(true);
      setAudioSourceMode(mode);
      setStatus(i18n.URL_READY);
    } catch (err) {
      setAudioSourceMode('simulation');
      setStatus('');
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to play or analyze this audio URL. Check the link and CORS policy.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUseMic = async () => {
    setLoading(true);
    setError('');
    setStatus('');

    const mode = await audioEngine.useMicrophone();
    setAudioReady(true);
    setAudioSourceMode(mode);
    setLoading(false);
  };

  const handleStop = () => {
    audioEngine.stopUrl();
    setAudioSourceMode('simulation');
    setStatus('');
    setError('');
  };

  return (
    <div className="w-full p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between text-white/80">
        <div className="flex items-center gap-3">
          <Radio size={16} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest">{i18n.AUDIO_URL}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
          <div className={`w-1.5 h-1.5 rounded-full ${audioReady ? 'bg-green-400' : 'bg-white/20'}`} />
          {sourceLabel}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
          {i18n.AUDIO_SOURCE_URL}
        </label>
        <div className="relative">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="url"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnectUrl()}
            placeholder={i18n.AUDIO_URL_PLACEHOLDER}
            className="w-full bg-black/50 border border-white/10 rounded-lg pl-9 pr-3 py-3 text-[12px] font-mono text-white outline-none focus:border-cyan-400/60 focus:bg-white/5 transition-all placeholder:text-white/20"
          />
        </div>
        <p className="text-[10px] leading-relaxed text-white/35">{i18n.AUDIO_URL_HELP}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleConnectUrl}
          disabled={loading || !localUrl.trim()}
          className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-cyan-100 transition-all hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Link2 size={12} />
          {i18n.CONNECT_URL}
        </button>
        <button
          onClick={handleUseMic}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Mic2 size={12} />
          {i18n.USE_MIC}
        </button>
        <button
          onClick={handleStop}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-red-200 transition-all hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Square size={11} />
          {i18n.STOP_AUDIO}
        </button>
      </div>

      {(status || error) && (
        <div
          className={`rounded-lg border px-3 py-2 text-[10px] leading-relaxed ${
            error
              ? 'border-red-400/20 bg-red-400/10 text-red-200'
              : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
          }`}
        >
          {error || status}
        </div>
      )}
    </div>
  );
}
