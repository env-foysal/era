import React, { useRef, useState, useEffect } from 'react';
import type { ActionPayload, InputBoxRect, TouchRipple } from '../types';

interface FullScreenDesktopProps {
  currentFrame: string | null;
  targetWidth: number;
  targetHeight: number;
  inputRects: InputBoxRect[];
  isInputFocused: boolean;
  onSendAction: (payload: ActionPayload) => Promise<{ isInputFocused?: boolean } | void>;
}

function isHitInsideInputRects(x: number, y: number, rects: InputBoxRect[]): boolean {
  if (!Array.isArray(rects) || rects.length === 0) return false;
  // Allow a small 6px touch tolerance around input fields
  const pad = 6;
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

  // Attempt native screen landscape lock if supported by browser/WebView, plus CSS rotation fallback
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

  // Sync focus/blur when backend reports input focus state change
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
    }, 450);
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
      // Element is rotated 90deg clockwise:
      // Screen vertical (top -> bottom) maps to Desktop horizontal (left -> right)
      // Screen horizontal (right -> left) maps to Desktop vertical (top -> bottom)
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

    // Check synchronously if user tapped an input box
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

  // Compute exact 16:9 proportional dimensions inside the landscape stage so it never stretches or squishes
  const stageWidth = isPortrait ? viewportSize.h : viewportSize.w;
  const stageHeight = isPortrait ? viewportSize.w : viewportSize.h;
  const targetAspect = targetWidth / targetHeight;
  const stageAspect = stageWidth / Math.max(1, stageHeight);

  let renderWidth = stageWidth;
  let renderHeight = stageHeight;

  if (stageAspect > targetAspect) {
    renderHeight = stageHeight;
    renderWidth = Math.round(stageHeight * targetAspect);
  } else {
    renderWidth = stageWidth;
    renderHeight = Math.round(stageWidth / targetAspect);
  }

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

      {/* Landscape Stage (Auto-rotates 90deg when phone is in portrait mode) */}
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
        className="flex items-center justify-center bg-black overflow-hidden"
      >
        {/* Proportional 16:9 Desktop Surface (Prevents squishing/stretching) */}
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
          className="relative bg-black overflow-hidden select-none"
        >
          {currentFrame ? (
            <img
              src={currentFrame}
              alt="Remote Desktop"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-slate-300 gap-3">
              <div className="w-9 h-9 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs tracking-wide text-slate-400">
                Starting Windows Desktop...
              </span>
            </div>
          )}

          {/* Touch Ripple Feedback */}
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute pointer-events-none rounded-full bg-sky-400/25 border border-sky-400/70 -translate-x-1/2 -translate-y-1/2 animate-ping"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: '30px',
                height: '30px',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
