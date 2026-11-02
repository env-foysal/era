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
