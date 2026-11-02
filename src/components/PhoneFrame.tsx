import React, { useRef, useState, useEffect } from 'react';
import {
  MousePointer,
  Hand,
  RotateCcw,
  ExternalLink,
  Zap,
  Activity,
  Maximize2,
  Minimize2,
  Sparkles,
  Layers,
  ChevronDown,
} from 'lucide-react';
import type { TouchMode, TouchRipple } from '../types';

interface PhoneFrameProps {
  currentFrame: string | null;
  latencyMs: number;
  url: string;
  targetWidth: number;
  targetHeight: number;
  touchMode: TouchMode;
  onSetTouchMode: (mode: TouchMode) => void;
  onClickCoordinate: (x: number, y: number, button?: 'left' | 'right' | 'middle') => void;
  onDoubleClickCoordinate: (x: number, y: number) => void;
  onScrollDelta: (deltaY: number) => void;
  onReload: () => void;
  lang: 'bn' | 'en';
  isConnecting: boolean;
  viewMode: 'stream' | 'direct-embed';
  onToggleViewMode: (mode: 'stream' | 'direct-embed') => void;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  currentFrame,
  latencyMs,
  url,
  targetWidth,
  targetHeight,
  touchMode,
  onSetTouchMode,
  onClickCoordinate,
  onDoubleClickCoordinate,
  onScrollDelta,
  onReload,
  lang,
  isConnecting,
  viewMode,
  onToggleViewMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<TouchRipple[]>([]);
  const [trackpadPos, setTrackpadPos] = useState({ x: targetWidth / 2, y: targetHeight / 2 });
  const [isLandscape, setIsLandscape] = useState(false);
  const [scale, setScale] = useState(1);
  const [touchPosDisplay, setTouchPosDisplay] = useState<{ x: number; y: number } | null>(null);

  // Add click ripple
  const triggerRipple = (screenX: number, screenY: number) => {
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev.slice(-4), { id, x: screenX, y: screenY }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  };

  // Convert client viewport coords to remote browser (targetWidth x targetHeight)
  const getBrowserCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    const scaleX = targetWidth / rect.width;
    const scaleY = targetHeight / rect.height;

    const browserX = Math.max(0, Math.min(targetWidth, Math.round(relativeX * scaleX)));
    const browserY = Math.max(0, Math.min(targetHeight, Math.round(relativeY * scaleY)));

    return {
      browserX,
      browserY,
      screenX: relativeX,
      screenY: relativeY,
    };
  };

  // Handle pointer down / tap
  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode === 'direct-embed') return;

    const coords = getBrowserCoords(e);
    if (!coords) return;

    triggerRipple(coords.screenX, coords.screenY);
    setTouchPosDisplay({ x: coords.browserX, y: coords.browserY });

    if (touchMode === 'touch') {
      onClickCoordinate(coords.browserX, coords.browserY, e.button === 2 ? 'right' : 'left');
    } else {
      setTrackpadPos({ x: coords.browserX, y: coords.browserY });
    }
  };

  // Handle double click
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode === 'direct-embed') return;
    const coords = getBrowserCoords(e);
    if (!coords) return;
    onDoubleClickCoordinate(coords.browserX, coords.browserY);
  };

  // Handle wheel / touch scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (viewMode === 'direct-embed') return;
    e.preventDefault();
    onScrollDelta(e.deltaY);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full px-2 py-1 max-w-5xl mx-auto">
      {/* Top Remote Control Toolbar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 mb-3 backdrop-blur-md shadow-lg">
        {/* Left: Mode & Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/60 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnecting
                  ? 'bg-amber-400 animate-ping'
                  : latencyMs < 100
                  ? 'bg-emerald-400'
                  : 'bg-sky-400'
              }`}
            />
            <span className="font-mono text-slate-300 font-medium">
              {isConnecting
                ? lang === 'bn'
                  ? 'সংযুক্ত হচ্ছে...'
                  : 'Connecting...'
                : `${latencyMs}ms`}
            </span>
          </div>

          {/* View Mode Toggle: Stream vs Direct Embed */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onToggleViewMode('stream')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                viewMode === 'stream'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'Puppeteer স্ট্রিম' : 'Puppeteer Stream'}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('direct-embed')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                viewMode === 'direct-embed'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'সরাসরি ব্রাউজার' : 'Direct Embed'}</span>
            </button>
          </div>
        </div>

        {/* Center: Coordinates display */}
        {touchPosDisplay && (
          <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/50">
            <span>X: {touchPosDisplay.x}</span>
            <span className="text-slate-600">|</span>
            <span>Y: {touchPosDisplay.y}</span>
          </div>
        )}

        {/* Right: Touch mode & Orientation */}
        <div className="flex items-center gap-2">
          {viewMode === 'stream' && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => onSetTouchMode('touch')}
                className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                  touchMode === 'touch'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={lang === 'bn' ? 'ডাইরেক্ট টাচ মোড' : 'Direct Touch Mode'}
              >
                <Hand className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === 'bn' ? 'টাচ' : 'Touch'}</span>
              </button>
              <button
                type="button"
                onClick={() => onSetTouchMode('trackpad')}
                className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                  touchMode === 'trackpad'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={lang === 'bn' ? 'ট্র্যাকপ্যাড মাউস মোড' : 'Virtual Trackpad Mode'}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === 'bn' ? 'কার্সার' : 'Trackpad'}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onReload}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title={lang === 'bn' ? 'পেজ রিলোড করুন' : 'Reload Remote Page'}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <a
            href="https://app.apponfly.com/trial"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center"
            title={lang === 'bn' ? 'আসল সাইট নতুন ট্যাবে খুলুন' : 'Open Official Trial Site'}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Realistic Mobile / Tablet Frame Container */}
      <div
        className={`relative w-full rounded-[2.5rem] p-3 sm:p-4 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-2xl border-4 border-slate-700/80 transition-all duration-300 ${
          isLandscape ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        {/* Dynamic Island / Notch Mockup */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-black rounded-full z-30 flex items-center justify-center gap-2 border border-slate-800/80 shadow-md">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
        </div>

        {/* Viewport Screen Frame */}
        <div
          ref={containerRef}
          onMouseDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            const coords = getBrowserCoords(e);
            if (coords) onClickCoordinate(coords.browserX, coords.browserY, 'right');
          }}
          onWheel={handleWheel}
          className="relative w-full aspect-[16/9] sm:aspect-[16/10] bg-black rounded-[1.75rem] overflow-hidden select-none cursor-crosshair shadow-inner border border-slate-800/90"
        >
          {viewMode === 'stream' ? (
            <>
              {/* Puppeteer Screencast Image Stream */}
              {currentFrame ? (
                <img
                  src={currentFrame}
                  alt="AppOnFly Cloud Browser Stream"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-950 p-6 text-center">
                  <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium text-slate-300">
                    {lang === 'bn'
                      ? 'Puppeteer Core সেশন চালু হচ্ছে...'
                      : 'Connecting to Puppeteer Core session...'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Target: https://app.apponfly.com/trial
                  </p>
                </div>
              )}

              {/* Touch Ripples */}
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute pointer-events-none rounded-full bg-sky-400/30 border-2 border-sky-400 -translate-x-1/2 -translate-y-1/2 animate-ping"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: '36px',
                    height: '36px',
                  }}
                />
              ))}

              {/* Trackpad Mode Virtual Cursor */}
              {touchMode === 'trackpad' && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-75"
                  style={{
                    left: `${(trackpadPos.x / targetWidth) * 100}%`,
                    top: `${(trackpadPos.y / targetHeight) * 100}%`,
                  }}
                >
                  <MousePointer className="w-5 h-5 text-sky-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] fill-sky-400/30" />
                </div>
              )}
            </>
          ) : (
            /* Direct Interactive Trial Viewport */
            <iframe
              src="https://app.apponfly.com/trial"
              title="AppOnFly Live Trial Embed"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
        </div>

        {/* Trackpad Buttons if in Trackpad mode */}
        {touchMode === 'trackpad' && viewMode === 'stream' && (
          <div className="mt-3 grid grid-cols-3 gap-2 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onClickCoordinate(trackpadPos.x, trackpadPos.y, 'left')}
              className="py-2.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 active:scale-95 text-white rounded-lg transition-transform flex items-center justify-center gap-1"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'বাম ক্লিক' : 'Left Click'}</span>
            </button>
            <button
              type="button"
              onClick={() => onDoubleClickCoordinate(trackpadPos.x, trackpadPos.y)}
              className="py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg transition-transform"
            >
              {lang === 'bn' ? 'ডাবল ক্লিক' : 'Double Click'}
            </button>
            <button
              type="button"
              onClick={() => onClickCoordinate(trackpadPos.x, trackpadPos.y, 'right')}
              className="py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg transition-transform"
            >
              {lang === 'bn' ? 'ডান ক্লিক' : 'Right Click'}
            </button>
          </div>
        )}

        {/* Bottom Home Indicator Bar */}
        <div className="w-32 h-1 bg-slate-600/80 rounded-full mx-auto mt-3" />
      </div>

      {/* Helpful Mobile Tip */}
      <p className="text-xs text-slate-400 mt-2 text-center">
        {lang === 'bn'
          ? '💡 টিপস: স্ক্রিনের যে কোনো স্থানে স্পর্শ করুন ক্লিক করার জন্য। নিচে ভার্চুয়াল কীবোর্ড দিয়ে টাইপ করুন।'
          : '💡 Tip: Tap anywhere on the remote screen to click. Use the keyboard drawer below to send text or keys.'}
      </p>
    </div>
  );
};
