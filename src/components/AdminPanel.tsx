import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Shield,
  LogOut,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Send,
  Link as LinkIcon,
  Code2,
  ArrowLeft,
  RefreshCw,
  Globe,
  RotateCcw,
  Play,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  ALLOWED_ADMIN_EMAIL,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import {
  normalizeUrl,
  resetDailyAdCount,
  getDailyAdCount,
  injectMonetagAdCode,
} from '../utils/adManager';
import type { AppSettings } from '../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  monetagCode: '',
  directLinks: [],
  dailyAdLimit: 5,
  telegramChannel: '',
  botToken: '',
  requireChannelJoin: false,
  targetUrl: 'https://app.apponfly.com/trial',
  updatedBy: ALLOWED_ADMIN_EMAIL,
};

export const AdminPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [monetagCode, setMonetagCode] = useState<string>('');
  const [directLinks, setDirectLinks] = useState<string[]>([]);
  const [newDirectLink, setNewDirectLink] = useState<string>('');
  const [dailyAdLimit, setDailyAdLimit] = useState<number>(5);
  const [telegramChannel, setTelegramChannel] = useState<string>('');
  const [botToken, setBotToken] = useState<string>('');
  const [requireChannelJoin, setRequireChannelJoin] = useState<boolean>(false);
  const [targetUrl, setTargetUrl] = useState<string>('https://app.apponfly.com/trial');

  const [ipInfo, setIpInfo] = useState<{
    ip: string;
    isp: string;
    country: string;
    timezone: string;
  }>({
    ip: 'Loading...',
    isp: 'Residential ISP',
    country: 'US',
    timezone: 'America/New_York',
  });
  const [rotatingIp, setRotatingIp] = useState<boolean>(false);
  const [localAdCount, setLocalAdCount] = useState<number>(() => getDailyAdCount());

  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const email = (currentUser.email || '').toLowerCase();
        if (email !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
          setAuthError(
            `Access Denied! Only ${ALLOWED_ADMIN_EMAIL} is authorized to sign into the Admin Panel. (Signed in as: ${currentUser.email})`
          );
          await signOut(auth);
          setUser(null);
          setAuthLoading(false);
          return;
        }
        setAuthError(null);
        setUser(currentUser);
        await loadAdminSettings();
        fetchCurrentIp();
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchCurrentIp = async () => {
    try {
      const res = await fetch('/api/browser/status');
      const data = await res.json();
      if (data.ip) {
        setIpInfo({
          ip: data.ip,
          isp: data.isp || 'Residential ISP',
          country: data.country || 'US',
          timezone: data.timezone || 'America/New_York',
        });
      }
    } catch {
      // ignore
    }
  };

  const handleManualRotateIp = async () => {
    setRotatingIp(true);
    try {
      const res = await fetch('/api/browser/rotate-ip', { method: 'POST' });
      const data = await res.json();
      if (data.ip) {
        setIpInfo({
          ip: data.ip,
          isp: data.isp || 'Residential ISP',
          country: data.country || 'US',
          timezone: data.timezone || 'America/New_York',
        });
      }
    } catch {
      // ignore
    } finally {
      setRotatingIp(false);
    }
  };

  const loadAdminSettings = async () => {
    const path = 'config/app_settings';
    try {
      const snap = await getDoc(doc(db, 'config', 'app_settings'));
      if (snap.exists()) {
        const data = snap.data() as AppSettings;
        setMonetagCode(data.monetagCode || '');
        setDirectLinks(Array.isArray(data.directLinks) ? data.directLinks : []);
        setDailyAdLimit(typeof data.dailyAdLimit === 'number' ? data.dailyAdLimit : 5);
        setTelegramChannel(data.telegramChannel || '');
        setBotToken(data.botToken || '');
        setRequireChannelJoin(Boolean(data.requireChannelJoin));
        setTargetUrl(data.targetUrl || 'https://app.apponfly.com/trial');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user.email || '').toLowerCase();
      if (email !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        setAuthError(`Access Denied! Only ${ALLOWED_ADMIN_EMAIL} is permitted to log in.`);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Google Sign-In failed.');
    }
  };

  const handleAddDirectLink = () => {
    setSaveError(null);
    const normalized = normalizeUrl(newDirectLink);
    if (!normalized) return;
    if (directLinks.length >= 20) {
      setSaveError('Maximum of 20 direct links allowed.');
      return;
    }
    if (normalized.length > 500) {
      setSaveError('Direct link cannot exceed 500 characters.');
      return;
    }
    setDirectLinks((prev) => [...prev, normalized]);
    setNewDirectLink('');
  };

  const handleRemoveDirectLink = (index: number) => {
    setDirectLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetAdCounter = () => {
    resetDailyAdCount();
    setLocalAdCount(0);
    setSaveMessage('Your local daily ad counter has been reset to 0! Ads will show again immediately.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleTestMonetagNow = () => {
    if (!monetagCode.trim()) {
      setSaveError('Please enter a Monetag ad script or Zone ID first.');
      return;
    }
    const existing = document.getElementById('monetag-dynamic-container');
    if (existing) existing.remove();
    injectMonetagAdCode(monetagCode);
    setSaveMessage('Monetag ad code injected & triggered!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const sanitizedLinks = directLinks
      .map((l) => normalizeUrl(l).slice(0, 500))
      .filter((l) => l.length > 8)
      .slice(0, 20);

    if (newDirectLink.trim() && sanitizedLinks.length < 20) {
      const extra = normalizeUrl(newDirectLink).slice(0, 500);
      if (extra.length > 8) {
        sanitizedLinks.push(extra);
        setDirectLinks(sanitizedLinks);
      }
      setNewDirectLink('');
    }

    const payload = {
      monetagCode: monetagCode.trim().slice(0, 5000),
      directLinks: sanitizedLinks,
      dailyAdLimit: Math.max(0, Math.min(100, Number(dailyAdLimit) || 5)),
      telegramChannel: telegramChannel.trim().slice(0, 200),
      botToken: botToken.trim().slice(0, 300),
      requireChannelJoin: Boolean(requireChannelJoin),
      targetUrl: (targetUrl.trim() || 'https://app.apponfly.com/trial').slice(0, 500),
      updatedBy: user.email.slice(0, 200),
      updatedAt: serverTimestamp(),
    };

    const path = 'config/app_settings';
    try {
      await setDoc(doc(db, 'config', 'app_settings'), payload);
      resetDailyAdCount();
      setLocalAdCount(0);
      setSaveMessage('All settings saved successfully! Local ad counter also reset for testing.');
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (err: any) {
      setSaveError('Failed to save settings.');
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-white">Hidden Admin Control Panel</h1>
            <p className="text-xs text-slate-400">
              Restricted exclusively to the authorized administrator Gmail account
            </p>
          </div>

          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-semibold rounded-xl text-sm flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          <div className="pt-2 border-t border-slate-800/80 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Mini App</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 overflow-y-auto select-text">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 pb-16">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Telegram Mini App — Admin Panel</h1>
              <p className="text-xs text-emerald-400 font-mono">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            >
              Open Mini App
            </a>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/60 text-xs font-medium text-rose-200 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Stealth Residential IP Rotation Status Banner (Every 20.5 Minutes) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Globe className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span>Stealth Residential IP (Auto-Rotates Every 20.5m)</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono">
                  WebRTC & Fingerprint Masked
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                IP: <span className="text-sky-400 font-bold">{ipInfo.ip}</span> • ISP:{' '}
                <span className="text-slate-200">{ipInfo.isp}</span> ({ipInfo.country} /{' '}
                {ipInfo.timezone})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualRotateIp}
            disabled={rotatingIp}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-sky-300 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotatingIp ? 'animate-spin' : ''}`} />
            <span>Rotate Residential IP</span>
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* 1. Telegram Bot Token & Channel Join Check */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-sky-400" />
                <h2 className="text-sm font-bold text-white">
                  Telegram Channel Join Verification (Launch Gate)
                </h2>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireChannelJoin}
                  onChange={(e) => setRequireChannelJoin(e.target.checked)}
                  className="w-4 h-4 accent-sky-500 rounded"
                />
                <span className="text-xs font-medium text-slate-300">Require Channel Join</span>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Channel Username
                </label>
                <input
                  type="text"
                  value={telegramChannel}
                  onChange={(e) => setTelegramChannel(e.target.value)}
                  placeholder="@yourchannel"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Example: <code className="text-sky-400">@mychannel</code> (Ensure the bot is added as an Admin in the channel)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Telegram Bot Token
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:AAH..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Bot token from @BotFather used to verify real-time channel membership
                </p>
              </div>
            </div>
          </div>

          {/* 2. Monetag Ad Code (1 Second Delay) & Daily Cap */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-sm font-bold text-white">
                  Monetag Ad Code (Auto-triggers after 1 second)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Daily Ad Limit:</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={dailyAdLimit}
                  onChange={(e) => setDailyAdLimit(Number(e.target.value) || 5)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white font-mono"
                />
                <span className="text-xs text-slate-400">/ day</span>
              </div>
            </div>

            <textarea
              rows={4}
              value={monetagCode}
              onChange={(e) => setMonetagCode(e.target.value)}
              placeholder="<script src='//libtl.com/sdk.js' data-zone='XXXXXX' data-sdk='show_XXXXXX'></script> or Zone ID"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-slate-400">
                Supports Monetag Mini App SDK (<code className="text-sky-400">data-sdk="show_..."</code>), MultiTag, In-Page Push, or plain numeric Zone ID. (Your local views today: {localAdCount}/{dailyAdLimit})
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAdCounter}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Counter</span>
                </button>
                <button
                  type="button"
                  onClick={handleTestMonetagNow}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-medium text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  <span>Test Ad Now</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Multiple Direct Links (One-time per click rotation) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Direct Links (Opens once on first click, rotates links)
              </h2>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newDirectLink}
                onChange={(e) => setNewDirectLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDirectLink();
                  }
                }}
                placeholder="https://your-direct-link.com/..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                type="button"
                onClick={handleAddDirectLink}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Link</span>
              </button>
            </div>

            {directLinks.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-500">
                No direct links added yet. Enter a URL above and click "Add Link".
              </div>
            ) : (
              <div className="space-y-2">
                {directLinks.map((link, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono text-[10px]">
                        #{idx + 1}
                      </span>
                      <span className="text-slate-200 font-mono truncate">{link}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDirectLink(idx)}
                      className="p-1.5 text-rose-400 hover:bg-rose-950/60 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saveMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700/80 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-700/80 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-sky-600/20 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
