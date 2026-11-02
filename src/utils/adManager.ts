const DAILY_TRACKER_KEY = 'apponfly_daily_ad_tracker_v1';
const DIRECT_LINK_INDEX_KEY = 'apponfly_direct_link_idx_v1';
const SESSION_COUNTED_KEY = 'apponfly_session_ad_counted_v1';

interface DailyAdTracker {
  date: string;
  count: number;
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

export function isRunningInsideTelegram(): boolean {
  try {
    const tg = window.Telegram?.WebApp as any;
    return Boolean(tg && tg.initData && tg.initData.length > 0 && tg.platform !== 'unknown');
  } catch {
    return false;
  }
}

export function getDailyAdCount(): number {
  try {
    const raw = localStorage.getItem(DAILY_TRACKER_KEY);
    if (!raw) return 0;
    const parsed: DailyAdTracker = JSON.parse(raw);
    if (parsed.date !== getTodayDateString()) {
      return 0;
    }
    return parsed.count || 0;
  } catch {
    return 0;
  }
}

export function incrementDailyAdCountOncePerSession(): number {
  const today = getTodayDateString();
  const current = getDailyAdCount();
  try {
    if (sessionStorage.getItem(SESSION_COUNTED_KEY) === today) {
      return current;
    }
    const next = current + 1;
    localStorage.setItem(DAILY_TRACKER_KEY, JSON.stringify({ date: today, count: next }));
    sessionStorage.setItem(SESSION_COUNTED_KEY, today);
    return next;
  } catch {
    return current;
  }
}

export function resetDailyAdCount(): void {
  try {
    localStorage.removeItem(DAILY_TRACKER_KEY);
    sessionStorage.removeItem(SESSION_COUNTED_KEY);
  } catch {
    // ignore
  }
}

export function canShowAdToday(dailyLimit: number = 5): boolean {
  const limit = dailyLimit > 0 ? dailyLimit : 5;
  return getDailyAdCount() < limit;
}

export function normalizeUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function getNextDirectLink(links: string[]): string | null {
  const validLinks = (links || [])
    .map((l) => normalizeUrl(l))
    .filter((l) => l.length > 8);
  if (validLinks.length === 0) return null;

  try {
    const rawIdx = localStorage.getItem(DIRECT_LINK_INDEX_KEY);
    const currentIdx = rawIdx ? parseInt(rawIdx, 10) || 0 : 0;
    const link = validLinks[currentIdx % validLinks.length];
    localStorage.setItem(DIRECT_LINK_INDEX_KEY, String((currentIdx + 1) % validLinks.length));
    return link;
  } catch {
    return validLinks[0];
  }
}

function triggerMonetagSdkFunction(sdkName?: string | null, zoneId?: string | null) {
  const candidates: string[] = [];
  if (sdkName) candidates.push(sdkName);
  if (zoneId) candidates.push(`show_${zoneId}`);

  // Also scan window for any show_<digits> function registered by Monetag SDK
  Object.keys(window).forEach((key) => {
    if (/^show_\d+$/.test(key) && !candidates.includes(key)) {
      candidates.push(key);
    }
  });

  for (const fnName of candidates) {
    const fn = (window as any)[fnName];
    if (typeof fn === 'function') {
      try {
        const res = fn();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
        return true;
      } catch {
        // ignore
      }
    }
  }
  return false;
}

export function injectMonetagAdCode(monetagCode: string): void {
  const trimmed = (monetagCode || '').trim();
  if (!trimmed) return;

  const existingContainer = document.getElementById('monetag-dynamic-container');
  if (existingContainer) {
    // If already injected, attempt to invoke SDK show function if available
    triggerMonetagSdkFunction();
    return;
  }

  const container = document.createElement('div');
  container.id = 'monetag-dynamic-container';
  document.body.appendChild(container);

  // Case 1: Admin entered just a numeric Monetag Zone ID (e.g. "8594012")
  if (/^\d{4,12}$/.test(trimmed)) {
    const zoneId = trimmed;
    const sdkName = `show_${zoneId}`;
    const script = document.createElement('script');
    script.src = 'https://libtl.com/sdk.js';
    script.setAttribute('data-zone', zoneId);
    script.setAttribute('data-sdk', sdkName);
    script.async = true;
    script.onload = () => {
      setTimeout(() => triggerMonetagSdkFunction(sdkName, zoneId), 150);
    };
    document.body.appendChild(script);
    return;
  }

  // Case 2: Admin pasted HTML containing one or more <script> tags
  if (trimmed.includes('<script')) {
    const temp = document.createElement('div');
    temp.innerHTML = trimmed;
    const scripts = temp.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      let sdkName: string | null = null;
      let zoneId: string | null = null;

      Array.from(oldScript.attributes).forEach((attr) => {
        let val = attr.value;
        if (attr.name === 'src' && val.startsWith('//')) {
          val = `https:${val}`;
        }
        if (attr.name === 'data-sdk') sdkName = val;
        if (attr.name === 'data-zone') zoneId = val;
        newScript.setAttribute(attr.name, val);
      });

      if (oldScript.textContent) {
        newScript.textContent = oldScript.textContent;
      }

      newScript.onload = () => {
        setTimeout(() => triggerMonetagSdkFunction(sdkName, zoneId), 150);
      };

      document.body.appendChild(newScript);
    });

    // Also attempt trigger in case inline script registered it
    setTimeout(() => triggerMonetagSdkFunction(), 500);
    return;
  }

  // Case 3: Direct script URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    const script = document.createElement('script');
    script.src = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    script.async = true;
    script.onload = () => {
      setTimeout(() => triggerMonetagSdkFunction(), 150);
    };
    document.body.appendChild(script);
    return;
  }

  // Case 4: Raw JS code snippet
  try {
    const script = document.createElement('script');
    script.textContent = trimmed;
    document.body.appendChild(script);
    setTimeout(() => triggerMonetagSdkFunction(), 300);
  } catch {
    // ignore
  }
}

export function openExternalDirectLink(url: string): void {
  const validUrl = normalizeUrl(url);
  if (!validUrl) return;

  if (isRunningInsideTelegram() && window.Telegram?.WebApp?.openLink) {
    try {
      window.Telegram.WebApp.openLink(validUrl);
      return;
    } catch {
      // fallback to anchor click
    }
  }

  const a = document.createElement('a');
  a.href = validUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
