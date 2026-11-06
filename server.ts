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
  generateSimulatedAppOnFlyFrame,
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

function getCleanDesktopFrame(): string {
  return generateSimulatedAppOnFlyFrame(
    session.typedBuffer,
    session.lastClick || undefined,
    session.currentIp,
    session.viewport.width,
    session.viewport.height,
    session.isInputFocused
  );
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
    broadcastFrame(getCleanDesktopFrame(), 12);
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
    rotationIntervalMinutes: 20.1,
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
      ? getCleanDesktopFrame()
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
    frame: getCleanDesktopFrame(),
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
      broadcastFrame(getCleanDesktopFrame(), Date.now() - start);
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
