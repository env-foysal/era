import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Globe, RefreshCw, Smartphone, Monitor, Keyboard, ShieldCheck, ArrowLeft } from 'lucide-react';
import type { ActionPayload, InputBoxRect, TouchRipple, IpInfo } from '../types';

interface FullScreenDesktopProps {
  currentFrame: string | null;
  targetWidth: number;
  targetHeight: number;
  inputRects: InputBoxRect[];
  isInputFocused: boolean;
  onSendAction: (payload: ActionPayload) => Promise<{ isInputFocused?: boolean; frame?: string } | void>;
  ipInfo?: IpInfo | null;
  onManualRotateIp?: () => Promise<void>;
  targetUrl?: string;
  onBackToLaunch?: () => void;
}

function isHitInsideInputRects(x: number, y: number, rects: InputBoxRect[]): boolean {
  if (!Array.isArray(rects) || rects.length === 0) return false;
  const pad = 8;
  return rects.some(
    (r) =>
      x >= r.x - pad &&
      x <= r.x + r.width + pad &&
      y >= r.y - pad &&
      y <= r.y + r.height + pad
  );
}

export const FullScreenDesktop: React.FC<FullScreenDesktopProps> = ({
  currentFrame,
  targetWidth,
  targetHeight,
  inputRects,
  isInputFocused,
  onSendAction,
  ipInfo,
  onManualRotateIp,
  targetUrl = 'https://app.apponfly.com/trial',
  onBackToLaunch,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const [ripples, setRipples] = useState<TouchRipple[]>([]);
  const [inputValue, setInputValue] = useState<string>(' ');
  const [isRotatingIp, setIsRotatingIp] = useState<boolean>(false);
  const [showStatusBar, setShowStatusBar] = useState<boolean>(true);
  const [engineMode, setEngineMode] = useState<'interactive' | 'stream'>('interactive');
  const [timeUntilNextRotation, setTimeUntilNextRotation] = useState<string>('20:30');

  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  const isPortrait = viewportSize.h > viewportSize.w;

  // Auto-hide status bar after 8 seconds of inactivity to maximize screen real-estate
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowStatusBar(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [showStatusBar]);

  // Orientation lock attempt & window resize listener
  useEffect(() => {
    try {
      const orientation = (screen as any)?.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // ignore if unsupported
    }

    const handleResize = () => {
      setViewportSize({
        w: window.innerWidth,
        h: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Update countdown to next 20.5 minute IP rotation
  useEffect(() => {
    const updateCountdown = () => {
      if (!ipInfo?.nextRotationAt) {
        setTimeUntilNextRotation('20:30');
        return;
      }
      const diffMs = Math.max(0, ipInfo.nextRotationAt - Date.now());
      const totalSec = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      setTimeUntilNextRotation(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ipInfo?.nextRotationAt]);

  // Synchronize focus/blur for native mobile keyboard
  useEffect(() => {
    if (!nativeInputRef.current) return;
    if (isInputFocused) {
      nativeInputRef.current.focus({ preventScroll: true });
    } else {
      nativeInputRef.current.blur();
    }
  }, [isInputFocused]);

  const triggerRipple = (localX: number, localY: number) => {
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev.slice(-3), { id, x: localX, y: localY }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 400);
  };

  const getBrowserCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    let normX = 0;
    let normY = 0;
    let localX = 0;
    let localY = 0;

    if (isPortrait) {
      // Clockwise 90deg rotation coordinate mapping:
      normX = (clientY - rect.top) / rect.height;
      normY = (rect.right - clientX) / rect.width;
      localX = normX * rect.height;
      localY = normY * rect.width;
    } else {
      normX = (clientX - rect.left) / rect.width;
      normY = (clientY - rect.top) / rect.height;
      localX = normX * rect.width;
      localY = normY * rect.height;
    }

    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    const browserX = Math.round(clampedX * targetWidth);
    const browserY = Math.round(clampedY * targetHeight);

    return {
      browserX,
      browserY,
      localX,
      localY,
    };
  };

  const handleScreenTap = async (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getBrowserCoords(e.clientX, e.clientY);
    if (!coords) return;

    triggerRipple(coords.localX, coords.localY);

    // Only open native keyboard when clicking an input box
    const tappedInput = isHitInsideInputRects(coords.browserX, coords.browserY, inputRects);
    if (nativeInputRef.current) {
      if (tappedInput) {
        nativeInputRef.current.focus({ preventScroll: true });
      } else {
        nativeInputRef.current.blur();
      }
    }

    const result = await onSendAction({
      type: 'click',
      x: coords.browserX,
      y: coords.browserY,
      button: e.button === 2 ? 'right' : 'left',
    });

    if (result && typeof result.isInputFocused === 'boolean' && nativeInputRef.current) {
      if (result.isInputFocused) {
        nativeInputRef.current.focus({ preventScroll: true });
      } else {
        nativeInputRef.current.blur();
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getBrowserCoords(e.clientX, e.clientY);
    if (!coords) return;
    onSendAction({
      type: 'dblclick',
      x: coords.browserX,
      y: coords.browserY,
    });
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length === 0) {
      onSendAction({ type: 'type', key: 'Backspace' });
      setInputValue(' ');
      return;
    }
    if (val.length > 1) {
      const typedText = val.startsWith(' ') ? val.slice(1) : val;
      if (typedText) {
        onSendAction({ type: 'type', text: typedText });
      }
      setInputValue(' ');
    }
  };

  const handleNativeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSendAction({ type: 'type', key: 'Enter' });
      setInputValue(' ');
    } else if (e.key === 'Backspace') {
      if (inputValue.length <= 1) {
        e.preventDefault();
        onSendAction({ type: 'type', key: 'Backspace' });
        setInputValue(' ');
      }
    } else if (
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      e.preventDefault();
      onSendAction({ type: 'type', key: e.key });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    onSendAction({ type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
  };

  const handleManualRotateClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRotatingIp || !onManualRotateIp) return;
    setIsRotatingIp(true);
    try {
      await onManualRotateIp();
    } finally {
      setTimeout(() => setIsRotatingIp(false), 800);
    }
  };

  const toggleKeyboardManual = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nativeInputRef.current) return;
    if (document.activeElement === nativeInputRef.current) {
      nativeInputRef.current.blur();
    } else {
      nativeInputRef.current.focus({ preventScroll: true });
    }
  };

  // Compute exact 16:9 proportional dimensions inside the landscape stage
  const { renderWidth, renderHeight } = useMemo(() => {
    const stageWidth = isPortrait ? viewportSize.h : viewportSize.w;
    const stageHeight = isPortrait ? viewportSize.w : viewportSize.h;
    const targetAspect = targetWidth / targetHeight; // 1280 / 720 = 1.7777...
    const stageAspect = stageWidth / Math.max(1, stageHeight);

    let rw = stageWidth;
    let rh = stageHeight;

    if (stageAspect > targetAspect) {
      rh = stageHeight;
      rw = Math.round(stageHeight * targetAspect);
    } else {
      rw = stageWidth;
      rh = Math.round(stageWidth / targetAspect);
    }

    return { renderWidth: rw, renderHeight: rh };
  }, [isPortrait, viewportSize, targetWidth, targetHeight]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none touch-manipulation">
      {/* Hidden Native Input — only focused when clicking an input box */}
      <input
        ref={nativeInputRef}
        type="text"
        value={inputValue}
        onChange={handleNativeInputChange}
        onKeyDown={handleNativeKeyDown}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Remote Desktop Input"
        className="fixed opacity-0 w-1 h-1 pointer-events-none -z-10 left-1/2 top-1/2"
      />

      {/* Landscape Stage: Auto-rotates 90deg when mobile phone is held in portrait mode */}
      <div
        style={
          isPortrait
            ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: `${viewportSize.h}px`,
                height: `${viewportSize.w}px`,
                transform: 'translate(-50%, -50%) rotate(90deg)',
                transformOrigin: 'center center',
              }
            : {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
              }
        }
        className="flex items-center justify-center bg-black overflow-hidden relative"
      >
        {/* Sleek Floating Stealth Bar (Toggleable / Auto-hiding) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-2 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-in-out ${
            showStatusBar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md text-[11px] text-slate-200">
            {onBackToLaunch && (
              <button
                type="button"
                onClick={onBackToLaunch}
                title="Back to Launch Screen"
                className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Residential Stealth IP Info */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-950/70 border border-sky-800/60 font-mono text-sky-300">
              <ShieldCheck className="w-3 h-3 text-sky-400" />
              <span className="font-semibold">{ipInfo?.ip || '73.189.24.112'}</span>
              <span className="text-[10px] text-slate-400">({ipInfo?.isp ? ipInfo.isp.split(' ')[0] : 'Residential'})</span>
            </div>

            {/* 20.5m IP Rotation Timer & Manual Rotation Button */}
            <div className="flex items-center gap-1 text-slate-300">
              <span className="text-slate-400">Next IP:</span>
              <span className="font-mono text-emerald-400 font-medium">{timeUntilNextRotation}</span>
              <button
                type="button"
                disabled={isRotatingIp}
                onClick={handleManualRotateClick}
                title="Rotate IP Now"
                className="p-1 hover:bg-slate-800 rounded-full text-slate-300 hover:text-sky-400 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRotatingIp ? 'animate-spin text-sky-400' : ''}`} />
              </button>
            </div>

            <div className="h-3 w-px bg-slate-700 mx-0.5" />

            {/* Dual Engine Switcher: Direct Interactive HD vs Cloud Stream */}
            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-full border border-slate-800">
              <button
                type="button"
                onClick={() => setEngineMode('interactive')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  engineMode === 'interactive'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-2.5 h-2.5" />
                <span>Live HD</span>
              </button>
              <button
                type="button"
                onClick={() => setEngineMode('stream')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  engineMode === 'stream'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Globe className="w-2.5 h-2.5" />
                <span>Cloud Stream</span>
              </button>
            </div>

            {/* Manual Keyboard Button */}
            <button
              type="button"
              onClick={toggleKeyboardManual}
              title="Toggle Phone Keyboard"
              className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Small floating trigger to reveal status bar when hidden */}
        {!showStatusBar && (
          <button
            type="button"
            onClick={() => setShowStatusBar(true)}
            className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white backdrop-blur-xs transition-opacity cursor-pointer opacity-70 hover:opacity-100"
            title="Show Controls"
          >
            <Smartphone className="w-3 h-3" />
          </button>
        )}

        {/* Proportional 16:9 Desktop Surface (Prevents squishing or stretching) */}
        <div
          ref={canvasRef}
          onClick={engineMode === 'stream' ? handleScreenTap : undefined}
          onDoubleClick={engineMode === 'stream' ? handleDoubleClick : undefined}
          onContextMenu={(e) => {
            if (engineMode === 'stream') {
              e.preventDefault();
              const coords = getBrowserCoords(e.clientX, e.clientY);
              if (coords) {
                onSendAction({
                  type: 'click',
                  x: coords.browserX,
                  y: coords.browserY,
                  button: 'right',
                });
              }
            }
          }}
          onWheel={engineMode === 'stream' ? handleWheel : undefined}
          style={{
            width: `${renderWidth}px`,
            height: `${renderHeight}px`,
          }}
          className="relative bg-black overflow-hidden select-none shadow-2xl"
        >
          {engineMode === 'interactive' ? (
            /* Direct Interactive AppOnFly Web Desktop: 100% functional on Vercel */
            <div className="w-full h-full relative bg-slate-950">
              <iframe
                src={targetUrl}
                title="AppOnFly Cloud Desktop"
                className="w-full h-full border-0 select-auto"
                allow="clipboard-read; clipboard-write; fullscreen; autoplay"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />
            </div>
          ) : (
            /* Cloud Puppeteer Stream with Remote Actions */
            <>
              {currentFrame ? (
                <img
                  src={currentFrame}
                  alt="Remote Desktop"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black text-slate-300 gap-3">
                  <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs tracking-wide text-slate-400">
                    Connecting to Cloud Stream...
                  </span>
                  <button
                    type="button"
                    onClick={() => setEngineMode('interactive')}
                    className="mt-2 px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    Switch to Live HD Web View
                  </button>
                </div>
              )}

              {/* Touch Ripple Visual Feedback */}
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute pointer-events-none rounded-full bg-sky-400/30 border border-sky-400/80 -translate-x-1/2 -translate-y-1/2 animate-ping"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: '32px',
                    height: '32px',
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
