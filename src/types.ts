export type BrowserMode = 'real-puppeteer' | 'simulated-engine';

export type TouchMode = 'touch' | 'trackpad';

export interface InputBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  isMobile: boolean;
  label: string;
}

export interface IpInfo {
  ip: string;
  isp: string;
  country: string;
  timezone: string;
  lastRotatedAt: number;
  nextRotationAt: number;
  rotationIntervalMinutes: number;
}

export interface BrowserStatus {
  status: 'idle' | 'starting' | 'running' | 'error';
  mode: BrowserMode;
  url: string;
  title: string;
  viewport: { width: number; height: number; isMobile: boolean };
  hasBrowser: boolean;
  activeClients: number;
  vercelReady: boolean;
  targetUrl: string;
  ip?: string;
  isp?: string;
  country?: string;
  nextRotationAt?: number;
}

export interface ActionPayload {
  type: 'click' | 'tap' | 'dblclick' | 'rightclick' | 'type' | 'keycombo' | 'scroll' | 'navigate';
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  text?: string;
  key?: string;
  keys?: string[];
  deltaX?: number;
  deltaY?: number;
  url?: string;
}

export interface TouchRipple {
  id: number;
  x: number;
  y: number;
}

export interface AppSettings {
  monetagCode: string;
  directLinks: string[];
  dailyAdLimit: number;
  telegramChannel: string;
  botToken: string;
  requireChannelJoin: boolean;
  targetUrl: string;
  enableIpRotation: boolean;
  useUserOwnIp: boolean;
  updatedBy: string;
  updatedAt?: any;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        version?: string;
        isVersionAtLeast?: (version: string) => boolean;
        ready: () => void;
        expand: () => void;
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
        CloudStorage?: {
          setItem: (key: string, value: string, callback?: (err: Error | null, success: boolean) => void) => any;
          getItem: (key: string, callback: (err: Error | null, value: string | null) => void) => any;
          getItems: (keys: string[], callback: (err: Error | null, values: Record<string, string | null>) => void) => any;
          removeItem: (key: string, callback?: (err: Error | null, success: boolean) => void) => any;
          removeItems: (keys: string[], callback?: (err: Error | null, success: boolean) => void) => any;
          getKeys: (callback: (err: Error | null, keys: string[]) => void) => any;
        };
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            username?: string;
          };
        };
      };
    };
  }
}
