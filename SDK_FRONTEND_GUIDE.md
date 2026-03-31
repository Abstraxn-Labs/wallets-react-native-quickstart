# Abstraxn SDK Frontend Guide (Simple + Practical)

This guide explains how to use the Abstraxn SDK in a frontend app with a sign-in screen like yours:

- Email button
- Google button
- X (Twitter) button
- Discord button
- Continue with Passkey button
- Sign up with Passkey link

The goal is simple: **each UI button should call one SDK action**.

---

## 1) What this SDK does (in plain words)

Think of the SDK as a secure login engine for your app.

- Your app shows the buttons
- The SDK handles authentication logic
- After successful login, your app gets a connected wallet/user session

So your frontend mostly needs to:
1. initialize the SDK,
2. wire each button to the right SDK method,
3. handle loading and errors nicely.

---

## 2) One-time setup

Install package:

```bash
npm install @abstraxn/signer-react-native
```

Wrap your app with `AbstraxnProvider`:

```tsx
import React from 'react';
import { AbstraxnProvider } from '@abstraxn/signer-react-native';
import MainScreen from './MainScreen';

export default function App() {
  const config = {
    apiKey: 'YOUR_ABSTRAXN_API_KEY',
    autoConnect: true,
    rpId: 'YOUR_PASSKEY_RP_ID', // example: signer.abstraxn.com
  };

  return (
    <AbstraxnProvider config={config}>
      <MainScreen />
    </AbstraxnProvider>
  );
}
```

---

## 3) SDK methods you will use in the screen

Inside your sign-in screen:

```tsx
const {
  showOnboarding,
  getGoogleAuthUrl,
  getDiscordAuthUrl,
  getTwitterAuthUrl,
  handleGoogleCallback,
  handleDiscordCallback,
  handleTwitterCallback,
  completeOAuthFromDeepLink,
  wallet,
} = useAbstraxnWallet();
```

`wallet` is used for passkeys:

- `wallet.loginWithPasskey()` -> sign in with existing passkey
- `wallet.signupWithPasskey()` -> create new passkey account

---

## 4) Button-to-SDK mapping (matches your UI)

### A) Email row ("Enter your email address")

**Button action:**

```tsx
onPress={showOnboarding}
```

This opens SDK onboarding/email flow.

---

### B) Google button

1. Ask SDK for Google auth URL:
   - `getGoogleAuthUrl(REDIRECT_SCHEME)`
2. Open that URL in browser/in-app browser
3. On redirect back, complete callback using:
   - `handleGoogleCallback(code, state)`
   - or `completeOAuthFromDeepLink(...)` if token-style redirect is used

---

### C) X (Twitter) button

Same idea as Google:

1. `getTwitterAuthUrl(REDIRECT_SCHEME)`
2. Open URL
3. On redirect, call `handleTwitterCallback(code, state)` (or deep-link completion path)

---

### D) Discord button

Same flow:

1. `getDiscordAuthUrl(REDIRECT_SCHEME)`
2. Open URL
3. On redirect, call `handleDiscordCallback(code, state)` (or deep-link completion path)

---

### E) "Continue with Passkey" button

Use this for users who already created a passkey before:

```tsx
await wallet.loginWithPasskey();
```

---

### F) "Sign up with passkey" link

Use this for first-time passkey registration:

```tsx
await wallet.signupWithPasskey({
  organizationName: 'MyAbstraxnApp',
});
```

---

## 5) Recommended screen behavior (important)

To keep UX smooth:

- Keep separate loading state per action (googleLoading, discordLoading, etc.)
- Disable buttons while an auth action is running
- Show readable error text (example: "Could not open sign-in")
- Prevent duplicate OAuth callback handling (OAuth code can be single-use)

This avoids:
- duplicate requests,
- invalid_grant errors,
- confusing taps during authentication.

---

## 6) Minimal mental model for non-technical readers

If you are not technical, think of the login flow like this:

1. User taps a sign-in option
2. App asks Abstraxn SDK to authenticate user
3. User proves identity (email/social/passkey)
4. SDK returns success
5. App now treats user as signed in and connected

That is all the screen is doing.

---

## 7) Production checklist

Before release, verify:

- Real `apiKey` is set (not placeholder)
- Correct `rpId` is set for passkeys
- Deep-link redirect scheme is configured in app
- OAuth callbacks are handled once per login attempt
- Errors are shown in human language

---

## 8) Quick copy-paste handlers (starter shape)

```tsx
const onGooglePress = async () => {
  setError(null);
  setGoogleLoading(true);
  try {
    const url = await getGoogleAuthUrl(OAUTH_REDIRECT_SCHEME);
    await Linking.openURL(url);
  } catch (e) {
    setError(e?.message ?? 'Could not open Google sign-in');
  } finally {
    setGoogleLoading(false);
  }
};

const onImportPasskeyPress = async () => {
  if (!wallet) return;
  setError(null);
  setPasskeyLoading(true);
  try {
    await wallet.loginWithPasskey();
  } catch (e) {
    setError(e?.message ?? 'Passkey sign-in failed');
  } finally {
    setPasskeyLoading(false);
  }
};
```

Use the same pattern for Discord, X, and passkey signup.

---

## 9) Final note

Your current UI pattern is already correct:

- UI button -> SDK method
- SDK handles auth details
- App updates loading/error/success states

This is the right architecture for a clean frontend integration.
