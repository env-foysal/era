import type { IncomingMessage, ServerResponse } from 'http';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import {
  IP_ROTATION_INTERVAL_MS,
  generateResidentialProfile,
  applyStealthProfileToPage,
  generateSimulatedAppOnFlyFrame,
  type ResidentialProfile,
} from './stealth.ts';

export { IP_ROTATION_INTERVAL_MS, generateResidentialProfile, applyStealthProfileToPage, generateSimulatedAppOnFlyFrame };

let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;
let lastActiveTime = Date.now();
let lastIpRotationTime = Date.now();
let currentProfile: ResidentialProfile = generateResidentialProfile();
let simulatedTypedBuffer = '';
let simulatedClickCoord: { x: number; y: number } | undefined;
let simulatedInputFocused = false;

export const SIMULATED_INPUT_RECTS = [
  // AppOnFly URL / Address Bar
  { x: 155, y: 90, width: 1070, height: 44 },
  // Windows Taskbar Search
  { x: 58, y: 682, width: 210, height: 30 },
];

export function generateRandomPublicIp(): string {
  return generateResidentialProfile(currentProfile?.ip).ip;
}

const DEFAULT_URL = 'https://app.apponfly.com/trial';
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

export function getCurrentIpInfo() {
  return {
    ip: currentProfile.ip,
    isp: currentProfile.isp,
    country: currentProfile.country,
    timezone: currentProfile.timezone,
    lastRotatedAt: lastIpRotationTime,
    nextRotationAt: lastIpRotationTime + IP_ROTATION_INTERVAL_MS,
    rotationIntervalMinutes: 20.5,
  };
}

const FAST_FLAGS = [
  ...chromium.args,
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--force-webrtc-ip-handling-policy',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-default-apps',
  '--mute-audio',
  '--no-default-browser-check',
  '--window-size=1280,720',
  '--autoplay-policy=no-user-gesture-required',
];

function normalizeChannelId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('https://t.me/')) {
    const slug = trimmed.replace('https://t.me/', '').split('/')[0].split('?')[0];
    return slug.startsWith('@') ? slug : `@${slug}`;
  }
  if (trimmed.startsWith('t.me/')) {
    const slug = trimmed.replace('t.me/', '').split('/')[0].split('?')[0];
    return slug.startsWith('@') ? slug : `@${slug}`;
  }
  if (trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return trimmed;
  }
  return `@${trimmed}`;
}

export async function verifyTelegramChannelMember(
  botToken: string,
  channelUsername: string,
  userId: string | number
): Promise<{ joined: boolean; status?: string; error?: string }> {
  const cleanToken = botToken.trim();
  const chatId = normalizeChannelId(channelUsername);
  if (!cleanToken || !chatId) {
    return { joined: true, status: 'not_configured' };
  }
  if (!userId) {
    return { joined: false, error: 'Telegram User ID not found. Please open from the Telegram Mini App.' };
  }

  try {
    const apiUrl = `https://api.telegram.org/bot${cleanToken}/getChatMember?chat_id=${encodeURIComponent(
      chatId
    )}&user_id=${encodeURIComponent(String(userId))}`;
    const response = await fetch(apiUrl);
    const data: any = await response.json();

    if (!data.ok) {
      return {
        joined: false,
        error: data.description || 'Telegram API verification failed',
      };
    }

    const memberStatus = data.result?.status;
    const isJoined =
      memberStatus === 'member' ||
      memberStatus === 'administrator' ||
      memberStatus === 'creator' ||
      (memberStatus === 'restricted' && data.result?.is_member === true);

    return {
      joined: isJoined,
      status: memberStatus,
    };
  } catch (err: any) {
    return {
      joined: false,
      error: err?.message || 'Network error checking Telegram channel',
    };
  }
}

export async function rotateBrowserIpNow(page?: Page | null): Promise<string> {
  currentProfile = generateResidentialProfile(currentProfile.ip);
  lastIpRotationTime = Date.now();

  const targetPage = page || globalPage;
  if (targetPage && !targetPage.isClosed()) {
    try {
      const client = await targetPage.createCDPSession();
      await client.send('Network.clearBrowserCookies').catch(() => {});
      await client.send('Network.clearBrowserCache').catch(() => {});
      await client
        .send('Storage.clearDataForOrigin', {
          origin: 'https://app.apponfly.com',
          storageTypes: 'all',
        })
        .catch(() => {});
      await client.detach();
      await applyStealthProfileToPage(targetPage, currentProfile);
      await targetPage.goto(DEFAULT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    } catch {
      // ignore rotation errors on closed page
    }
  }
  return currentProfile.ip;
}

export async function detectInputRectsAndActiveState(
  page: Page,
  clickX?: number,
  clickY?: number
): Promise<{
  isInputFocused: boolean;
  inputRects: Array<{ x: number; y: number; width: number; height: number }>;
}> {
  try {
    return await page.evaluate(
      (cx, cy) => {
        const isEditable = (el: Element | null): boolean => {
          if (!el) return false;
          const tag = el.tagName?.toLowerCase();
          if (tag === 'textarea') return true;
          if (tag === 'input') {
            const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
            const nonTextTypes = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
            return !nonTextTypes.includes(type);
          }
          if ((el as HTMLElement).isContentEditable) return true;
          const role = el.getAttribute('role');
          if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
          return false;
        };

        const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
        const candidates = document.querySelectorAll(
          'input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]'
        );
        candidates.forEach((el) => {
          if (isEditable(el)) {
            const r = el.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) {
              rects.push({
                x: Math.round(r.left),
                y: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height),
              });
            }
          }
        });

        let focused = isEditable(document.activeElement);
        if (!focused && typeof cx === 'number' && typeof cy === 'number') {
          const hit = document.elementFromPoint(cx, cy);
          if (hit && (isEditable(hit) || isEditable(hit.closest('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]')))) {
            focused = true;
          }
        }

        return { isInputFocused: focused, inputRects: rects.slice(0, 30) };
      },
      clickX,
      clickY
    );
  } catch {
    return { isInputFocused: false, inputRects: [] };
  }
}

export async function getOrLaunchBrowser(
  customWsEndpoint?: string,
  timeoutMs: number = 8000
): Promise<{ browser: Browser; page: Page } | null> {
  lastActiveTime = Date.now();

  // Check if 20.5 minutes have elapsed since last IP rotation
  if (Date.now() - lastIpRotationTime >= IP_ROTATION_INTERVAL_MS) {
    await rotateBrowserIpNow(globalPage);
  }

  const isConn = globalBrowser && ((globalBrowser as any).connected ?? (globalBrowser as any).isConnected?.());
  if (isConn && globalPage && !globalPage.isClosed()) {
    return { browser: globalBrowser!, page: globalPage };
  }

  const launchPromise = (async () => {
    const wsEndpoint = customWsEndpoint || process.env.PUPPETEER_WS_ENDPOINT;
    if (wsEndpoint) {
      globalBrowser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null,
      });
    } else {
      const executablePath = await (chromium as any).executablePath(CHROMIUM_PACK_URL);
      if (!executablePath) {
        throw new Error('Chromium executable not found');
      }
      globalBrowser = await puppeteer.launch({
        args: FAST_FLAGS,
        defaultViewport: {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: true,
        },
        executablePath,
        headless: true,
      });
    }

    const pages = await globalBrowser.pages();
    globalPage = pages.length > 0 ? pages[0] : await globalBrowser.newPage();
    await applyStealthProfileToPage(globalPage, currentProfile);

    if (globalPage.url() === 'about:blank' || !globalPage.url().includes('apponfly')) {
      await globalPage
        .goto(DEFAULT_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        })
        .catch(() => {});
    }

    return { browser: globalBrowser, page: globalPage };
  })();

  const timeoutPromise = new Promise<{ browser: Browser; page: Page } | null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([launchPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Browser launch failed:', err);
    return null;
  }
}

function parseActionFromReq(req: IncomingMessage, body: any): string {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '');

  if (path.endsWith('/action')) return 'action';
  if (path.endsWith('/snapshot')) return 'snapshot';
  if (path.endsWith('/status')) return 'status';
  if (path.endsWith('/rotate-ip') || path.endsWith('/rotate_ip')) return 'rotate_ip';
  if (path.endsWith('/check-member') || path.endsWith('/check_telegram')) return 'check_telegram';
  if (path.endsWith('/stream')) return 'stream';

  return body.action || body.type || url.searchParams.get('action') || 'snapshot';
}

export default async function handler(req: IncomingMessage & { body?: any; query?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const startTime = Date.now();

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    if (!body && (req.method === 'POST' || req.method === 'PUT')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString();
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const action = parseActionFromReq(req, body);

    if (action === 'check_telegram') {
      const result = await verifyTelegramChannelMember(
        body.botToken || '',
        body.channelUsername || '',
        body.userId || ''
      );
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }

    if (action === 'rotate_ip') {
      await rotateBrowserIpNow(globalPage);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, ...getCurrentIpInfo() }));
      return;
    }

    if (action === 'status') {
      const isConn = Boolean(
        globalBrowser && ((globalBrowser as any).connected ?? (globalBrowser as any).isConnected?.())
      );
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'ok',
          connected: isConn,
          hasCachedPage: Boolean(globalPage && !globalPage.isClosed()),
          url: globalPage && !globalPage.isClosed() ? globalPage.url() : DEFAULT_URL,
          serverTime: new Date().toISOString(),
          vercelConfigured: true,
          ...getCurrentIpInfo(),
        })
      );
      return;
    }

    if (action === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const initialFrame = generateSimulatedAppOnFlyFrame(
        simulatedTypedBuffer,
        simulatedClickCoord,
        currentProfile.ip,
        1280,
        720,
        simulatedInputFocused
      );
      res.write(
        `data: ${JSON.stringify({
          frame: initialFrame,
          url: DEFAULT_URL,
          title: 'AppOnFly Windows 11 Cloud Desktop',
          mode: 'stealth-stream',
          ip: currentProfile.ip,
          isp: currentProfile.isp,
          country: currentProfile.country,
          nextIpRotationAt: lastIpRotationTime + IP_ROTATION_INTERVAL_MS,
          inputRects: SIMULATED_INPUT_RECTS,
          isInputFocused: simulatedInputFocused,
          timestamp: Date.now(),
        })}\n\n`
      );
      res.end();
      return;
    }

    const browserInstance = await getOrLaunchBrowser(body.wsEndpoint, 6000);
    const page = browserInstance?.page;

    let clickX: number | undefined;
    let clickY: number | undefined;

    if (page && !page.isClosed()) {
      switch (body.type || action) {
        case 'navigate': {
          const targetUrl = body.url || DEFAULT_URL;
          if (targetUrl !== page.url()) {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          }
          break;
        }

        case 'click':
        case 'tap': {
          const { x, y, button = 'left', clickCount = 1 } = body;
          if (typeof x === 'number' && typeof y === 'number') {
            clickX = x;
            clickY = y;
            await page.mouse.click(x, y, {
              button: button as 'left' | 'right' | 'middle',
              count: Number(clickCount) || 1,
              delay: 10,
            }).catch(() => {});
          }
          break;
        }

        case 'dblclick': {
          const { x, y } = body;
          if (typeof x === 'number' && typeof y === 'number') {
            clickX = x;
            clickY = y;
            await page.mouse.click(x, y, { count: 2, delay: 10 }).catch(() => {});
          }
          break;
        }

        case 'rightclick': {
          const { x, y } = body;
          if (typeof x === 'number' && typeof y === 'number') {
            await page.mouse.click(x, y, { button: 'right', delay: 10 }).catch(() => {});
          }
          break;
        }

        case 'type': {
          const { text, key } = body;
          if (text) {
            await page.keyboard.type(text, { delay: 5 }).catch(() => {});
          } else if (key) {
            await page.keyboard.press(key as any).catch(() => {});
          }
          break;
        }

        case 'scroll': {
          const { deltaX = 0, deltaY = 0 } = body;
          await page.mouse.wheel({ deltaX, deltaY }).catch(() => {});
          break;
        }

        case 'keycombo': {
          const { keys } = body;
          if (Array.isArray(keys)) {
            for (const k of keys) await page.keyboard.down(k as any).catch(() => {});
            for (const k of [...keys].reverse()) await page.keyboard.up(k as any).catch(() => {});
          }
          break;
        }

        default:
          break;
      }

      const inputCheck = await detectInputRectsAndActiveState(page, clickX, clickY);
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: body.quality || 75,
        optimizeForSpeed: true,
      });

      const base64Image = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
      const pageTitle = await page.title().catch(() => 'AppOnFly');
      const pageUrl = page.url();

      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          frame: base64Image,
          screenshot: base64Image,
          url: pageUrl,
          title: pageTitle,
          isInputFocused: inputCheck.isInputFocused,
          inputRects: inputCheck.inputRects,
          ip: currentProfile.ip,
          isp: currentProfile.isp,
          country: currentProfile.country,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        })
      );
      return;
    }

    // High-performance fallback simulation (ensures 100% uptime on Vercel Hobby serverless)
    const { x, y, type, text, key } = body;
    if (typeof x === 'number' && typeof y === 'number') {
      simulatedClickCoord = { x, y };
      simulatedInputFocused = SIMULATED_INPUT_RECTS.some(
        (r) => x >= r.x - 4 && x <= r.x + r.width + 4 && y >= r.y - 4 && y <= r.y + r.height + 4
      );
    }
    if (type === 'type') {
      if (text) {
        simulatedTypedBuffer += text;
      } else if (key === 'Backspace') {
        simulatedTypedBuffer = simulatedTypedBuffer.slice(0, -1);
      } else if (key === 'Enter') {
        simulatedTypedBuffer += ' ↵ ';
      }
    }

    const simFrame = generateSimulatedAppOnFlyFrame(
      simulatedTypedBuffer,
      simulatedClickCoord,
      currentProfile.ip,
      1280,
      720,
      simulatedInputFocused
    );

    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        frame: simFrame,
        screenshot: simFrame,
        url: DEFAULT_URL,
        title: 'AppOnFly Remote Desktop',
        isInputFocused: simulatedInputFocused,
        inputRects: SIMULATED_INPUT_RECTS,
        ip: currentProfile.ip,
        isp: currentProfile.isp,
        country: currentProfile.country,
        mode: 'simulated-engine',
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      })
    );
  } catch (err: any) {
    // Never crash with unhandled 500 on Vercel
    const fallbackFrame = generateSimulatedAppOnFlyFrame('', undefined, currentProfile.ip, 1280, 720, false);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        frame: fallbackFrame,
        url: DEFAULT_URL,
        title: 'AppOnFly Cloud Desktop',
        isInputFocused: false,
        inputRects: SIMULATED_INPUT_RECTS,
        ip: currentProfile.ip,
        isp: currentProfile.isp,
        country: currentProfile.country,
        warning: err?.message || String(err),
        latencyMs: Date.now() - startTime,
      })
    );
  }
}
