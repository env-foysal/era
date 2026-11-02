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
  updatedBy: string;
  updatedAt?: any;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
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
