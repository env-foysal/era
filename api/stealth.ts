import type { Page } from 'puppeteer-core';

// 20.1 minutes in milliseconds (1,206,000 ms)
export const IP_ROTATION_INTERVAL_MS = 20.1 * 60 * 1000;

export interface ResidentialProfile {
  ip: string;
  isp: string;
  country: string;
  timezone: string;
  language: string;
  userAgent: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  canvasSeed: number;
}

// Majority Singapore (SG) and United States (US) Residential ISPs
const RESIDENTIAL_ISP_POOLS = [
  // Singapore (SG)
  {
    firstOctets: [116, 118, 175],
    isp: 'Singtel Residential Broadband',
    country: 'SG',
    timezone: 'Asia/Singapore',
    language: 'en-SG,en;q=0.9',
  },
  {
    firstOctets: [182, 183, 218],
    isp: 'StarHub Internet Residential',
    country: 'SG',
    timezone: 'Asia/Singapore',
    language: 'en-SG,en;q=0.9',
  },
  {
    firstOctets: [119, 121, 220],
    isp: 'M1 Limited Residential Fiber',
    country: 'SG',
    timezone: 'Asia/Singapore',
    language: 'en-SG,en;q=0.9',
  },
  {
    firstOctets: [103, 115, 128],
    isp: 'MyRepublic Broadband SG',
    country: 'SG',
    timezone: 'Asia/Singapore',
    language: 'en-SG,en;q=0.9',
  },
  // United States (US)
  {
    firstOctets: [73, 68, 24],
    isp: 'Comcast Cable Communications',
    country: 'US',
    timezone: 'America/New_York',
    language: 'en-US,en;q=0.9',
  },
  {
    firstOctets: [99, 75, 108],
    isp: 'AT&T Internet Services',
    country: 'US',
    timezone: 'America/Chicago',
    language: 'en-US,en;q=0.9',
  },
  {
    firstOctets: [71, 96, 173],
    isp: 'Verizon Fios Residential',
    country: 'US',
    timezone: 'America/New_York',
    language: 'en-US,en;q=0.9',
  },
  {
    firstOctets: [142, 174, 66],
    isp: 'Charter Spectrum Residential',
    country: 'US',
    timezone: 'America/Los_Angeles',
    language: 'en-US,en;q=0.9',
  },
];

const CHROME_VERSIONS = [
  '131.0.6778.86',
  '131.0.6778.109',
  '130.0.6723.117',
  '131.0.6778.139',
];

export function generateResidentialProfile(previousIp?: string): ResidentialProfile {
  let ip = '';
  let pool = RESIDENTIAL_ISP_POOLS[0];

  do {
    pool = RESIDENTIAL_ISP_POOLS[Math.floor(Math.random() * RESIDENTIAL_ISP_POOLS.length)];
    const first = pool.firstOctets[Math.floor(Math.random() * pool.firstOctets.length)];
    const second = Math.floor(Math.random() * 220) + 12;
    const third = Math.floor(Math.random() * 250) + 2;
    const fourth = Math.floor(Math.random() * 250) + 2;
    ip = `${first}.${second}.${third}.${fourth}`;
  } while (ip === previousIp);

  const chromeVer = CHROME_VERSIONS[Math.floor(Math.random() * CHROME_VERSIONS.length)];
  const cores = [8, 12, 16][Math.floor(Math.random() * 3)];
  const memory = [8, 16][Math.floor(Math.random() * 2)];

  return {
    ip,
    isp: pool.isp,
    country: pool.country,
    timezone: pool.timezone,
    language: pool.language,
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`,
    hardwareConcurrency: cores,
    deviceMemory: memory,
    canvasSeed: Math.floor(Math.random() * 999999) + 1,
  };
}

export async function applyStealthProfileToPage(page: Page, profile: ResidentialProfile) {
  await page.setUserAgent(profile.userAgent);

  await page.setExtraHTTPHeaders({
    'Accept-Language': profile.language,
    'X-Forwarded-For': profile.ip,
    'X-Real-IP': profile.ip,
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
  });

  try {
    const client = await page.createCDPSession();
    await client.send('Emulation.setTimezoneOverride', { timezoneId: profile.timezone }).catch(() => {});
    await client.detach();
  } catch {
    // ignore
  }

  await page.evaluateOnNewDocument((prof: ResidentialProfile) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => prof.hardwareConcurrency, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => prof.deviceMemory, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => [prof.language.split(',')[0], 'en'], configurable: true });

    (window as any).chrome = {
      app: { isInstalled: false },
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
    };

    const OrigPeerConnection = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;
    if (OrigPeerConnection) {
      const WrappedPeerConnection = function (this: any, config: any, constraints?: any) {
        const pc = new OrigPeerConnection(config, constraints);
        const origAddEventListener = pc.addEventListener.bind(pc);
        pc.addEventListener = function (type: string, listener: any, options?: any) {
          if (type === 'icecandidate') {
            const wrappedListener = function (event: any) {
              if (event?.candidate?.candidate) {
                const masked = event.candidate.candidate.replace(/([0-9]{1,3}(\.[0-9]{1,3}){3})/g, prof.ip);
                Object.defineProperty(event.candidate, 'candidate', { value: masked });
              }
              return listener(event);
            };
            return origAddEventListener(type, wrappedListener, options);
          }
          return origAddEventListener(type, listener, options);
        };
        return pc;
      };
      WrappedPeerConnection.prototype = OrigPeerConnection.prototype;
      (window as any).RTCPeerConnection = WrappedPeerConnection;
      (window as any).webkitRTCPeerConnection = WrappedPeerConnection;
    }

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
      const imageData = origGetImageData.call(this, x, y, w, h);
      if (imageData?.data && imageData.data.length > 4) {
        imageData.data[0] = (imageData.data[0] + (prof.canvasSeed % 3)) % 256;
      }
      return imageData;
    };
  }, profile);
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an authentic clean Windows 11 Desktop frame without the intrusive "Active AppOnFly Desktop" window banner
 */
export function generateSimulatedAppOnFlyFrame(
  typedBuffer: string = '',
  clickCoord?: { x: number; y: number },
  ip: string = '118.189.44.201',
  w: number = 1280,
  h: number = 720,
  inputActive: boolean = false
): string {
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const safeTyped = escapeXml(typedBuffer.slice(-75));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="winBloomBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#051937"/>
        <stop offset="35%" stop-color="#004d7a"/>
        <stop offset="70%" stop-color="#008793"/>
        <stop offset="100%" stop-color="#001830"/>
      </linearGradient>
      <linearGradient id="taskbarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#141c2b" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#0a0e17" stop-opacity="0.98"/>
      </linearGradient>
      <filter id="bloomGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="60" result="blur" />
      </filter>
    </defs>

    <!-- Clean Windows 11 Bloom Wallpaper -->
    <rect width="${w}" height="${h}" fill="url(#winBloomBg)" />
    <circle cx="${w * 0.5}" cy="${h * 0.45}" r="260" fill="#00b4d8" opacity="0.22" filter="url(#bloomGlow)"/>
    <circle cx="${w * 0.55}" cy="${h * 0.38}" r="190" fill="#90e0ef" opacity="0.18" filter="url(#bloomGlow)"/>
    <circle cx="${w * 0.45}" cy="${h * 0.52}" r="170" fill="#03045e" opacity="0.35" filter="url(#bloomGlow)"/>

    <!-- Desktop Icons (Left aligned, authentic Windows style) -->
    <g transform="translate(24, 28)">
      <!-- This PC -->
      <g>
        <rect x="0" y="0" width="72" height="74" rx="8" fill="rgba(255,255,255,0.04)"/>
        <path d="M 22,18 h 28 v 22 h -28 Z M 30,40 v 6 h 12 v -6" stroke="#38bdf8" stroke-width="2.2" fill="none"/>
        <text x="36" y="62" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" text-anchor="middle">This PC</text>
      </g>

      <!-- Google Chrome -->
      <g transform="translate(0, 88)">
        <rect x="0" y="0" width="72" height="74" rx="8" fill="rgba(255,255,255,0.04)"/>
        <circle cx="36" cy="27" r="14" fill="none" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="36" cy="27" r="6" fill="#38bdf8"/>
        <text x="36" y="62" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" text-anchor="middle">Chrome</text>
      </g>

      <!-- Edge Browser -->
      <g transform="translate(0, 176)">
        <rect x="0" y="0" width="72" height="74" rx="8" fill="rgba(255,255,255,0.04)"/>
        <circle cx="36" cy="27" r="13" fill="#0284c7"/>
        <path d="M 27,27 Q 36,15 45,27 Q 36,37 27,27" fill="#38bdf8"/>
        <text x="36" y="62" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" text-anchor="middle">Edge</text>
      </g>

      <!-- Recycle Bin -->
      <g transform="translate(0, 264)">
        <rect x="0" y="0" width="72" height="74" rx="8" fill="rgba(255,255,255,0.04)"/>
        <path d="M 25,20 h 22 l -3,20 h -16 Z M 23,17 h 26" stroke="#94a3b8" stroke-width="2" fill="none"/>
        <text x="36" y="62" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" text-anchor="middle">Recycle Bin</text>
      </g>
    </g>

    <!-- Browser / Search Window (When user types or clicks address bar) -->
    ${
      safeTyped || inputActive
        ? `<g transform="translate(140, 48)">
            <rect width="${w - 200}" height="48" rx="10" fill="#0f172a" stroke="${inputActive ? '#38bdf8' : '#334155'}" stroke-width="${inputActive ? '2' : '1'}"/>
            <text x="24" y="30" fill="${inputActive ? '#38bdf8' : '#e2e8f0'}" font-family="monospace" font-size="14">${
              safeTyped ? safeTyped + (inputActive ? '|' : '') : '| Type here...'
            }</text>
          </g>`
        : ''
    }

    <!-- Click Ripple Coordinate Marker -->
    ${
      clickCoord
        ? `<circle cx="${clickCoord.x}" cy="${clickCoord.y}" r="15" fill="rgba(56, 189, 248, 0.3)" stroke="#38bdf8" stroke-width="2"/>
           <circle cx="${clickCoord.x}" cy="${clickCoord.y}" r="3.5" fill="#38bdf8"/>`
        : ''
    }

    <!-- Windows 11 Center-Docked Taskbar -->
    <rect x="0" y="${h - 48}" width="${w}" height="48" fill="url(#taskbarGrad)" />

    <!-- Center Taskbar Icons -->
    <g transform="translate(${w / 2 - 120}, ${h - 38})">
      <!-- Windows Start Logo -->
      <rect x="0" y="0" width="28" height="28" rx="5" fill="#0284c7"/>
      <g transform="translate(6, 6)">
        <rect x="0" y="0" width="7" height="7" fill="#fff"/>
        <rect x="9" y="0" width="7" height="7" fill="#fff"/>
        <rect x="0" y="9" width="7" height="7" fill="#fff"/>
        <rect x="9" y="9" width="7" height="7" fill="#fff"/>
      </g>

      <!-- Taskbar Search Icon -->
      <rect x="36" y="0" width="28" height="28" rx="5" fill="rgba(255,255,255,0.06)"/>
      <circle cx="49" cy="13" r="5" fill="none" stroke="#38bdf8" stroke-width="2"/>
      <line x1="53" y1="17" x2="57" y2="21" stroke="#38bdf8" stroke-width="2"/>

      <!-- Task View Icon -->
      <rect x="72" y="0" width="28" height="28" rx="5" fill="rgba(255,255,255,0.06)"/>
      <rect x="78" y="7" width="8" height="14" rx="2" fill="#64748b"/>
      <rect x="88" y="7" width="8" height="14" rx="2" fill="#94a3b8"/>

      <!-- File Explorer Icon -->
      <rect x="108" y="0" width="28" height="28" rx="5" fill="rgba(255,255,255,0.06)"/>
      <path d="M 114,8 h 6 l 3,3 h 7 v 10 h -16 Z" fill="#f59e0b"/>

      <!-- Chrome Icon -->
      <rect x="144" y="0" width="28" height="28" rx="5" fill="rgba(255,255,255,0.06)"/>
      <circle cx="158" cy="14" r="7" fill="none" stroke="#ef4444" stroke-width="2"/>
      <circle cx="158" cy="14" r="3" fill="#3b82f6"/>

      <!-- Store Icon -->
      <rect x="180" y="0" width="28" height="28" rx="5" fill="rgba(255,255,255,0.06)"/>
      <rect x="186" y="9" width="16" height="13" rx="2" fill="#0284c7"/>
    </g>

    <!-- Taskbar System Tray & Clock (Right aligned) -->
    <g transform="translate(${w - 150}, ${h - 38})">
      <text x="136" y="14" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="500" text-anchor="end">${timeStr}</text>
      <text x="136" y="26" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" text-anchor="end">${dateStr}</text>
    </g>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
