import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Play, Send, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { db } from './firebase';
import { FullScreenDesktop } from './components/FullScreenDesktop';
import { AdminPanel, DEFAULT_APP_SETTINGS } from './components/AdminPanel';
import {
  canShowAdToday,
  incrementDailyAdCountOncePerSession,
  getNextDirectLink,
  injectMonetagAdCode,
  openExternalDirectLink,
  isRunningInsideTelegram,
} from './utils/adManager';
import type { ActionPayload, AppSettings, InputBoxRect, IpInfo } from './types';

// 20.5 minutes in milliseconds (1,230,000 ms)
const IP_ROTATION_INTERVAL_MS = 20.5 * 60 * 1000;

function formatChannelUrl(channel: string): string {
  const clean = channel.trim();
  if (!clean) return 'https://t.me';
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  if (clean.startsWith('t.me/')) return `https://${clean}`;
  const slug = clean.startsWith('@') ? clean.slice(1) : clean;
  return `https://t.me/${slug}`;
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    return (
      window.location.pathname.startsWith('/admin-cp') ||
      window.location.hash.startsWith('#/admin-cp')
    );
  });

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  // Launch & Channel Verification States
  const [isLaunched, setIsLaunched] = useState<boolean>(false);
  const [checkingJoin, setCheckingJoin] = useState<boolean>(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [manualTgUserId, setManualTgUserId] = useState<string>(() => {
    return localStorage.getItem('tg_fallback_user_id') || '';
  });

  // One-time Direct Link state for the current session
  const [pendingDirectLink, setPendingDirectLink] = useState<string | null>(null);
  const adCycleInitializedRef = useRef<boolean>(false);

  // Remote Desktop Stream & Input Detection State
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [inputRects, setInputRects] = useState<InputBoxRect[]>([]);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isFetchingSnapshotRef = useRef<boolean>(false);

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminRoute(
        window.location.pathname.startsWith('/admin-cp') ||
          window.location.hash.startsWith('#/admin-cp')
      );
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Initialize Telegram Mini App & load settings from Firestore
  useEffect(() => {
    if (isAdminRoute) return;

    try {
      window.Telegram?.WebApp?.ready();
      window.Telegram?.WebApp?.expand();
    } catch {
      // ignore if outside Telegram
    }

    let mounted = true;
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app_settings'));
        if (mounted && snap.exists()) {
          const data = snap.data() as AppSettings;
          setSettings({
            ...DEFAULT_APP_SETTINGS,
            ...data,
          });
        }
      } catch {
        // Use defaults if config doc not created yet
      } finally {
        if (mounted) {
          setSettingsLoaded(true);
        }
      }
    };

    fetchConfig();
    return () => {
      mounted = false;
    };
  }, [isAdminRoute]);

  // Trigger 1-second Monetag Ad & set up One-Time Direct Link (max 5 times/day)
  useEffect(() => {
    if (isAdminRoute || !settingsLoaded || adCycleInitializedRef.current) return;
    adCycleInitializedRef.current = true;

    const dailyLimit = settings.dailyAdLimit || 5;
    const hasConfiguredAds =
      Boolean(settings.monetagCode?.trim()) ||
      (Array.isArray(settings.directLinks) && settings.directLinks.length > 0);

    if (!hasConfiguredAds) return;

    if (canShowAdToday(dailyLimit)) {
      incrementDailyAdCountOncePerSession();

      const nextLink = getNextDirectLink(settings.directLinks || []);
      if (nextLink) {
        setPendingDirectLink(nextLink);
      }

      if (settings.monetagCode?.trim()) {
        const timer = setTimeout(() => {
          injectMonetagAdCode(settings.monetagCode);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAdminRoute, settingsLoaded, settings]);

  const fetchSnapshot = useCallback(async () => {
    if (isFetchingSnapshotRef.current) return;
    isFetchingSnapshotRef.current = true;
    try {
      const res = await fetch('/api/browser/snapshot');
      if (res.ok) {
        const data = await res.json();
        if (data.frame) {
          setCurrentFrame(data.frame);
        }
        if (Array.isArray(data.inputRects)) {
          setInputRects(data.inputRects);
        }
        if (typeof data.isInputFocused === 'boolean') {
          setIsInputFocused(data.isInputFocused);
        }
        if (data.ip) {
          setIpInfo((prev) => ({
            ip: data.ip,
            isp: data.isp || prev?.isp || 'Comcast Cable Communications',
            country: data.country || prev?.country || 'US',
            timezone: data.timezone || prev?.timezone || 'America/New_York',
            lastRotatedAt: prev?.lastRotatedAt || Date.now(),
            nextRotationAt: prev?.nextRotationAt || Date.now() + IP_ROTATION_INTERVAL_MS,
            rotationIntervalMinutes: 20.5,
          }));
        }
      }
    } catch {
      // ignore transient network hiccups
    } finally {
      isFetchingSnapshotRef.current = false;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/browser/status');
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          setIpInfo({
            ip: data.ip,
            isp: data.isp || 'Comcast Cable Communications',
            country: data.country || 'US',
            timezone: data.timezone || 'America/New_York',
            lastRotatedAt: data.lastRotatedAt || Date.now(),
            nextRotationAt: data.nextRotationAt || Date.now() + IP_ROTATION_INTERVAL_MS,
            rotationIntervalMinutes: data.rotationIntervalMinutes || 20.5,
          });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Connect to Puppeteer SSE Stream / Adaptive Polling & 20.5-Minute IP Rotation Timer once Launched
  useEffect(() => {
    if (!isLaunched || isAdminRoute) return;

    let active = true;

    // Immediately fetch initial snapshot & status (0ms delay)
    fetchSnapshot();
    fetchStatus();

    // Setup polling interval for resilient Vercel serverless operation
    const pollTimer = setInterval(() => {
      if (active) {
        fetchSnapshot();
      }
    }, 1200);

    // Also attempt SSE for real-time local dev server
    try {
      const sse = new EventSource('/api/browser/stream');
      eventSourceRef.current = sse;

      sse.onmessage = (e) => {
        if (!active) return;
        try {
          const data = JSON.parse(e.data);
          if (data.frame) setCurrentFrame(data.frame);
          if (Array.isArray(data.inputRects)) setInputRects(data.inputRects);
          if (typeof data.isInputFocused === 'boolean') setIsInputFocused(data.isInputFocused);
          if (data.ip) {
            setIpInfo((prev) => ({
              ip: data.ip,
              isp: data.isp || prev?.isp || 'Comcast Cable',
              country: data.country || prev?.country || 'US',
              timezone: prev?.timezone || 'America/New_York',
              lastRotatedAt: prev?.lastRotatedAt || Date.now(),
              nextRotationAt: data.nextIpRotationAt || prev?.nextRotationAt || Date.now() + IP_ROTATION_INTERVAL_MS,
              rotationIntervalMinutes: 20.5,
            }));
          }
        } catch {
          // ignore
        }
      };

      sse.onerror = () => {
        // Serverless Vercel disconnects SSE; polling handles it seamlessly
      };
    } catch {
      // ignore if SSE is not supported
    }

    // Automatic IP rotation request every 20.5 minutes (1,230,000 ms)
    const ipRotateTimer = setInterval(() => {
      fetch('/api/browser/rotate-ip', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.ip) {
            setIpInfo({
              ip: data.ip,
              isp: data.isp,
              country: data.country,
              timezone: data.timezone,
              lastRotatedAt: data.lastRotatedAt,
              nextRotationAt: data.nextRotationAt,
              rotationIntervalMinutes: 20.5,
            });
          }
        })
        .catch(() => {});
    }, IP_ROTATION_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(pollTimer);
      clearInterval(ipRotateTimer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isLaunched, isAdminRoute, fetchSnapshot, fetchStatus]);

  // Manual IP rotation trigger
  const handleManualRotateIp = async () => {
    try {
      const res = await fetch('/api/browser/rotate-ip', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          setIpInfo({
            ip: data.ip,
            isp: data.isp,
            country: data.country,
            timezone: data.timezone,
            lastRotatedAt: data.lastRotatedAt,
            nextRotationAt: data.nextRotationAt,
            rotationIntervalMinutes: 20.5,
          });
        }
      }
      await fetchSnapshot();
    } catch {
      // ignore
    }
  };

  // Intercept the very first click anywhere to open the Direct Link once
  const handleGlobalFirstClickCapture = () => {
    if (pendingDirectLink) {
      const linkToOpen = pendingDirectLink;
      setPendingDirectLink(null);
      openExternalDirectLink(linkToOpen);
    }
  };

  // Send mouse/keyboard actions to backend and return updated input focus + frame
  const sendBrowserAction = async (
    payload: ActionPayload
  ): Promise<{ isInputFocused?: boolean; frame?: string } | void> => {
    try {
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.frame) {
        setCurrentFrame(data.frame);
      }
      if (Array.isArray(data.inputRects)) {
        setInputRects(data.inputRects);
      }
      if (typeof data.isInputFocused === 'boolean') {
        setIsInputFocused(data.isInputFocused);
      }
      if (data.ip) {
        setIpInfo((prev) => ({
          ip: data.ip,
          isp: data.isp || prev?.isp || 'Comcast Cable',
          country: data.country || prev?.country || 'US',
          timezone: prev?.timezone || 'America/New_York',
          lastRotatedAt: prev?.lastRotatedAt || Date.now(),
          nextRotationAt: prev?.nextRotationAt || Date.now() + IP_ROTATION_INTERVAL_MS,
          rotationIntervalMinutes: 20.5,
        }));
      }
      return { isInputFocused: data.isInputFocused, frame: data.frame };
    } catch {
      // ignore transient network errors
    }
  };

  // Verify Telegram Channel Membership & Launch Windows
  const handleLaunchClick = async () => {
    setJoinError(null);

    const channel = (settings.telegramChannel || '').trim();
    const botToken = (settings.botToken || '').trim();

    if (!settings.requireChannelJoin || !channel) {
      setIsLaunched(true);
      return;
    }

    const tgUserId =
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      (manualTgUserId.trim() ? manualTgUserId.trim() : '');

    if (botToken) {
      if (!tgUserId) {
        setShowJoinPrompt(true);
        setJoinError(
          'Please join the channel and enter your Telegram User ID, or open directly inside the Telegram Mini App.'
        );
        return;
      }

      setCheckingJoin(true);
      try {
        const res = await fetch('/api/telegram/check-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken,
            channelUsername: channel,
            userId: tgUserId,
          }),
        });
        const data = await res.json();

        if (data.joined) {
          if (manualTgUserId.trim()) {
            localStorage.setItem('tg_fallback_user_id', manualTgUserId.trim());
          }
          setShowJoinPrompt(false);
          setIsLaunched(true);
        } else {
          setShowJoinPrompt(true);
          setJoinError(
            `You have not joined ${channel} yet. Please join the channel first and try again.`
          );
        }
      } catch {
        setShowJoinPrompt(true);
        setJoinError('Unable to verify channel membership. Please try again.');
      } finally {
        setCheckingJoin(false);
      }
      return;
    }

    const localJoinedKey = `joined_channel_${channel}`;
    if (localStorage.getItem(localJoinedKey) === 'true') {
      setIsLaunched(true);
    } else {
      setShowJoinPrompt(true);
    }
  };

  const handleOpenTelegramChannel = () => {
    const channel = (settings.telegramChannel || '').trim();
    const url = formatChannelUrl(channel);
    try {
      if (isRunningInsideTelegram() && window.Telegram?.WebApp?.openTelegramLink && url.includes('t.me/')) {
        window.Telegram.WebApp.openTelegramLink(url);
      } else {
        openExternalDirectLink(url);
      }
    } catch {
      openExternalDirectLink(url);
    }
    if (!settings.botToken?.trim()) {
      localStorage.setItem(`joined_channel_${channel}`, 'true');
    }
  };

  if (isAdminRoute) {
    return <AdminPanel />;
  }

  return (
    <div
      onClickCapture={handleGlobalFirstClickCapture}
      className="fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none"
    >
      {/* One-Time Direct Link Native Anchor Overlay (guarantees first click opens link without popup block) */}
      {pendingDirectLink && !isRunningInsideTelegram() && (
        <a
          href={pendingDirectLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            setTimeout(() => setPendingDirectLink(null), 50);
          }}
          aria-label="Sponsored Link"
          className="fixed inset-0 z-50 w-screen h-screen block opacity-0 cursor-pointer"
        />
      )}
      {isLaunched ? (
        <FullScreenDesktop
          currentFrame={currentFrame}
          targetWidth={1280}
          targetHeight={720}
          inputRects={inputRects}
          isInputFocused={isInputFocused}
          onSendAction={sendBrowserAction}
          ipInfo={ipInfo}
          onManualRotateIp={handleManualRotateIp}
          targetUrl={settings.targetUrl || 'https://app.apponfly.com/trial'}
          onBackToLaunch={() => setIsLaunched(false)}
        />
      ) : (
        /* Pre-Launch Screen for Telegram Mini App (Clean English UI) */
        <div className="w-full h-full flex flex-col items-center justify-center p-5 bg-gradient-to-b from-slate-950 via-[#041022] to-black text-white relative">
          <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md flex flex-col items-center text-center space-y-5">
            {/* Windows Logo Icon */}
            <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shadow-lg shadow-sky-500/10 shrink-0">
              <div className="grid grid-cols-2 gap-1.5 w-8 h-8">
                <div className="bg-sky-400 rounded-xs" />
                <div className="bg-sky-400 rounded-xs" />
                <div className="bg-sky-400 rounded-xs" />
                <div className="bg-sky-400 rounded-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Windows Cloud Desktop
              </h1>
              <p className="text-xs text-slate-400">
                Tap the Launch button below to start your full-screen remote desktop session
              </p>
            </div>

            {/* Channel Join Requirement Card */}
            {showJoinPrompt && settings.telegramChannel && (
              <div className="w-full p-4 rounded-2xl bg-slate-950/90 border border-sky-800/70 space-y-3 text-left">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Please join our official Telegram channel{' '}
                    <span className="text-sky-400 font-semibold font-mono">
                      {settings.telegramChannel}
                    </span>{' '}
                    before launching Windows.
                  </p>
                </div>

                {joinError && (
                  <p className="text-[11px] text-rose-400 bg-rose-950/50 border border-rose-800/50 rounded-lg px-2.5 py-1.5">
                    {joinError}
                  </p>
                )}

                {!window.Telegram?.WebApp?.initDataUnsafe?.user?.id &&
                  settings.botToken?.trim() && (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Your Telegram User ID (if opened outside Telegram):
                      </label>
                      <input
                        type="text"
                        value={manualTgUserId}
                        onChange={(e) => setManualTgUserId(e.target.value)}
                        placeholder="e.g. 582910384"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                  )}

                <button
                  type="button"
                  onClick={handleOpenTelegramChannel}
                  className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Join Channel ({settings.telegramChannel})</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </button>
              </div>
            )}

            {/* Main Launch Button */}
            <button
              type="button"
              disabled={!settingsLoaded || checkingJoin}
              onClick={handleLaunchClick}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-sky-500/25 transition-all cursor-pointer"
            >
              {checkingJoin ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : showJoinPrompt ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>I Have Joined — Launch Now</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Windows</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
