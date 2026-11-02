import React, { useState } from 'react';
import { X, Sliders, Smartphone, Monitor, Wifi, Check } from 'lucide-react';
import type { ViewportConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'bn' | 'en';
  onSetLang: (lang: 'bn' | 'en') => void;
  currentViewport: ViewportConfig;
  onSelectViewport: (vp: ViewportConfig) => void;
  quality: number;
  onSetQuality: (q: number) => void;
  wsEndpoint: string;
  onSaveWsEndpoint: (url: string) => void;
}

export const VIEWPORT_PRESETS: ViewportConfig[] = [
  { name: 'desktop-hd', width: 1280, height: 720, isMobile: false, label: 'Desktop 1280 × 720 (AppOnFly Default)' },
  { name: 'desktop-compact', width: 1024, height: 768, isMobile: false, label: 'Desktop 1024 × 768 (Compact)' },
  { name: 'mobile-portrait', width: 390, height: 844, isMobile: true, label: 'Mobile Phone Portrait (390 × 844)' },
  { name: 'mobile-landscape', width: 844, height: 390, isMobile: true, label: 'Mobile Phone Landscape (844 × 390)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  onSetLang,
  currentViewport,
  onSelectViewport,
  quality,
  onSetQuality,
  wsEndpoint,
  onSaveWsEndpoint,
}) => {
  const [customWs, setCustomWs] = useState(wsEndpoint);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSaveEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveWsEndpoint(customWs.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-100">
              {lang === 'bn' ? 'কনফিগারেশন ও সেটিংস' : 'Configuration & Fast Response Settings'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Language Switcher */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              {lang === 'bn' ? 'ভাষা নির্বাচন / Language' : 'Language'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSetLang('bn')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                  lang === 'bn'
                    ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                🇧🇩 বাংলা (Bengali)
              </button>
              <button
                type="button"
                onClick={() => onSetLang('en')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                  lang === 'en'
                    ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                🇺🇸 English
              </button>
            </div>
          </div>

          {/* Viewport Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              {lang === 'bn' ? 'ভিউ-পোর্ট ও রেজোলিউশন' : 'Screen Viewport Preset'}
            </label>
            <div className="space-y-1.5">
              {VIEWPORT_PRESETS.map((vp) => (
                <button
                  key={vp.name}
                  type="button"
                  onClick={() => onSelectViewport(vp)}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs flex items-center justify-between border transition-all text-left ${
                    currentViewport.name === vp.name
                      ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {vp.isMobile ? <Smartphone className="w-4 h-4 text-sky-400" /> : <Monitor className="w-4 h-4 text-sky-400" />}
                    <span>{vp.label}</span>
                  </div>
                  {currentViewport.name === vp.name && <Check className="w-4 h-4 text-sky-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* JPEG Quality & Latency Optimization */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {lang === 'bn' ? 'স্ক্রিন কোয়ালিটি ও লেটেন্সি কম্প্রেশন' : 'Screencast Quality (Fast Latency)'}
              </label>
              <span className="text-xs font-mono text-sky-400 font-bold">{quality}%</span>
            </div>
            <input
              type="range"
              min="40"
              max="90"
              step="5"
              value={quality}
              onChange={(e) => onSetQuality(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>{lang === 'bn' ? '⚡ দ্রুততম (Low Latency)' : '⚡ Ultra Fast (Low Latency)'}</span>
              <span>{lang === 'bn' ? 'HD ছবি (Higher Data)' : 'HD High Quality'}</span>
            </div>
          </div>

          {/* Custom Puppeteer WebSocket / CDP URL */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              {lang === 'bn' ? 'রিমোট CDP / Browserless WebSocket URL' : 'Remote Puppeteer WebSocket (CDP)'}
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              {lang === 'bn'
                ? 'ব্রাউজারলেস (browserless.io) বা ক্লাউড ক্রোমিয়াম যুক্ত করলে Vercel এ 0ms কোল্ডস্টার্ট পাওয়া যায়।'
                : 'Connect directly to Browserless.io or remote Chromium for 0ms cold-start on Vercel.'}
            </p>
            <form onSubmit={handleSaveEndpoint} className="flex gap-2">
              <input
                type="text"
                value={customWs}
                onChange={(e) => setCustomWs(e.target.value)}
                placeholder="wss://chrome.browserless.io?token=..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-xl transition-colors shrink-0 flex items-center gap-1"
              >
                {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                <span>{savedSuccess ? (lang === 'bn' ? 'সেভ হয়েছে' : 'Saved') : lang === 'bn' ? 'সেভ' : 'Apply'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
          >
            {lang === 'bn' ? 'ঠিক আছে' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
