import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page, type CDPSession } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import dotenv from 'dotenv';
import {
  verifyTelegramChannelMember,
  IP_ROTATION_INTERVAL_MS,
  detectInputRectsAndActiveState,
} from './api/browser.ts';
import {
  generateResidentialProfile,
  applyStealthProfileToPage,
  type ResidentialProfile,
} from './api/stealth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

export interface InputBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserSession {
  browser: Browser | null;
  page: Page | null;
  cdpSession: CDPSession | null;
  lastFrame: string | null;
  url: string;
  title: string;
  status: 'idle' | 'starting' | 'running' | 'error';
  error: string | null;
  viewport: { width: number; height: number; isMobile: boolean };
  mode: 'real-puppeteer' | 'simulated-engine';
  sseClients: express.Response[];
  typedBuffer: string;
  lastClick: { x: number; y: number } | null;
  currentIp: string;
  currentProfile: ResidentialProfile;
  lastIpRotationAt: number;
  inputRects: InputBoxRect[];
  isInputFocused: boolean;
}

// Simulated engine input boxes in 1280x720 coordinate space
const SIMULATED_INPUT_RECTS: InputBoxRect[] = [
  // Address / Text Input Box inside Window
  { x: 155, y: 90, width: 1070, height: 44 },
  // Windows Taskbar Search Box
  { x: 58, y: 682, width: 210, height: 30 },
];

const initialResidentialProfile = generateResidentialProfile();

const session: BrowserSession = {
  browser: null,
  page: null,
  cdpSession: null,
  lastFrame: null,
  url: 'https://app.apponfly.com/trial',
  title: 'AppOnFly Cloud Desktop',
  status: 'idle',
  error: null,
  viewport: { width: 1280, height: 720, isMobile: false },
  mode: 'simulated-engine',
  sseClients: [],
  typedBuffer: '',
  lastClick: null,
  currentIp: initialResidentialProfile.ip,
  currentProfile: initialResidentialProfile,
  lastIpRotationAt: Date.now(),
  inputRects: SIMULATED_INPUT_RECTS,
  isInputFocused: false,
};

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

function isPointInsideRects(x: number, y: number, rects: InputBoxRect[]): boolean {
  return rects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
}

async function rotateSessionIp(): Promise<string> {
  const nextProfile = generateResidentialProfile(session.currentIp);
  session.currentProfile = nextProfile;
  session.currentIp = nextProfile.ip;
  session.lastIpRotationAt = Date.now();

  if (session.mode === 'real-puppeteer' && session.page && !session.page.isClosed()) {
    try {
      const client = await session.page.createCDPSession();
      await client.send('Network.clearBrowserCookies').catch(() => {});
      await client.send('Network.clearBrowserCache').catch(() => {});
      await client
        .send('Storage.clearDataForOrigin', {
          origin: 'https://app.apponfly.com',
          storageTypes: 'all',
        })
        .catch(() => {});
      await client.detach();
      await applyStealthProfileToPage(session.page, session.currentProfile);
      await session.page
        .goto(session.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(() => {});
    } catch {
      // ignore if page closed
    }
  }
  return session.currentIp;
}

// Automatically rotate IP every 20.5 minutes (1,230,000 ms)
setInterval(() => {
  rotateSessionIp().catch(() => {});
}, IP_ROTATION_INTERVAL_MS);

function broadcastFrame(base64Jpeg: string, latencyMs: number = 0) {
  session.lastFrame = base64Jpeg;
  const payload = JSON.stringify({
    frame: base64Jpeg,
    url: session.url,
    title: session.title,
    latencyMs,
    ip: session.currentIp,
    nextIpRotationAt: session.lastIpRotationAt + IP_ROTATION_INTERVAL_MS,
    inputRects: session.inputRects,
    isInputFocused: session.isInputFocused,
    timestamp: Date.now(),
  });

  session.sseClients = session.sseClients.filter((client) => {
    try {
      client.write(`data: ${payload}\n\n`);
      return true;
    } catch {
      return false;
    }
  });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSimulatedAppOnFlyFrame(): string {
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  const w = session.viewport.width;
  const h = session.viewport.height;
  const safeTyped = escapeXml(session.typedBuffer.slice(-65));
  const clickCoord = session.lastClick;
  const inputActive = session.isInputFocused;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="winBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#001830"/>
        <stop offset="50%" stop-color="#003566"/>
        <stop offset="100%" stop-color="#000814"/>
      </linearGradient>
      <linearGradient id="taskbar" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#030712"/>
      </linearGradient>
    </defs>

    <!-- Full-screen Windows Desktop Wallpaper -->
    <rect width="${w}" height="${h}" fill="url(#winBg)" />
    <path d="M 0,${h * 0.4} Q ${w * 0.4},${h * 0.2} ${w},${h * 0.6} L ${w},${h} L 0,${h} Z" fill="#0284c7" opacity="0.16"/>
    <path d="M 0,${h * 0.6} Q ${w * 0.6},${h * 0.3} ${w},${h * 0.8} L ${w},${h} L 0,${h} Z" fill="#38bdf8" opacity="0.1"/>

    <!-- Desktop Icons -->
    <g transform="translate(28, 36)">
      <rect x="0" y="0" width="76" height="76" rx="8" fill="rgba(255,255,255,0.06)"/>
      <path d="M 23,20 h 30 v 22 h -30 Z M 31,42 v 6 h 14 v -6" stroke="#38bdf8" stroke-width="2.5" fill="none"/>
      <text x="38" y="64" fill="#f8fafc" font-family="sans-serif" font-size="11" text-anchor="middle">This PC</text>

      <g transform="translate(0, 92)">
        <rect x="0" y="0" width="76" height="76" rx="8" fill="rgba(255,255,255,0.06)"/>
        <circle cx="38" cy="28" r="15" fill="none" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="38" cy="28" r="6" fill="#3b82f6"/>
        <text x="38" y="64" fill="#f8fafc" font-family="sans-serif" font-size="11" text-anchor="middle">Chrome</text>
      </g>

      <g transform="translate(0, 184)">
        <rect x="0" y="0" width="76" height="76" rx="8" fill="rgba(255,255,255,0.06)"/>
        <rect x="24" y="15" width="28" height="28" rx="4" fill="#10b981"/>
        <text x="38" y="34" fill="#fff" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">W</text>
        <text x="38" y="64" fill="#f8fafc" font-family="sans-serif" font-size="11" text-anchor="middle">Notepad</text>
      </g>
    </g>

    <!-- Active Windows Cloud Browser Window -->
    <g transform="translate(135, 36)">
      <rect width="${w - 170}" height="${h - 104}" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
      <rect width="${w - 170}" height="38" rx="10" fill="#1e293b"/>
      <circle cx="18" cy="19" r="5" fill="#ef4444"/>
      <circle cx="34" cy="19" r="5" fill="#f59e0b"/>
      <circle cx="50" cy="19" r="5" fill="#10b981"/>
      <text x="72" y="24" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" font-weight="600">AppOnFly Windows 11 Cloud Session — IP: ${session.currentIp}</text>

      <!-- Address / Input Box inside Remote Desktop (x: 155..1225, y: 90..134) -->
      <rect x="20" y="54" width="${w - 210}" height="44" rx="8" fill="#020617" stroke="${
        inputActive ? '#38bdf8' : '#334155'
      }" stroke-width="${inputActive ? '2' : '1.5'}"/>
      <text x="36" y="81" fill="${inputActive ? '#38bdf8' : '#94a3b8'}" font-family="monospace" font-size="15">${
        safeTyped
          ? safeTyped + (inputActive ? '|' : '')
          : inputActive
          ? '| Type using your phone keyboard...'
          : 'Click inside this input box to open keyboard...'
      }</text>

      <!-- Main Workspace -->
      <rect x="20" y="114" width="${w - 210}" height="${h - 238}" rx="8" fill="#111827" stroke="#1e293b"/>
      <text x="${(w - 170) / 2}" y="195" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">AppOnFly Remote Desktop Active</text>
      <text x="${(w - 170) / 2}" y="228" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">Landscape 16:9 HD • Keyboard opens only on input fields • Auto IP rotation every 20.5m</text>

      <rect x="${(w - 170) / 2 - 150}" y="260" width="300" height="44" rx="8" fill="#0284c7"/>
      <text x="${(w - 170) / 2}" y="287" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Session IP: ${session.currentIp}</text>
    </g>

    ${
      clickCoord
        ? `<circle cx="${clickCoord.x}" cy="${clickCoord.y}" r="16" fill="rgba(56, 189, 248, 0.35)" stroke="#38bdf8" stroke-width="2"/>
           <circle cx="${clickCoord.x}" cy="${clickCoord.y}" r="4" fill="#38bdf8"/>`
        : ''
    }

    <!-- Windows 11 Taskbar -->
    <rect x="0" y="${h - 46}" width="${w}" height="46" fill="url(#taskbar)" />
    <rect x="14" y="${h - 38}" width="34" height="30" rx="4" fill="#0284c7"/>
    <g transform="translate(22, ${h - 31})">
      <rect x="0" y="0" width="7" height="7" fill="#fff"/>
      <rect x="9" y="0" width="7" height="7" fill="#fff"/>
      <rect x="0" y="9" width="7" height="7" fill="#fff"/>
      <rect x="9" y="9" width="7" height="7" fill="#fff"/>
    </g>
    <!-- Windows Search Input Box (x: 58..268, y: 682..712) -->
    <rect x="58" y="${h - 38}" width="210" height="30" rx="15" fill="rgba(255,255,255,0.08)" stroke="${
      inputActive ? '#38bdf8' : 'none'
    }" stroke-width="1"/>
    <text x="76" y="${h - 19}" fill="#94a3b8" font-family="sans-serif" font-size="12">Search Windows...</text>
    <text x="${w - 18}" y="${h - 19}" fill="#f8fafc" font-family="monospace" font-size="12" text-anchor="end">${timeStr}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function initPuppeteer() {
  const isConn = Boolean(
    session.browser && ((session.browser as any).connected ?? (session.browser as any).isConnected?.())
  );
  if (isConn && session.page && !session.page.isClosed()) {
    return;
  }

  session.status = 'starting';

  try {
    const wsEndpoint = process.env.PUPPETEER_WS_ENDPOINT;
    if (wsEndpoint) {
      session.browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null,
      });
      session.mode = 'real-puppeteer';
    } else {
      let executablePath: string | null = null;
      try {
        executablePath = await (chromium as any).executablePath(CHROMIUM_PACK_URL);
      } catch (e: any) {
        console.warn('Chromium pack fallback:', e?.message || e);
      }

      const launchArgs = [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--force-webrtc-ip-handling-policy',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--mute-audio',
        '--window-size=1280,720',
      ];

      if (executablePath) {
        session.browser = await puppeteer.launch({
          args: launchArgs,
          executablePath,
          headless: true,
          defaultViewport: {
            width: session.viewport.width,
            height: session.viewport.height,
            isMobile: false,
            hasTouch: true,
          },
        });
        session.mode = 'real-puppeteer';
      } else {
        session.mode = 'simulated-engine';
        session.status = 'running';
        return;
      }
    }

    const pages = await session.browser.pages();
    session.page = pages.length > 0 ? pages[0] : await session.browser.newPage();

    await session.page.setViewport({
      width: session.viewport.width,
      height: session.viewport.height,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: true,
    });

    await applyStealthProfileToPage(session.page, session.currentProfile);

    await session.page
      .goto(session.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      .catch((e) => console.warn('Goto warning:', e.message));

    try {
      session.cdpSession = await session.page.createCDPSession();
      await session.cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 75,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });

      session.cdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
        try {
          await session.cdpSession?.send('Page.screencastFrameAck', { sessionId });
          broadcastFrame(`data:image/jpeg;base64,${data}`);
        } catch {
          // ignore
        }
      });
    } catch {
      // fallback to polling
    }

    session.status = 'running';
    session.error = null;
  } catch (err: any) {
    session.mode = 'simulated-engine';
    session.status = 'running';
    session.error = err.message;
  }
}

setInterval(async () => {
  if (session.sseClients.length === 0) return;

  const start = Date.now();
  if (session.mode === 'real-puppeteer' && session.page && !session.page.isClosed()) {
    try {
      const check = await detectInputRectsAndActiveState(session.page);
      session.inputRects = check.inputRects;
      session.isInputFocused = check.isInputFocused;

      const buf = await session.page.screenshot({
        type: 'jpeg',
        quality: 75,
        optimizeForSpeed: true,
      });
      broadcastFrame(`data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`, Date.now() - start);
    } catch {
      // ignore
    }
  } else {
    session.inputRects = SIMULATED_INPUT_RECTS;
    broadcastFrame(generateSimulatedAppOnFlyFrame(), 12);
  }
}, 500);

// Telegram Channel Membership Verification Endpoint
app.post('/api/telegram/check-member', async (req, res) => {
  const { botToken, channelUsername, userId } = req.body || {};
  const result = await verifyTelegramChannelMember(botToken || '', channelUsername || '', userId || '');
  res.json(result);
});

app.get('/api/browser/status', (req, res) => {
  const isConn = Boolean(
    session.browser && ((session.browser as any).connected ?? (session.browser as any).isConnected?.())
  );
  res.json({
    status: session.status,
    mode: session.mode,
    url: session.url,
    title: session.title,
    viewport: session.viewport,
    hasBrowser: isConn,
    activeClients: session.sseClients.length,
    vercelReady: true,
    targetUrl: session.url,
    ip: session.currentIp,
    isp: session.currentProfile.isp,
    country: session.currentProfile.country,
    timezone: session.currentProfile.timezone,
    lastIpRotationAt: session.lastIpRotationAt,
    nextIpRotationAt: session.lastIpRotationAt + IP_ROTATION_INTERVAL_MS,
    rotationIntervalMinutes: 20.5,
  });
});

app.post('/api/browser/rotate-ip', async (req, res) => {
  const newIp = await rotateSessionIp();
  res.json({
    success: true,
    ip: newIp,
    isp: session.currentProfile.isp,
    country: session.currentProfile.country,
    timezone: session.currentProfile.timezone,
    lastIpRotationAt: session.lastIpRotationAt,
    nextIpRotationAt: session.lastIpRotationAt + IP_ROTATION_INTERVAL_MS,
  });
});

app.get('/api/browser/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  session.sseClients.push(res);

  const initialFrame =
    session.lastFrame ||
    (session.mode === 'simulated-engine'
      ? generateSimulatedAppOnFlyFrame()
      : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
  res.write(
    `data: ${JSON.stringify({
      frame: initialFrame,
      url: session.url,
      title: session.title,
      mode: session.mode,
      ip: session.currentIp,
      nextIpRotationAt: session.lastIpRotationAt + IP_ROTATION_INTERVAL_MS,
      inputRects: session.inputRects,
      isInputFocused: session.isInputFocused,
      timestamp: Date.now(),
    })}\n\n`
  );

  req.on('close', () => {
    session.sseClients = session.sseClients.filter((c) => c !== res);
  });
});

app.get('/api/browser/snapshot', async (req, res) => {
  const start = Date.now();
  if (session.mode === 'real-puppeteer' && session.page && !session.page.isClosed()) {
    try {
      const check = await detectInputRectsAndActiveState(session.page);
      session.inputRects = check.inputRects;
      session.isInputFocused = check.isInputFocused;

      const buf = await session.page.screenshot({
        type: 'jpeg',
        quality: 75,
        optimizeForSpeed: true,
      });
      return res.json({
        success: true,
        frame: `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`,
        url: session.page.url(),
        title: await session.page.title().catch(() => 'AppOnFly'),
        ip: session.currentIp,
        inputRects: session.inputRects,
        isInputFocused: session.isInputFocused,
        latencyMs: Date.now() - start,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.json({
    success: true,
    frame: generateSimulatedAppOnFlyFrame(),
    url: session.url,
    title: session.title,
    ip: session.currentIp,
    inputRects: session.inputRects,
    isInputFocused: session.isInputFocused,
    latencyMs: Date.now() - start,
  });
});

app.post('/api/browser/action', async (req, res) => {
  const { type, x, y, button = 'left', text, key, keys, deltaX = 0, deltaY = 0 } = req.body;
  const start = Date.now();

  try {
    if (session.mode === 'real-puppeteer' && session.page && !session.page.isClosed()) {
      switch (type) {
        case 'click':
        case 'tap':
          if (typeof x === 'number' && typeof y === 'number') {
            await session.page.mouse.click(x, y, { button: button as any, delay: 10 });
          }
          break;

        case 'dblclick':
          if (typeof x === 'number' && typeof y === 'number') {
            await session.page.mouse.click(x, y, { count: 2, delay: 10 });
          }
          break;

        case 'rightclick':
          if (typeof x === 'number' && typeof y === 'number') {
            await session.page.mouse.click(x, y, { button: 'right', delay: 10 });
          }
          break;

        case 'type':
          if (text) {
            await session.page.keyboard.type(text, { delay: 5 });
          } else if (key) {
            await session.page.keyboard.press(key as any);
          }
          break;

        case 'keycombo':
          if (Array.isArray(keys)) {
            for (const k of keys) await session.page.keyboard.down(k as any);
            for (const k of [...keys].reverse()) await session.page.keyboard.up(k as any);
          }
          break;

        case 'scroll':
          await session.page.mouse.wheel({ deltaX, deltaY });
          break;

        case 'navigate':
          if (req.body.url) {
            session.url = req.body.url;
            await session.page.goto(req.body.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          break;
      }

      const check = await detectInputRectsAndActiveState(
        session.page,
        typeof x === 'number' ? x : undefined,
        typeof y === 'number' ? y : undefined
      );
      session.inputRects = check.inputRects;
      session.isInputFocused = check.isInputFocused;
    } else {
      if (typeof x === 'number' && typeof y === 'number') {
        session.lastClick = { x, y };
        session.isInputFocused = isPointInsideRects(x, y, SIMULATED_INPUT_RECTS);
      }
      if (type === 'type') {
        if (text) {
          session.typedBuffer += text;
        } else if (key === 'Backspace') {
          session.typedBuffer = session.typedBuffer.slice(0, -1);
        } else if (key === 'Enter') {
          session.typedBuffer += ' ↵ ';
        }
      }
      broadcastFrame(generateSimulatedAppOnFlyFrame(), Date.now() - start);
    }

    res.json({
      success: true,
      action: type,
      frame: session.lastFrame,
      isInputFocused: session.isInputFocused,
      inputRects: session.inputRects,
      ip: session.currentIp,
      latencyMs: Date.now() - start,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, latencyMs: Date.now() - start });
  }
});

app.post('/api/browser/config', async (req, res) => {
  const { wsEndpoint, viewport } = req.body;

  if (viewport) {
    session.viewport = {
      width: Number(viewport.width) || 1280,
      height: Number(viewport.height) || 720,
      isMobile: Boolean(viewport.isMobile),
    };
  }

  if (wsEndpoint) {
    process.env.PUPPETEER_WS_ENDPOINT = wsEndpoint;
    if (session.browser) {
      await session.browser.close().catch(() => {});
      session.browser = null;
    }
    await initPuppeteer();
  }

  res.json({ success: true, mode: session.mode, status: session.status });
});

async function startServer() {
  initPuppeteer().catch((e) => console.log('Init warning:', e.message));

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, () => {
    console.log(`> AppOnFly Remote Mobile Runner listening on http://localhost:${PORT}`);
  });
}

startServer();
