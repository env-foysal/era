import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { ActionPayload, InputBoxRect, TouchRipple } from '../types';

interface FullScreenDesktopProps {
  currentFrame: string | null;
  targetWidth: number;
  targetHeight: number;
  inputRects: InputBoxRect[];
  isInputFocused: boolean;
  onSendAction: (payload: ActionPayload) => Promise<{ isInputFocused?: boolean; frame?: string } | void>;
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
  targetUrl = 'https://app.apponfly.com/trial',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const [ripples, setRipples] = useState<TouchRipple[]>([]);
  const [inputValue, setInputValue] = useState<string>(' ');

  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  const isPortrait = viewportSize.h > viewportSize.w;

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

  // Synchronize focus/blur for native mobile keyboard (only when input field is active)
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
        {/* Proportional 16:9 Desktop Surface (Prevents squishing or stretching) */}
        <div
          ref={canvasRef}
          onClick={handleScreenTap}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => {
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
          }}
          onWheel={handleWheel}
          style={{
            width: `${renderWidth}px`,
            height: `${renderHeight}px`,
          }}
          className="relative bg-black overflow-hidden select-none shadow-2xl"
        >
          {/* Direct Interactive AppOnFly Desktop View (Clean, 100% full-screen without intrusive popup windows) */}
          <div className="w-full h-full relative bg-slate-950">
            <iframe
              src={targetUrl}
              title="Remote Cloud Desktop"
              className="w-full h-full border-0 select-auto"
              allow="clipboard-read; clipboard-write; fullscreen; autoplay"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </div>

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
        </div>
      </div>
    </div>
  );
};
