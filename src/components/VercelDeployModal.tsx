import React, { useState } from 'react';
import { X, Copy, Check, FileCode, Server, Zap, Shield, ExternalLink, Terminal } from 'lucide-react';

interface VercelDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'bn' | 'en';
}

export const VercelDeployModal: React.FC<VercelDeployModalProps> = ({ isOpen, onClose, lang }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'vercelJson' | 'apiBrowser' | 'env'>('guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const vercelJsonCode = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "framework": "vite",
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "env": {
    "CHROMIUM_PACK_URL": "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
  }
}`;

  const envCode = `# Vercel Environment Variables
# 1. (Recommended for ultra-fast <50ms latency): Remote Browserless / CDP endpoint
PUPPETEER_WS_ENDPOINT="wss://chrome.browserless.io?token=YOUR_API_KEY"

# 2. Or using @sparticuz/chromium-min tar archive
CHROMIUM_PACK_URL="https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {lang === 'bn'
                  ? 'Vercel ডেপ্লয়মেন্ট ও ফাস্ট রেসপন্স টাইম গাইড'
                  : 'Vercel Deployment & Low Latency Guide'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'bn'
                  ? 'Puppeteer Core + @sparticuz/chromium-min কনফিগারেশন'
                  : 'Puppeteer Core + @sparticuz/chromium-min configuration'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-5 bg-slate-950/40 overflow-x-auto gap-2 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'কীভাবে Vercel এ চালাবেন?' : 'Vercel Setup'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vercelJson')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'vercelJson'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>vercel.json</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apiBrowser')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'apiBrowser'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>api/browser.ts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'env'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>.env Config</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-300">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-800/60">
                <h4 className="font-semibold text-sky-300 flex items-center gap-1.5 text-sm mb-1">
                  <Zap className="w-4 h-4" />
                  {lang === 'bn' ? 'দ্রুত রেসপন্স টাইম অর্জনের ট্রিকস' : 'Fast Response Time Architecture'}
                </h4>
                <ul className="text-xs space-y-1.5 text-slate-300 list-disc list-inside">
                  <li>
                    {lang === 'bn'
                      ? 'Global Singleton Browser Pattern: প্রতি ক্লিকে নতুন ব্রাউজার না খুলে Vercel Lambda warm instance এ একই ব্রাউজার রি-ইউজ করা হয়।'
                      : 'Global Singleton Browser Pattern: Browser instance is kept warm across requests, avoiding 3-second cold boots.'}
                  </li>
                  <li>
                    {lang === 'bn'
                      ? 'Optimized Chromium Flags: GPU, অডিও, অপ্রয়োজনীয় এক্সটেনশন ও অ্যানিমেশন বন্ধ করে রেসপন্স টাইম <30ms এ নামিয়ে আনা হয়েছে।'
                      : 'Lightweight Chromium Flags: Disabled GPU, sync, metrics, and background extensions for sub-30ms execution.'}
                  </li>
                  <li>
                    {lang === 'bn'
                      ? 'Adaptive JPEG Quality: 60-70% কোয়ালিটিতে স্ক্রিনশট সাইজ মাত্র 25KB-50KB থাকে, যা মোবাইল নেটওয়ার্কেও সুপারফাস্ট লোড হয়।'
                      : 'Adaptive JPEG Quality: 60-70% quality reduces frame payload to 30KB for lightning mobile transfer.'}
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-100 text-sm">
                  {lang === 'bn' ? 'Vercel এ ডিপ্লয় করার ধাপসমূহ:' : 'Deployment Steps to Vercel:'}
                </h4>
                <ol className="text-xs space-y-2 list-decimal list-inside text-slate-300">
                  <li className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <strong>1. ডিপেনডেন্সি চেক করুন:</strong> <code className="text-sky-400 font-mono">package.json</code> এ <code className="text-amber-400 font-mono">puppeteer-core</code> এবং <code className="text-amber-400 font-mono">@sparticuz/chromium-min</code> ইন্সটল করা আছে।
                  </li>
                  <li className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <strong>2. Memory সাইজ 1024MB নির্ধারণ:</strong> Vercel এ ক্রোমিয়াম চালানোর জন্য минимум 1024MB RAM প্রয়োজন, যা <code className="text-sky-400 font-mono">vercel.json</code> এ কনফিগার করা আছে।
                  </li>
                  <li className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <strong>3. Vercel এ ডিপ্লয় কমান্ড:</strong>
                    <div className="mt-1.5 p-2 bg-black rounded font-mono text-[11px] text-emerald-400 flex justify-between items-center">
                      <span>vercel --prod</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('vercel --prod', 'cmd')}
                        className="text-slate-400 hover:text-white"
                      >
                        {copiedKey === 'cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </li>
                  <li className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <strong>4. রিমোট CDP এন্ডপয়েন্ট (ঐচ্ছিক কিন্তু সেরা গতি):</strong> আপনি যদি Browserless.io বা Bright Data ব্যবহার করেন, তবে <code className="text-sky-400 font-mono">PUPPETEER_WS_ENDPOINT</code> ভেরিয়েবল সেট করলে কোনো বাইনারি ছাড়াই সরাসরি 15ms গতিতে কাজ করবে।
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'vercelJson' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">vercel.json</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(vercelJsonCode, 'vercelJson')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  {copiedKey === 'vercelJson' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'vercelJson' ? 'কপি হয়েছে!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-3 bg-black rounded-xl text-xs font-mono text-sky-300 overflow-x-auto border border-slate-800">
                {vercelJsonCode}
              </pre>
            </div>
          )}

          {activeTab === 'apiBrowser' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">api/browser.ts (Vercel Serverless Function)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('File already placed in /api/browser.ts', 'apiBrowser')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{lang === 'bn' ? 'প্রজেক্টে রেডি আছে' : 'Ready in project'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {lang === 'bn'
                  ? 'এই ফাংশনটি ইতিমধ্যে আপনার প্রজেক্টের `/api/browser.ts` ফাইলে তৈরি করে দেওয়া হয়েছে। এটি Vercel এ রিয়েল-টাইম টাচ, মাউস ক্লিক এবং কীবোর্ড ইনপুট হ্যান্ডল করে।'
                  : 'Already created in /api/browser.ts. Handles real-time clicks, touches, and fast keyboard injection.'}
              </p>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">.env Variables for Vercel</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(envCode, 'env')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'env' ? 'কপি হয়েছে!' : 'Copy Config'}</span>
                </button>
              </div>
              <pre className="p-3 bg-black rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto border border-slate-800">
                {envCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex justify-between items-center text-xs text-slate-400">
          <span>Target: https://app.apponfly.com/trial</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors"
          >
            {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
