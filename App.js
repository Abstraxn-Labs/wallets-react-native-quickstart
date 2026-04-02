import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  Linking,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { ABSTRAXN_API_KEY } from '@env';
import { AbstraxnProvider, useAbstraxnWallet } from '@abstraxn/signer-react-native';
import { EmailOtpModal } from './src/EmailOtpModal';
import { DemoSignTransactionButton } from './components/DemoSignTransactionButton';
import { DemoSignAndSendTransactionButton } from './components/DemoSignAndSendTransactionButton';
import { parseEther } from 'viem';

// Redirect scheme for OAuth: backend redirects to myabstraxnapp://success=true&user=...
const OAUTH_REDIRECT_SCHEME = 'myabstraxnapp://';
const API_BASE_URL = 'https://signer.abstraxn.com';
const PASSKEY_RP_ID = 'signer.abstraxn.com';
/** Read Abstraxn API key from .env (fallback keeps local dev from crashing). */
const APP_API_KEY = ABSTRAXN_API_KEY || 'YOUR_ABSTRAXN_API_KEY';
const GOOGLE_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/google/callback';
const DISCORD_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/discord/callback';
const TWITTER_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/x/callback';

function buildOAuthFallbackUrl(providerPath) {
  const base = `${API_BASE_URL}${providerPath}`;
  const query = [
    `apikey=${encodeURIComponent(APP_API_KEY)}`,
    `origin=${encodeURIComponent(OAUTH_REDIRECT_SCHEME)}`,
  ].join('&');
  return `${base}?${query}`;
}

function normalizeProvider(value) {
  const v = String(value ?? '')
    .toLowerCase()
    .trim();
  if (v === 'x' || v === 'twitter') return 'twitter';
  if (v === 'discord') return 'discord';
  return 'google';
}

function detectOAuthProvider(url, params, fallbackProvider = 'google') {
  if (url.includes(TWITTER_CALLBACK_URL_PATH)) return 'twitter';
  if (url.includes(DISCORD_CALLBACK_URL_PATH)) return 'discord';
  if (url.includes(GOOGLE_CALLBACK_URL_PATH)) return 'google';
  const paramProvider =
    params?.get('provider') ??
    params?.get('authProvider') ??
    params?.get('authMethod') ??
    params?.get('method');
  if (paramProvider) return normalizeProvider(paramProvider);
  return normalizeProvider(fallbackProvider);
}

function getSearchParams(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Some OAuth providers return params in hash fragment on mobile redirects.
    if (parsed.searchParams?.toString()) return parsed.searchParams;
    if (parsed.hash) {
      const hashQuery = parsed.hash.replace(/^#\/?/, '');
      return hashQuery ? new URLSearchParams(hashQuery) : null;
    }
    return null;
  } catch {
    const qs = url.includes('?')
      ? url.split('?')[1]
      : url.replace(/^[^?]*\/\/?/, '');
    if (qs) return new URLSearchParams(qs);
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const hashQuery = url.slice(hashIdx + 1).replace(/^\/?/, '');
      return hashQuery ? new URLSearchParams(hashQuery) : null;
    }
    return null;
  }
}

function isOAuthRedirectUrl(url) {
  if (!url) return false;
  if (url.startsWith(OAUTH_REDIRECT_SCHEME)) return true;
  if (url.includes(GOOGLE_CALLBACK_URL_PATH)) return true;
  if (url.includes(DISCORD_CALLBACK_URL_PATH)) return true;
  if (url.includes(TWITTER_CALLBACK_URL_PATH)) return true;
  return false;
}

function WalletSection() {
  const {
    isConnected,
    address,
    whoami,
    signupWithPasskeyRN,
    loginWithPasskeyRN,
    disconnect,
    getGoogleAuthUrl,
    handleGoogleCallback,
    handleDiscordCallback,
    handleTwitterCallback,
    completeOAuthFromDeepLink,
    completeOAuthReturnFromUrl,
    getDiscordAuthUrl,
    getTwitterAuthUrl,
    loading,
    disconnecting,
  } = useAbstraxnWallet();
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [discordLoading, setDiscordLoading] = React.useState(false);
  const [twitterLoading, setTwitterLoading] = React.useState(false);
  const [oauthError, setOauthError] = React.useState(null);
  const [passkeyCreateLoading, setPasskeyCreateLoading] = React.useState(false);
  const [passkeyImportLoading, setPasskeyImportLoading] = React.useState(false);
  const [passkeyError, setPasskeyError] = React.useState(null);
  const [emailOnboardingVisible, setEmailOnboardingVisible] = React.useState(false);
  const [sendAmount, setSendAmount] = React.useState('0.001');
  // Dedupe: Google/Discord auth codes are single-use; prevent processing same code twice (avoids invalid_grant)
  const processedCallbackRef = React.useRef(null);
  const activeOAuthProviderRef = React.useRef('google');

  const { width: screenWidth } = useWindowDimensions();
  const cardMaxWidth = Math.min(400, screenWidth - 32);
  const paddingHoriz = screenWidth < 360 ? 16 : screenWidth < 600 ? 24 : 32;
  const socialSize = screenWidth < 360 ? 48 : 56;
  const iconSize = screenWidth < 360 ? 20 : 24;
  const titleFontSize = screenWidth < 360 ? 24 : 28;
  const setProviderLoading = (provider, value) => {
    if (provider === 'twitter') setTwitterLoading(value);
    else if (provider === 'discord') setDiscordLoading(value);
    else setGoogleLoading(value);
  };

  /** SFSafariViewController / Chrome tab stays open after myabstraxnapp:// resumes the app — dismiss it. */
  const dismissInAppOAuthBrowser = () => {
    try {
      InAppBrowser.close();
    } catch (e) {
      console.warn('[OAuth] InAppBrowser.close:', e?.message ?? e);
    }
  };

  React.useEffect(() => {
    const handleUrl = ({ url }) => {
      console.log('[OAuth] handleUrl received:', url ?? '(empty)');
      if (!url || !isOAuthRedirectUrl(url)) {
        if (url) console.log('[OAuth] Skipped: not an OAuth redirect URL');
        return;
      }
      const params = getSearchParams(url);
      if (!params) {
        console.log('[OAuth] Skipped: could not parse search params');
        return;
      }
      if (url.startsWith(OAUTH_REDIRECT_SCHEME)) {
        dismissInAppOAuthBrowser();
      }
      const paramKeys = [];
      params.forEach((_, key) => paramKeys.push(key));
      console.log('[OAuth] Query param keys:', paramKeys.join(', '));
      paramKeys.forEach(key => {
        const val = params.get(key);
        const preview =
          val && val.length > 40
            ? `${val.slice(0, 20)}...(${val.length})`
            : val;
        console.log(`[OAuth]   ${key}=`, preview);
      });

      // Backend redirect: myabstraxnapp://success=true&user=... (or with ?query)
      const success = params.get('success');
      const errorParam = params.get('error');
      const provider = detectOAuthProvider(
        url,
        params,
        activeOAuthProviderRef.current,
      );
      console.log('[OAuth] Detected provider:', provider);
      if (errorParam != null && errorParam !== '') {
        const decodedError = decodeURIComponent(errorParam);
        console.error('[OAuth] Error from backend:', decodedError);
        setOauthError(decodedError);
        return;
      }
      if (success === 'true') {
        const accessToken =
          params.get('accessToken') ?? params.get('access_token');
        const refreshToken =
          params.get('refreshToken') ?? params.get('refresh_token');
        const userParam = params.get('user') ?? params.get('userData');
        const turnkeyPublicKey = params.get('turnkeyPublicKey') ?? undefined;
        console.log(
          '[OAuth] Success branch: accessToken=',
          !!accessToken,
          'refreshToken=',
          !!refreshToken,
          'user=',
          !!userParam,
        );
        if (accessToken && refreshToken && userParam) {
          const dedupeKey = `success:${provider}:${accessToken.slice(0, 20)}`;
          if (processedCallbackRef.current === dedupeKey) {
            console.warn(
              '[OAuth] Skipping duplicate success callback (already processed)',
            );
            return;
          }
          processedCallbackRef.current = dedupeKey;
          setProviderLoading(provider, true);
          let userObj;
          try {
            userObj = JSON.parse(decodeURIComponent(userParam));
          } catch (e) {
            const errMsg = 'Invalid user data from sign-in';
            console.error('[OAuth]', errMsg, e);
            setOauthError(errMsg);
            setProviderLoading(provider, false);
            return;
          }
          console.log('[OAuth] Calling completeOAuthFromDeepLink');
          completeOAuthFromDeepLink({
            accessToken,
            refreshToken,
            user: userObj,
            turnkeyPublicKey,
          })
            .then(() => console.log('[OAuth] completeOAuthFromDeepLink done'))
            .catch(e => {
              const errMsg = e?.message ?? 'Sign-in failed';
              console.error(
                '[OAuth] completeOAuthFromDeepLink failed:',
                errMsg,
                e,
              );
              setOauthError(errMsg);
            })
            .finally(() => {
              setGoogleLoading(false);
              setDiscordLoading(false);
              setTwitterLoading(false);
            });
          return;
        }
        console.log(
          '[OAuth] Success=true but missing accessToken/refreshToken/user; falling back to code/state flow',
        );
        // Web-parity OAuth flow: success=true + loginCode in URL.
        setProviderLoading(provider, true);
        completeOAuthReturnFromUrl(url, provider)
          .then(user => {
            console.log('[OAuth] completeOAuthReturnFromUrl done:', !!user);
          })
          .catch(e => {
            const errMsg =
              e?.message ??
              `${provider} sign-in failed`.replace(/^./, c => c.toUpperCase());
            console.error(
              '[OAuth] completeOAuthReturnFromUrl failed:',
              errMsg,
              e,
            );
            setOauthError(errMsg);
          })
          .finally(() => {
            setGoogleLoading(false);
            setDiscordLoading(false);
            setTwitterLoading(false);
          });
        return;
      }

      // Fallback: backend redirected with code & state (app exchanges via API). Code is single-use.
      const code = params.get('code');
      const state = params.get('state');
      if (!code || !state) {
        console.log(
          '[OAuth] No success, no error, no code/state — redirect may be missing expected params',
        );
        return;
      }
      const dedupeKey = `code:${provider}:${code}:${state}`;
      if (processedCallbackRef.current === dedupeKey) {
        console.warn(
          '[OAuth] Skipping duplicate callback (authorization code already sent to backend; would cause invalid_grant)',
        );
        setDiscordLoading(false);
        setGoogleLoading(false);
        setTwitterLoading(false);
        return;
      }
      processedCallbackRef.current = dedupeKey;

      if (
        url.includes(TWITTER_CALLBACK_URL_PATH) &&
        url.startsWith('https://')
      ) {
        console.log(
          '[OAuth] Twitter callback URL received; opening so backend can redirect to app',
        );
        setTwitterLoading(true);
        Linking.openURL(url).catch(e => {
          console.error('[OAuth] Failed to open Twitter callback URL:', e);
          setOauthError(e?.message ?? 'Could not complete X (Twitter) sign-in');
          setTwitterLoading(false);
        });
        return;
      }

      if (
        url.includes(DISCORD_CALLBACK_URL_PATH) &&
        url.startsWith('https://')
      ) {
        // App received the callback URL (e.g. from in-app browser). Open it so backend can process and redirect to myabstraxnapp://
        console.log(
          '[OAuth] Discord callback URL received; opening so backend can redirect to app',
        );
        setDiscordLoading(true);
        Linking.openURL(url).catch(e => {
          console.error('[OAuth] Failed to open Discord callback URL:', e);
          setOauthError(e?.message ?? 'Could not complete Discord sign-in');
          setDiscordLoading(false);
        });
        return;
      }

      if (
        url.includes(GOOGLE_CALLBACK_URL_PATH) ||
        url.startsWith(OAUTH_REDIRECT_SCHEME)
      ) {
        console.log(
          `[OAuth] Sending fresh authorization code to backend for ${provider} (single-use)`,
        );
        setProviderLoading(provider, true);
        const callbackPromise =
          provider === 'twitter'
            ? handleTwitterCallback(code, state)
            : provider === 'discord'
            ? handleDiscordCallback(code, state)
            : handleGoogleCallback(code, state);
        callbackPromise
          .catch(e => {
            const label =
              provider === 'twitter'
                ? 'X (Twitter)'
                : provider === 'discord'
                ? 'Discord'
                : 'Google';
            const errMsg = e?.message ?? `${label} sign-in failed`;
            console.error(`[OAuth] handle${label}Callback failed:`, errMsg, e);
            setOauthError(errMsg);
          })
          .finally(() => setProviderLoading(provider, false));
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl) {
        console.log('[OAuth] getInitialURL:', initialUrl);
        handleUrl({ url: initialUrl });
      }
    });
    return () => subscription.remove();
  }, [
    handleGoogleCallback,
    handleDiscordCallback,
    handleTwitterCallback,
    completeOAuthFromDeepLink,
    completeOAuthReturnFromUrl,
  ]);

  const openAuthUrl = async (url, options = {}) => {
    if (await InAppBrowser.isAvailable()) {
      await InAppBrowser.open(url, {
        dismissButtonStyle: 'close',
        ...options,
      });
    } else {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('Cannot open auth URL');
      await Linking.openURL(url);
    }
  };

  const onGooglePress = async () => {
    activeOAuthProviderRef.current = 'google';
    setOauthError(null);
    try {
      setGoogleLoading(true);
      const googleAuthUrl = await getGoogleAuthUrl(OAUTH_REDIRECT_SCHEME);
      await openAuthUrl(googleAuthUrl, {
        toolbarColor: '#4285F4',
        showTitle: true,
      });
    } catch (e) {
      const msg = e?.message ?? 'Could not open sign-in';
      console.warn('Google sign-in error:', msg, e);
      setOauthError(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const onDiscordPress = async () => {
    activeOAuthProviderRef.current = 'discord';
    console.log('[OAuth] Discord button pressed');
    setOauthError(null);
    try {
      setDiscordLoading(true);
      const discordAuthUrl = await getDiscordAuthUrl(OAUTH_REDIRECT_SCHEME);
      console.log('[OAuth] Got Discord auth URL, opening...');
      if (!discordAuthUrl || !discordAuthUrl.startsWith('http')) {
        throw new Error('Invalid Discord sign-in URL');
      }
      await openAuthUrl(discordAuthUrl, {
        toolbarColor: '#5865F2',
        showTitle: true,
      });
    } catch (e) {
      const msg = e?.message ?? 'Could not open sign-in';
      console.warn('[OAuth] Discord sign-in error:', msg, e);
      setOauthError(msg);
      Alert.alert('Discord sign-in', msg);
    } finally {
      setDiscordLoading(false);
    }
  };

  const onTwitterPress = async () => {
    activeOAuthProviderRef.current = 'twitter';
    console.log('[OAuth] Twitter button pressed');
    setOauthError(null);
    try {
      setTwitterLoading(true);
      let twitterAuthUrl;
      try {
        twitterAuthUrl = await getTwitterAuthUrl(OAUTH_REDIRECT_SCHEME);
      } catch (e) {
        const msg = String(e?.message ?? '');
        const isNetworkInitError =
          msg.includes('Network request failed') ||
          msg.includes('Network error:');
        if (!isNetworkInitError) {
          throw e;
        }
        // Fallback for Android fetch redirect/network edge-cases on /login/x init.
        twitterAuthUrl = buildOAuthFallbackUrl('/login/x');
        console.warn(
          '[OAuth] getTwitterAuthUrl failed; using direct /login/x fallback URL',
          msg,
        );
      }
      console.log('[OAuth] Got X (Twitter) auth URL, opening...');
      if (!twitterAuthUrl || !twitterAuthUrl.startsWith('http')) {
        throw new Error('Invalid X (Twitter) sign-in URL');
      }
      try {
        const parsed = new URL(twitterAuthUrl);
        console.log(
          '[OAuth] X auth URL resolved:',
          parsed.origin,
          parsed.pathname,
        );
      } catch {
        console.log('[OAuth] X auth URL resolved (raw):', twitterAuthUrl);
      }
      // Prefer external browser for X login; embedded/custom-tab sessions can fail with generic twitter.com errors.
      const canOpenTwitter = await Linking.canOpenURL(twitterAuthUrl);
      if (!canOpenTwitter) {
        throw new Error('Cannot open X (Twitter) sign-in URL');
      }
      await Linking.openURL(twitterAuthUrl);
    } catch (e) {
      const msg = e?.message ?? 'Could not open sign-in';
      console.warn('[OAuth] Twitter sign-in error:', msg, e);
      setOauthError(msg);
      Alert.alert('X (Twitter) sign-in', msg);
    } finally {
      setTwitterLoading(false);
    }
  };

  const onCreatePasskeyPress = async () => {
    setPasskeyError(null);
    setPasskeyCreateLoading(true);
    try {
      // Let UI settle before native prompt (improves Android reliability).
      await new Promise(resolve => requestAnimationFrame(resolve));
      const shouldRetryOnce = e => {
        const m = `${e?.message ?? ''} ${e?.error ?? ''}`;
        return /no create options available|CreateCredentialNoCreateOption|NoActivity|temporarily unavailable|RequestFailed/i.test(
          m,
        );
      };
      let lastErr;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await signupWithPasskeyRN({
            // Leave userName undefined so SDK can generate a unique one (User_<timestamp>)
            organizationName: 'MyAbstraxnApp',
          });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === 1 && shouldRetryOnce(e)) {
            await new Promise(r => setTimeout(r, 300));
            continue;
          }
          throw e;
        }
      }
      if (lastErr) throw lastErr;
    } catch (e) {
      const msg = e?.message ?? 'Create wallet with passkey failed';
      setPasskeyError(msg);
    } finally {
      setPasskeyCreateLoading(false);
    }
  };

  const onImportPasskeyPress = async () => {
    setPasskeyError(null);
    setPasskeyImportLoading(true);
    try {
      // Let UI settle before native prompt (improves Android reliability).
      await new Promise(resolve => requestAnimationFrame(resolve));
      // Avoid JS timeouts on Android: Credential Manager can take longer and timeouts cause false failures.
      await loginWithPasskeyRN();
    } catch (e) {
      const code = e?.code ?? e?.error;
      const base = e?.message ?? 'Import wallet with passkey failed';
      const msg =
        code != null && String(code).trim() && String(code) !== String(base)
          ? `${base} (${String(code).trim()})`
          : base;
      if (__DEV__) {
        console.warn('[Passkey import] failed', {
          code,
          message: base,
          platform: Platform.OS,
        });
      }
      setPasskeyError(msg);
    } finally {
      setPasskeyImportLoading(false);
    }
  };

  const isSigningIn =
    googleLoading || discordLoading || twitterLoading || loading;

  const onLogoutPress = async () => {
    setPasskeyError(null);
    setOauthError(null);
    processedCallbackRef.current = null; // allow next OAuth redirect (e.g. Twitter/Discord re-login) to run completeOAuthFromDeepLink
    try {
      await disconnect();
    } catch (e) {
      console.warn('Logout failed', e);
    }
  };

  const providerLabel = whoami?.loginProvider
    ? String(whoami.loginProvider).charAt(0).toUpperCase() +
      String(whoami.loginProvider).slice(1)
    : 'Unknown';
  const evmAddress = whoami?.address ?? address ?? null;
  const solanaAddress = whoami?.solanaAddress ?? null;
  const sendAmountWei = React.useMemo(() => {
    if (!sendAmount || !String(sendAmount).trim()) return null;
    try {
      return parseEther(String(sendAmount).trim());
    } catch {
      return null;
    }
  }, [sendAmount]);
  const isSendAmountValid = sendAmountWei !== null;

  if (isConnected) {
    return (
      <View style={[styles.screen, styles.screenDark]}>
        <View style={styles.connectedCard}>
          <Text style={styles.homeTitle}>Welcome back</Text>
          <Text style={styles.connectedSubtitle}>
            Signed in via {providerLabel}
          </Text>

          <View style={styles.walletInfoBlock}>
            <Text style={styles.walletInfoLabel}>EVM Wallet</Text>
            <Text style={styles.walletInfoValue} selectable>
              {evmAddress ?? 'Not available'}
            </Text>
          </View>
          <View style={styles.walletInfoBlock}>
            <Text style={styles.walletInfoLabel}>Solana Wallet</Text>
            <Text style={styles.walletInfoValue} selectable>
              {solanaAddress ?? 'Not available'}
            </Text>
          </View>
          <View style={styles.providerPill}>
            <Text style={styles.providerPillText}>Provider: {providerLabel}</Text>
          </View>
        </View>
        <DemoSignTransactionButton
          rpcUrl="https://rpc-amoy.polygon.technology"
          style={styles.connectedPrimaryButton}
          textStyle={styles.connectedPrimaryButtonText}
        />
        <View style={styles.amountInputWrap}>
          <Text style={styles.amountInputLabel}>Amount to send (MATIC)</Text>
          <TextInput
            style={styles.amountInput}
            value={sendAmount}
            onChangeText={value => setSendAmount(value.replace(/[^0-9.]/g, ''))}
            placeholder="0.001"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!isSendAmountValid ? (
            <Text style={styles.amountInputError}>
              Enter a valid numeric amount (example: 0.01)
            </Text>
          ) : null}
        </View>
        <DemoSignAndSendTransactionButton
          rpcUrl="https://rpc-amoy.polygon.technology"
          label="Sign & Send Transaction"
          disabled={!isSendAmountValid}
          txParams={{
            to: '0x4ECba15A68637CAC139b0A1213a1075632D8b8c5',
            value: sendAmountWei ?? 0n,
            data: '0x',
            chainId: 80002,
          }}
          style={styles.connectedPrimaryButton}
          textStyle={styles.connectedPrimaryButtonText}
        />
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={onLogoutPress}
          disabled={disconnecting || loading}
          activeOpacity={0.7}
        >
          {disconnecting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Text style={styles.logoutButtonText}>Log out</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const socialDisabled =
    googleLoading ||
    discordLoading ||
    twitterLoading ||
    passkeyCreateLoading ||
    passkeyImportLoading;
  const passkeyDisabled =
    !signupWithPasskeyRN ||
    !loginWithPasskeyRN ||
    passkeyCreateLoading ||
    passkeyImportLoading ||
    socialDisabled;

  return (
    // <SafeAreaView style={{}}>
    <View
      style={[styles.screen, !isSigningIn && !isConnected && styles.screenDark]}
    >
      {!!(oauthError || passkeyError) && (
        <View
          style={[
            styles.errorBanner,
            Platform.OS === 'ios' && { paddingTop: 40 },
          ]}
        >
          {oauthError ? (
            <Text style={styles.errorText}>{oauthError}</Text>
          ) : null}
          {passkeyError ? (
            <Text style={styles.errorText}>{passkeyError}</Text>
          ) : null}
        </View>
      )}
      {isSigningIn ? (
        <View style={styles.signingIn}>
          <ActivityIndicator size="large" color="#5865F2" />
          <Text style={styles.signingInText}>Signing you in…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[
            styles.screenSignInScroll,
            {
              // maxWidth: cardMaxWidth,
              // paddingHorizontal: 10,
              // paddingVertical: 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.signInTitle, { fontSize: titleFontSize }]}>
            Sign In
          </Text>

          <Text style={styles.emailLabel}>Email Address</Text>
          <TouchableOpacity
            style={styles.emailInputRow}
            onPress={() => setEmailOnboardingVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.emailInputIcon}>✉</Text>
            <Text style={styles.emailInputPlaceholder}>
              Enter your email address
            </Text>
            <Text style={styles.emailInputArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialIconRow}>
            <TouchableOpacity
              style={[
                styles.socialIconButton,
                styles.socialGoogle,
                {
                  width: socialSize,
                  height: socialSize,
                  borderRadius: socialSize / 2,
                },
              ]}
              onPress={onGooglePress}
              disabled={socialDisabled}
              activeOpacity={0.7}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome5
                  name="google"
                  brand
                  size={iconSize}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.socialIconButton,
                styles.socialX,
                {
                  width: socialSize,
                  height: socialSize,
                  borderRadius: socialSize / 2,
                },
              ]}
              onPress={onTwitterPress}
              disabled={socialDisabled}
              activeOpacity={0.7}
            >
              {twitterLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome5
                  name="twitter"
                  brand
                  size={iconSize}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.socialIconButton,
                styles.socialDiscord,
                {
                  width: socialSize,
                  height: socialSize,
                  borderRadius: socialSize / 2,
                },
              ]}
              onPress={onDiscordPress}
              disabled={socialDisabled}
              activeOpacity={0.7}
            >
              {discordLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome5
                  name="discord"
                  brand
                  size={iconSize}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[
              styles.continuePasskeyButton,
              passkeyDisabled && styles.buttonDisabled,
            ]}
            onPress={onImportPasskeyPress}
            disabled={passkeyDisabled}
            activeOpacity={0.7}
          >
            {passkeyImportLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={styles.continuePasskeyContent}>
                <Text style={styles.continuePasskeyIcon}>🔑</Text>
                <Text style={styles.continuePasskeyText}>
                  Continue with Passkey
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Pressable
            style={styles.signUpPasskeyLinkWrap}
            onPress={onCreatePasskeyPress}
            disabled={passkeyDisabled}
          >
            {passkeyCreateLoading ? (
              <ActivityIndicator size="small" color="#9ca3af" />
            ) : (
              <Text style={styles.signUpPasskeyLink}>
                Sign up with passkey.
              </Text>
            )}
          </Pressable>

          <Text style={styles.footer}>Powered by abstraxn</Text>
        </ScrollView>
      )}
      <EmailOtpModal
        visible={emailOnboardingVisible}
        onClose={() => setEmailOnboardingVisible(false)}
      />
    </View>
    // </SafeAreaView>
  );
}

export default function App() {
  const config = {
    apiKey: APP_API_KEY,
    autoConnect: true,
    rpId: PASSKEY_RP_ID, // or your production rpId comment
  };

  return (
    <AbstraxnProvider config={config}>
      <View style={styles.container}>
        {/* <Text style={styles.title}>MyAbstraxnApp</Text> */}
        <WalletSection />
        <StatusBar barStyle="dark-content" />
      </View>
    </AbstraxnProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 32,
  },
  errorBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10000,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  screenDark: {
    backgroundColor: '#1a1a1a',
  },
  screenScroll: {
    flex: 1,
    width: '100%',
  },
  screenSignInScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    width: '100%',
  },
  signInTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 24,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f9fafb',
    marginBottom: 8,
    alignSelf: 'stretch',
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    alignSelf: 'stretch',
  },
  emailInputIcon: {
    fontSize: 18,
    color: '#9ca3af',
    marginRight: 12,
  },
  emailInputPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: '#9ca3af',
  },
  emailInputArrow: {
    fontSize: 18,
    color: '#9ca3af',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#4b5563',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  socialIconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  socialIconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialGoogle: {
    backgroundColor: '#4285F4',
  },
  socialX: {
    backgroundColor: '#000',
  },
  socialDiscord: {
    backgroundColor: '#5865F2',
  },
  socialIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  continuePasskeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  continuePasskeyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  continuePasskeyIcon: {
    fontSize: 18,
  },
  continuePasskeyText: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  signUpPasskeyLinkWrap: {
    marginTop: 16,
    paddingVertical: 8,
  },
  signUpPasskeyLink: {
    fontSize: 14,
    color: '#9ca3af',
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: '#6b7280',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  homeTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    color: '#f9fafb',
    textAlign: 'center',
  },
  connectedSubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 18,
    textAlign: 'center',
  },
  connectedCard: {
    width: '100%',
    backgroundColor: '#202634',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  walletInfoBlock: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    marginTop: 10,
  },
  walletInfoLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  walletInfoValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'left',
  },
  providerPill: {
    marginTop: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.5)',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  providerPillText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '600',
  },
  connectedPrimaryButton: {
    backgroundColor: '#374151',
    alignSelf: 'stretch',
    marginTop: 12,
    borderRadius: 12,
    minHeight: 48,
  },
  connectedPrimaryButtonText: {
    color: '#f9fafb',
    fontWeight: '600',
  },
  amountInputWrap: {
    width: '100%',
    marginTop: 12,
    marginBottom: 2,
  },
  amountInputLabel: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  amountInput: {
    alignSelf: 'stretch',
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#374151',
    color: '#f9fafb',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  amountInputError: {
    marginTop: 6,
    color: '#fca5a5',
    fontSize: 12,
  },
  signingIn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  signingInText: {
    fontSize: 16,
    color: '#9ca3af',
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  logoutButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
});
