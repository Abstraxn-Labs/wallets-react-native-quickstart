# MyAbstraxnApp — Abstraxn React Native SDK demo

This repository is a **reference React Native app** that shows how to integrate the **Abstraxn Signer SDK** (`@abstraxn/signer-react-native`) in a real mobile UI: email onboarding, Google / X (Twitter) / Discord OAuth, passkey sign-in and sign-up, and transaction signing components.

Use it as a starting point or as a companion while you build your own app.

## What this demo covers

- **`AbstraxnProvider`** — SDK initialization and configuration
- **`useAbstraxnWallet`** — onboarding, OAuth URL helpers, callbacks, and passkey flows via `wallet`
- **OAuth** — opening provider URLs and completing redirects (including deep-link style handling)
- **Passkeys** — login and signup patterns aligned with the SDK
- **Signing** — `SignTransactionButton` / `SignAndSendTransactionButton` usage

Implementation lives mainly in **`App.js`**. The sections below describe **what this repo actually does** so you can map UI behavior to SDK calls.

### Project layout

| File | Role |
| ---- | ---- |
| **`index.js`** | Imports `react-native-get-random-values` **first** so `crypto.getRandomValues` exists before other code (required for the signing stack / viem-style usage). |
| **`App.js`** | `AbstraxnProvider` at the root, all screens and auth logic in `WalletSection`. |

### 1. Root: `AbstraxnProvider`

The default export wraps the app in **`AbstraxnProvider`** with a `config` object:

- **`apiKey`** — Your Abstraxn API key (declared as a constant at the top of `App.js`; replace with your own).
- **`autoConnect`** — `true` so a returning user can restore a session when appropriate.
- **`rpId`** — Relying Party ID for WebAuthn / passkeys (must match your Abstraxn passkey configuration).

`WalletSection` is the child that calls **`useAbstraxnWallet()`** and renders either the sign-in UI or the connected wallet UI.

### 2. Hook: `useAbstraxnWallet()`

`WalletSection` destructures these from the SDK hook:

| API | How this app uses it |
| --- | -------------------- |
| `isConnected`, `address`, `loading`, `disconnecting` | Drive “signed in” vs sign-in screen; show wallet address; disable actions while loading. |
| `disconnect` | “Log out” clears the session and resets local OAuth dedupe state so the next login can run cleanly. |
| `wallet` | Passkey flows: `wallet.loginWithPasskey()`, `wallet.signupWithPasskey({ organizationName: 'MyAbstraxnApp' })`. |
| `showOnboarding` | Bound to the email row — opens the SDK email / onboarding flow. |
| `getGoogleAuthUrl`, `getDiscordAuthUrl`, `getTwitterAuthUrl` | Each social button asks the SDK for the provider URL, passing the app’s **OAuth redirect scheme** (same constant used in native URL scheme config). |
| `handleGoogleCallback`, `handleDiscordCallback`, `handleTwitterCallback` | Called when the redirect URL contains **`code` and `state`** (authorization-code flow); the SDK exchanges them with the backend. |
| `completeOAuthFromDeepLink` | Used when the backend redirects to the custom scheme with **`success=true`** and token-style params (`accessToken`, `refreshToken`, `user`, optional `turnkeyPublicKey`). |
| `completeOAuthReturnFromUrl` | Used for another success path that completes OAuth by parsing the full return URL (e.g. web-parity / `loginCode`-style flows). |

### 3. OAuth: open browser → handle redirect URL

This app does **not** stop at “get URL and open it.” It implements a full mobile loop:

1. **Open the provider** — Google and Discord use **`react-native-inappbrowser-reborn`** when available (in-app browser); X (Twitter) uses **`Linking.openURL`** to the system browser (fewer fragile embedded-session issues on some devices).
2. **Listen for returns** — `Linking.addEventListener('url', …)` (and `Linking.getInitialURL()` for cold start) inspect incoming URLs.
3. **Filter** — Only URLs that match the app’s custom scheme or known HTTPS callback paths are handled (see `isOAuthRedirectUrl` and path constants near the top of `App.js`).
4. **Dismiss in-app browser** — When the URL uses the custom scheme, **`InAppBrowser.close()`** runs so the Safari / Chrome custom tab does not stay on screen after return.
5. **Complete sign-in with the SDK** — Depending on what the backend puts in the URL:
   - **Token bundle** → `completeOAuthFromDeepLink({ accessToken, refreshToken, user, turnkeyPublicKey })`
   - **Alternate URL completion** → `completeOAuthReturnFromUrl(url, provider)`
   - **Code + state** → `handleGoogleCallback` / `handleDiscordCallback` / `handleTwitterCallback` (with special cases: e.g. opening certain HTTPS callback URLs again so the server can finish and redirect to the app).
6. **Dedupe** — Authorization codes are **single-use**. A `useRef` tracks the last processed callback so the same code is not sent twice (avoids `invalid_grant` and duplicate sessions).

There is also a **Twitter fallback** (`buildOAuthFallbackUrl`) if the initial `getTwitterAuthUrl` request fails on some Android network edge cases.

### 4. Passkeys

- **Sign up** — `wallet.signupWithPasskey({ organizationName: 'MyAbstraxnApp' })` with a small retry path for flaky native errors.
- **Sign in** — `wallet.loginWithPasskey()` after a short `requestAnimationFrame` delay (helps reliability on Android).

The **“Test Passkey.get”** control is **not** an SDK API: it calls **`react-native-passkey`**’s `Passkey.get` with a random challenge to verify native passkey / WebAuthn behavior on a device (debugging aid).

### 5. After sign-in: signing components

When `isConnected` is true, the app shows:

- **`SignTransactionButton`** — SDK component for signing (styling passed via `style` / `textStyle`).
- **`SignAndSendTransactionButton`** — Example **Polygon Amoy** `rpcUrl`, `chainId`, and `txParams` (sends a zero-value transaction to a demo `to` address). Replace with your chain and transaction shape for real use.

### 6. Mental model

```
AbstraxnProvider(config)
  └── WalletSection
        useAbstraxnWallet()  →  UI buttons call showOnboarding / get*AuthUrl / wallet.* / handle*Callback / completeOAuth*
        Linking 'url' events  →  finish OAuth with completeOAuth* or handle*Callback
        isConnected  →  SignTransactionButton, SignAndSendTransactionButton, disconnect
```

For generic integration patterns (button-to-method mapping, loading states, production checklist), keep **`SDK_FRONTEND_GUIDE.md`** open alongside **`App.js`**.

## Requirements

- **Node.js** ≥ 22.11 (see `package.json` → `engines`)
- **React Native** toolchain for [iOS](https://reactnative.dev/docs/environment-setup?platform=ios) and [Android](https://reactnative.dev/docs/environment-setup?platform=android) (Xcode / Android Studio as usual)

## Quick start

**Abstraxn API key (required):** In **`App.js`**, set **`APP_API_KEY`** to your Abstraxn API key from your Abstraxn / project dashboard — replace the placeholder `YOUR_ABSTRAXN_API_KEY`. Without a valid key, sign-in and SDK calls will not work.

```bash
cd MyAbstraxnApp
npm install
```

**iOS** (first time or after native dependency changes):

```bash
cd ios && pod install && cd ..
```

**Run:**

```bash
npm start
# in another terminal
npm run ios
# or
npm run android
```

## Install the SDK in your own project

Published package:

```bash
npm install @abstraxn/signer-react-native
```

If this checkout uses a **local** `file:` dependency in `package.json`, adjust it to match your layout or switch to the npm package above.

## Configuration (before you ship)

1. **API key** — Set your Abstraxn API key in the app config (this demo uses constants near the top of `App.js`). Replace any placeholder with your own key.
2. **Passkeys** — Set **`rpId`** to the Relying Party ID that matches your Abstraxn / passkey setup (see `SDK_FRONTEND_GUIDE.md`).
3. **OAuth redirects** — Align your **redirect URL scheme** with your app’s deep linking and your Abstraxn dashboard settings (this demo uses a custom scheme constant in `App.js`).

Do **not** commit production secrets to a public repository. Treat API keys like passwords.

## Sharing this repo publicly (review checklist)

This section summarizes what was checked for a **public** demo repo.

| Topic | Status / note |
| ----- | --------------- |
| **API key in source** | The app uses the placeholder `YOUR_ABSTRAXN_API_KEY` in `App.js`. **Replace it locally** to run the app; **never** commit a real key. If an old key was ever committed, **rotate it** in the Abstraxn dashboard. |
| **`.env` files** | `.gitignore` ignores `.env` and `.env.*` so local secrets are not committed. See [`.env.example`](./.env.example) if you add env-based loading later. |
| **OAuth / debug logging** | `App.js` logs redirect URLs and OAuth debug lines (`[OAuth]`, `[Passkey.get test]`). Fine for a sample; for production, strip or gate behind `__DEV__` so tokens and URLs are not logged. |
| **`package.json` SDK path** | A **`file:../abstraxn-sdks/...`** dependency only works inside your monorepo. Public clones should use **`npm install @abstraxn/signer-react-native`** (and may need a simpler `metro.config.js` than the monorepo version). |
| **Android debug signing** | Default debug keystore passwords in Gradle are the usual React Native **`android`** values — not production signing. |
| **Demo transaction** | Amoy testnet RPC and a sample `to` address are **public test data**, not secrets. |

## Documentation

| Resource | Purpose |
| -------- | ------- |
| **[SDK_FRONTEND_GUIDE.md](./SDK_FRONTEND_GUIDE.md)** | Step-by-step integration guide: provider setup, button → SDK method mapping, loading/error patterns, production checklist |

## Scripts

| Script | Command |
| ------ | ------- |
| Start Metro | `npm start` |
| Run iOS | `npm run ios` |
| Run Android | `npm run android` |
| Lint | `npm run lint` |
| Tests | `npm test` |

---

**Abstraxn** — this demo is provided to illustrate SDK usage; adapt patterns, naming, and security practices to your product.
