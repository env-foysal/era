import type { Page } from 'puppeteer-core';

export const IP_ROTATION_INTERVAL_MS = 20.5 * 60 * 1000;

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

const RESIDENTIAL_ISP_POOLS = [
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
    firstOctets: [86, 81, 109],
    isp: 'BT Broadband Residential',
    country: 'GB',
    timezone: 'Europe/London',
    language: 'en-GB,en-US;q=0.9,en;q=0.8',
  },
  {
    firstOctets: [84, 91, 79],
    isp: 'Deutsche Telekom AG',
    country: 'DE',
    timezone: 'Europe/Berlin',
    language: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    firstOctets: [70, 142, 174],
    isp: 'Bell Canada Residential',
    country: 'CA',
    timezone: 'America/Toronto',
    language: 'en-CA,en-US;q=0.9,en;q=0.8',
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
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });

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

export function generateSimulatedAppOnFlyFrame(
  typedBuffer: string = '',
  clickCoord?: { x: number; y: number },
  ip: string = '71.158.56.131',
  w: number = 1280,
  h: number = 720,
  inputActive: boolean = false
): string {
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  const safeTyped = escapeXml(typedBuffer.slice(-65));

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
      <text x="72" y="24" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" font-weight="600">AppOnFly Windows 11 Cloud Session — IP: ${ip}</text>

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
      <text x="${(w - 170) / 2}" y="228" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">Landscape 16:9 HD • Keyboard opens on input fields • Auto IP rotation every 20.5m</text>

      <rect x="${(w - 170) / 2 - 150}" y="260" width="300" height="44" rx="8" fill="#0284c7"/>
      <text x="${(w - 170) / 2}" y="287" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Session IP: ${ip}</text>
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

