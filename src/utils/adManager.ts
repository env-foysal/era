const DAILY_TRACKER_KEY = 'apponfly_daily_ad_tracker_v1';
const DIRECT_LINK_INDEX_KEY = 'apponfly_direct_link_idx_v1';

interface DailyAdTracker {
  date: string;
  count: number;
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

export function incrementDailyAdCount(): number {
  const today = getTodayDateString();
  const current = getDailyAdCount();
  const next = current + 1;
  try {
    localStorage.setItem(DAILY_TRACKER_KEY, JSON.stringify({ date: today, count: next }));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function canShowAdToday(dailyLimit: number = 5): boolean {
  const limit = dailyLimit > 0 ? dailyLimit : 5;
  return getDailyAdCount() < limit;
}

export function getNextDirectLink(links: string[]): string | null {
  const validLinks = (links || []).map((l) => l.trim()).filter((l) => l.length > 0);
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

export function injectMonetagAdCode(monetagCode: string): void {
  const trimmed = (monetagCode || '').trim();
  if (!trimmed) return;

  // Avoid duplicate injection in same session
  if (document.getElementById('monetag-dynamic-container')) return;

  const container = document.createElement('div');
  container.id = 'monetag-dynamic-container';
  document.body.appendChild(container);

  // If the admin pasted HTML with <script> tags
  if (trimmed.includes('<script')) {
    const temp = document.createElement('div');
    temp.innerHTML = trimmed;
    const scripts = temp.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (oldScript.textContent) {
        newScript.textContent = oldScript.textContent;
      }
      document.body.appendChild(newScript);
    });
  } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    const script = document.createElement('script');
    script.src = trimmed;
    script.async = true;
    document.body.appendChild(script);
  } else {
    // Raw JS snippet
    const script = document.createElement('script');
    script.textContent = trimmed;
    document.body.appendChild(script);
  }
}

export function openExternalDirectLink(url: string): void {
  if (!url) return;
  try {
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
      return;
    }
  } catch {
    // fallback to anchor click
  }

  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
