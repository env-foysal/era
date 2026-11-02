# Security Specification & Hardened Audit Plan

## 1. Data Invariants
1. **Admin Exclusivity (`/config/{configId}` & `/secrets/{secretId}`)**: Only authenticated users with `email_verified == true` and an email matching the designated admin (`fa9311671@gmail.com` or bootstrapped admin `foysal0cx@gmail.com`) can create, update, or delete documents in `/config/{configId}` and `/secrets/{secretId}`.
2. **Secret Isolation (`/secrets/{secretId}`)**: Telegram Bot Tokens stored in `/secrets/{secretId}` are strictly confidential and can only be read (`get`) by verified admins (`isAdmin()`). Non-admin and unauthenticated requests are strictly denied.
3. **Public Config Read Boundary (`/config/{configId}`)**: Only single-document `get` with a valid `isValidId(configId)` is permitted on `/config/{configId}` so the Telegram Mini App can load Monetag ad configuration, direct links, and the public channel username. Blanket `list` queries are forbidden.
4. **Strict Schema & Volumetric Limits**:
   - `monetagCode`: string, `size() <= 5000`
   - `directLinks`: list, `size() <= 20`, if non-empty `directLinks[0] is string && directLinks[0].size() <= 500`
   - `dailyAdLimit`: int/number, `>= 0 && <= 100`
   - `telegramChannel`: string, `size() <= 200`
   - `requireChannelJoin`: bool
   - `targetUrl`: string, `size() <= 500`
   - `botToken`: string, `size() <= 300`
   - `updatedBy`: string, `size() <= 200` and must match `request.auth.token.email`
   - `updatedAt`: timestamp, must equal `request.time`

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Admin Email Spoof**: `{ updatedBy: "fa9311671@gmail.com", email_verified: false }` -> `PERMISSION_DENIED`
2. **Non-Admin Authenticated Write**: `{ auth: { email: "attacker@gmail.com", email_verified: true } }` writing to `/config/app_settings` -> `PERMISSION_DENIED`
3. **Ghost/Shadow Field Injection on Create**: Adding `isSuperAdmin: true` to `/config/app_settings` -> `PERMISSION_DENIED`
4. **Ghost/Shadow Field Injection on Update**: Updating `/config/app_settings` with `extraField: "hack"` -> `PERMISSION_DENIED`
5. **Value Poisoning (Oversized String)**: `monetagCode` with 10,000 characters -> `PERMISSION_DENIED`
6. **Array Flooding Attack**: `directLinks` with 50 items (exceeding max 20) -> `PERMISSION_DENIED`
7. **Array Element Type Poisoning**: `directLinks: [12345]` (non-string first element) -> `PERMISSION_DENIED`
8. **Timestamp Forgery**: Setting `updatedAt` to a past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`
9. **Identity Spoofing in `updatedBy`**: Admin authenticated as `fa9311671@gmail.com` setting `updatedBy: "someone_else@gmail.com"` -> `PERMISSION_DENIED`
10. **Unauthorized Secret Read**: Regular user or unauthenticated user attempting `get` on `/secrets/telegram_bot` -> `PERMISSION_DENIED`
11. **ID Poisoning Attack**: Document ID with >128 chars or special characters -> `PERMISSION_DENIED`
12. **Blanket Collection Listing**: Executing `list` query on `/config` or `/secrets` -> `PERMISSION_DENIED`
