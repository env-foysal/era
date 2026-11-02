# Vercel Hobby Plan & Serverless Chromium Optimization Plan

This plan ensures the Telegram Mini App, full-screen rotated remote desktop, Monetag/Direct Link ad engine, and 20.5-minute Stealth Residential IP rotation run reliably without 404 or timeout errors on the **Vercel Free / Hobby Plan**.

### User Review & Critical Decisions

> [!IMPORTANT]
> On Vercel's Free (Hobby) plan, Serverless Functions cannot hold infinite Server-Sent Events (SSE) streams open and require explicit URL rewrites so sub-routes resolve to the serverless handler.

- **Confirmed Decision 1 (Deployment Tier)**: Configured specifically for the **Vercel Free / Hobby Plan** (`1024 MB` memory allocation and compatible execution duration).
- **Confirmed Decision 2 (Browser & IP Strategy)**: Uses built-in `@sparticuz/chromium-min` paired with the automatic **20.5-minute Residential ISP Stealth IP & Fingerprint Rotation** engine.

---

### 1. Overview & Core Concept

- **What It Does**: Delivers an edge-to-edge, auto-rotated `16:9` full-screen Windows cloud desktop inside a Telegram Mini App, gated by live Telegram channel membership verification, monetized via 1-second delayed Monetag ads and one-click rotating Direct Links (capped at 5 times/day), and managed via a hidden Google-authenticated Admin Panel (`/admin-cp`).
- **Target Audience / Persona**: Mobile Telegram Mini App users accessing a desktop cloud session from portrait or landscape smartphones, and the administrator (`fa9311671@gmail.com`) managing monetization and channel gates.
- **Key Value**: Seamless compatibility across both persistent servers and Vercel Free/Hobby serverless functions with zero broken endpoints, instant click-to-frame updates, and anti-detection residential IP rotation every 20.5 minutes.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Pre-Launch & Ad Flow**: User opens the Telegram Mini App -> after 1 second, Monetag ad triggers automatically (if under the 5/day cap) -> user's first tap anywhere opens one rotating Direct Link once -> clicking **Launch Windows** verifies live Telegram channel membership via Bot Token before entering the desktop.
  2. **Rotated Full-Screen Desktop Flow**: On portrait phones, the viewport automatically rotates 90 degrees into a crisp `16:9` (`1280×720`) landscape canvas so icons and logos never squish. Tapping normal areas sends real-time clicks; tapping an input box automatically opens the phone's native keyboard.
  3. **Hidden Admin Control Flow (`/admin-cp`)**: Exclusively allows Google Sign-In for `fa9311671@gmail.com` to configure Telegram Bot Token, Channel Username, Monetag code, Direct Links, and inspect or trigger Residential IP rotation.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian dark-mode cloud workstation interface with zero-chrome distraction during desktop streaming.
  - *Color Palette & Mood*: Deep obsidian canvas (`bg-black` / `bg-slate-950`), elevated slate surfaces (`bg-slate-900`), and crisp sky-blue primary accents (`bg-sky-500`).
  - *Typography & Hierarchy*: High-contrast sans-serif UI labels paired with tabular monospace numerals for IP addresses and Telegram IDs.
  - *Component Styling & Layout*: 100% viewport locked (`100vw × 100vh`) during remote desktop sessions; clean single-column stacked cards with `rounded-2xl` geometry in the launch and admin views.
- **Interactive Feedback & Motion**: Instant ripple feedback on touch coordinates, immediate frame return on click/type actions, and smooth loading spinners during Telegram channel verification.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Serverless Routing & Action-Frame Piggybacking for Vercel Hobby**
  - *Chosen Approach*: Rewrite all `/api/browser/*` and `/api/telegram/*` paths to the unified serverless handler in Vercel configuration, and return the fresh JPEG frame + input-box focus state directly inside every click/type response alongside an adaptive non-overlapping snapshot poller when SSE is unavailable on Vercel.
  - *Why*: Eliminates 404 route mismatches on Vercel and cuts latency in half by returning the updated screen frame in the same HTTP response as the user's click or keystroke.
  - *Alternatives Considered*: Relying solely on long-lived SSE streams, which get terminated by Vercel Serverless timeouts.
- **Decision 2: Resilient Serverless Chromium Fallback**
  - *Chosen Approach*: Keep the warm Chromium instance cached across invocations on Vercel, and automatically fall back to the interactive high-definition desktop engine if a cold-start container is still unpacking Chromium.
  - *Why*: Guarantees the Mini App never shows a blank 500 error screen to end users on Vercel Free tier cold starts.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Telegram Mini App Client                         │
│                                                                         │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌────────────┐  │
│  │ Launch & Channel Gate│──▶│ Rotated 16:9 Desktop  │   │ /admin-cp  │  │
│  │ + 1s Monetag & Link  │   │ + Input-Only Keyboard │   │ (Gmail Auth│  │
│  └──────────┬───────────┘   └───────────┬───────────┘   └─────┬──────┘  │
└─────────────┼───────────────────────────┼─────────────────────┼─────────┘
              │                           │                     │
              ▼                           ▼                     ▼
┌─────────────────────────┐ ┌───────────────────────────┐ ┌───────────────┐
│   Vercel API Rewrites   │ │  Serverless Puppeteer     │ │   Firebase    │
│  /api/browser/*         │─▶  Core + @sparticuz/min    │ │  Firestore &  │
│  /api/telegram/*        │ │  + 20.5m Stealth IP Pool  │ │  Google Auth  │
└─────────────────────────┘ └───────────────────────────┘ └───────────────┘
```

- **Data Model & State**:
  - **Firestore (`config/app_settings`)**: Stores `monetagCode`, `directLinks` (up to 20 URLs), `dailyAdLimit` (default 5), `telegramChannel`, `botToken`, `requireChannelJoin`, `targetUrl`, `updatedBy`, and `updatedAt`.
  - **Serverless Warm State**: Caches the active `Browser`, `Page`, `ResidentialProfile` (ISP, IP, timezone, hardware fingerprint), `lastIpRotationTime` (20.5-minute cycle), and detected `inputRects`.
- **Interactive Component & State Mapping**:
  - **Unified Endpoint Resolution**: The serverless handler inspects both the request URL path (`status`, `snapshot`, `action`, `rotate-ip`, `check-member`) and request body so every client fetch works identically on local dev and Vercel Hobby deployment.
  - **Adaptive Stream/Poll Switcher**: Attempts SSE streaming first and seamlessly transitions to adaptive non-overlapping snapshot polling when running on Vercel Serverless.
  - **Click-to-Input Focus Sync**: Every tap evaluates coordinate collision against `inputRects` and the backend's `isInputFocused` response so the mobile keyboard opens strictly on input fields.
