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
  Modal,
  Image,
} from 'react-native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { ABSTRAXN_API_KEY } from '@env';
import {
  AbstraxnProvider,
  useAbstraxnWallet,
  useEnableMfa,
  useDisableMfa,
} from '@abstraxn/signer-react-native';
import { EmailOtpModal } from './src/EmailOtpModal';
import { DemoSignTransactionButton } from './components/DemoSignTransactionButton';
import { DemoSignAndSendTransactionButton } from './components/DemoSignAndSendTransactionButton';
import { normalizeError } from './src/utils/errorMessages';
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

/** Shorten long addresses for display; full value still copyable. */
function formatAddressShort(addr, head = 8, tail = 6) {
  if (!addr || typeof addr !== 'string') return '—';
  const s = addr.trim();
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function WalletSection() {
  const { verifySetupMfaWithSignRetry } = useEnableMfa();
  const { disableMfaWithSignRetry } = useDisableMfa();
  const {
    isConnected,
    address,
    whoami,
    signupWithPasskeyRN,
    loginWithPasskeyRN,
    connect,
    refreshWhoami,
    verifyMfa,
    getMfaStatus,
    enableMfa,
    verifySetupMfa,
    disableMfaWithSignedPayload,
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
  const [emailLoginValue, setEmailLoginValue] = React.useState('');
  const [emailLoginError, setEmailLoginError] = React.useState(null);
  const [mfaPromptVisible, setMfaPromptVisible] = React.useState(false);
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState(null);
  const [pendingAuthSource, setPendingAuthSource] = React.useState(null);
  const [mfaStatus, setMfaStatus] = React.useState(null);
  const [mfaStatusLoading, setMfaStatusLoading] = React.useState(false);
  const [mfaManageError, setMfaManageError] = React.useState(null);
  const [mfaSetupVisible, setMfaSetupVisible] = React.useState(false);
  const [mfaSetupCode, setMfaSetupCode] = React.useState('');
  const [mfaSetupLoading, setMfaSetupLoading] = React.useState(false);
  const [mfaSetupPayload, setMfaSetupPayload] = React.useState(null);
  const [mfaBackupCodesVisible, setMfaBackupCodesVisible] = React.useState(false);
  const [mfaBackupCodes, setMfaBackupCodes] = React.useState([]);
  const [mfaDisableVisible, setMfaDisableVisible] = React.useState(false);
  const [mfaDisableCode, setMfaDisableCode] = React.useState('');
  const [mfaDisableLoading, setMfaDisableLoading] = React.useState(false);
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

  const isMfaCodeValid = React.useMemo(() => {
    const normalized = mfaCode.trim().toUpperCase();
    return /^\d{6}$/.test(normalized) || /^[A-Z0-9]{8}$/.test(normalized);
  }, [mfaCode]);

  const finalizeAuthSession = React.useCallback(async () => {
    try {
      await connect();
    } catch {}
    try {
      await refreshWhoami();
    } catch {}
    setPendingAuthSource(null);
  }, [connect, refreshWhoami]);

  const openMfaPrompt = React.useCallback(source => {
    setPendingAuthSource(source);
    setMfaCode('');
    setMfaError(null);
    setMfaPromptVisible(true);
  }, []);

  const handleMfaVerify = React.useCallback(async () => {
    const normalized = mfaCode.trim().toUpperCase();
    if (!/^\d{6}$/.test(normalized) && !/^[A-Z0-9]{8}$/.test(normalized)) {
      setMfaError('Please enter a valid 6-digit code or 8-character backup code.');
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifyMfa(normalized);
      await finalizeAuthSession();
      setMfaPromptVisible(false);
      setMfaCode('');
    } catch (e) {
      setMfaError(
        normalizeError(e, {
          fallback: 'MFA verification failed. Please try again.',
          code: 'ERR_MFA_001',
        }),
      );
    } finally {
      setMfaLoading(false);
    }
  }, [mfaCode, verifyMfa, finalizeAuthSession]);

  const refreshMfaStatus = React.useCallback(async () => {
    setMfaStatusLoading(true);
    setMfaManageError(null);
    try {
      const status = await getMfaStatus();
      setMfaStatus(status);
    } catch (e) {
      setMfaManageError(
        normalizeError(e, {
          fallback: 'Failed to fetch MFA status.',
          code: 'ERR_MFA_002',
        }),
      );
    } finally {
      setMfaStatusLoading(false);
    }
  }, [getMfaStatus]);

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
      const mfaRequiredFromUrl = params.get('mfaRequired') === 'true';
      const provider = detectOAuthProvider(
        url,
        params,
        activeOAuthProviderRef.current,
      );
      console.log('[OAuth] Detected provider:', provider);
      if (errorParam != null && errorParam !== '') {
        const decodedError = decodeURIComponent(errorParam);
        console.error('[OAuth] Error from backend:', decodedError);
        setOauthError(
          normalizeError(decodedError, {
            fallback: 'Sign-in failed. Please try again.',
            code: 'ERR_AUTH_001',
          }),
        );
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
            setOauthError(
              normalizeError(e, {
                fallback: 'Sign-in failed. Please try again.',
                code: 'ERR_AUTH_001',
              }),
            );
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
            .then(async () => {
              console.log('[OAuth] completeOAuthFromDeepLink done');
              if (mfaRequiredFromUrl) {
                openMfaPrompt(`oauth:${provider}`);
                return;
              }
              await finalizeAuthSession();
            })
            .catch(e => {
              const errMsg = e?.message ?? 'Sign-in failed';
              console.error(
                '[OAuth] completeOAuthFromDeepLink failed:',
                errMsg,
                e,
              );
              setOauthError(
                normalizeError(e, {
                  fallback: 'Sign-in failed. Please try again.',
                  code: 'ERR_AUTH_001',
                }),
              );
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
          .then(async user => {
            console.log('[OAuth] completeOAuthReturnFromUrl done:', !!user);
            if (mfaRequiredFromUrl) {
              openMfaPrompt(`oauth:${provider}`);
              return;
            }
            await finalizeAuthSession();
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
            setOauthError(
              normalizeError(e, {
                fallback: 'Sign-in failed. Please try again.',
                code: 'ERR_AUTH_001',
              }),
            );
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
          setOauthError(
            normalizeError(e, {
              fallback: 'Sign-in failed. Please try again.',
              code: 'ERR_AUTH_001',
            }),
          );
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
          setOauthError(
            normalizeError(e, {
              fallback: 'Sign-in failed. Please try again.',
              code: 'ERR_AUTH_001',
            }),
          );
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
          .then(async () => {
            if (mfaRequiredFromUrl) {
              openMfaPrompt(`oauth:${provider}`);
              return;
            }
            await finalizeAuthSession();
          })
          .catch(e => {
            const label =
              provider === 'twitter'
                ? 'X (Twitter)'
                : provider === 'discord'
                ? 'Discord'
                : 'Google';
            const errMsg = e?.message ?? `${label} sign-in failed`;
            console.error(`[OAuth] handle${label}Callback failed:`, errMsg, e);
            setOauthError(
              normalizeError(e, {
                fallback: 'Sign-in failed. Please try again.',
                code: 'ERR_AUTH_001',
              }),
            );
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
    finalizeAuthSession,
    openMfaPrompt,
  ]);

  React.useEffect(() => {
    if (isConnected) {
      refreshMfaStatus();
    } else {
      setMfaStatus(null);
    }
  }, [isConnected, refreshMfaStatus]);

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
      setOauthError(
        normalizeError(e, {
          fallback: 'Could not open sign-in. Please try again.',
          code: 'ERR_AUTH_002',
        }),
      );
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
      const userMessage = normalizeError(e, {
        fallback: 'Could not open sign-in. Please try again.',
        code: 'ERR_AUTH_002',
      });
      setOauthError(userMessage);
      Alert.alert('Discord sign-in', userMessage);
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
      const userMessage = normalizeError(e, {
        fallback: 'Could not open sign-in. Please try again.',
        code: 'ERR_AUTH_002',
      });
      setOauthError(userMessage);
      Alert.alert('X (Twitter) sign-in', userMessage);
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
          const session = await signupWithPasskeyRN({
            // Leave userName undefined so SDK can generate a unique one (User_<timestamp>)
            organizationName: 'MyAbstraxnApp',
          });
          if (session?.mfaRequired) {
            openMfaPrompt('passkey-signup');
          } else {
            await finalizeAuthSession();
          }
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
      setPasskeyError(
        normalizeError(e, {
          fallback: 'Passkey setup failed. Please try again.',
          code: 'ERR_PASSKEY_001',
        }),
      );
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
      const session = await loginWithPasskeyRN();
      if (session?.mfaRequired) {
        openMfaPrompt('passkey-login');
      } else {
        await finalizeAuthSession();
      }
    } catch (e) {
      const code = e?.code ?? e?.error;
      const base = e?.message ?? 'Import wallet with passkey failed';
      if (__DEV__) {
        console.warn('[Passkey import] failed', {
          code,
          message: base,
          platform: Platform.OS,
        });
      }
      setPasskeyError(
        normalizeError(e, {
          fallback: 'Passkey sign-in failed. Please try again.',
          code: 'ERR_PASSKEY_002',
        }),
      );
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

  const onMfaSetupStart = async () => {
    setMfaManageError(null);
    setMfaSetupLoading(true);
    try {
      const payload = await enableMfa();
      setMfaSetupPayload(payload);
      setMfaSetupCode('');
      setMfaSetupVisible(true);
    } catch (e) {
      setMfaManageError(
        normalizeError(e, {
          fallback: 'Failed to start MFA setup.',
          code: 'ERR_MFA_003',
        }),
      );
    } finally {
      setMfaSetupLoading(false);
    }
  };

  const onMfaSetupVerify = async () => {
    if (mfaSetupCode.trim().length !== 6) {
      setMfaManageError('Please enter a 6-digit setup code.');
      return;
    }
    setMfaSetupLoading(true);
    setMfaManageError(null);
    try {
      const result = await verifySetupMfaWithSignRetry(
        mfaSetupCode.trim(),
        mfaSetupCode.trim(),
      );
      setMfaBackupCodes(result?.backupCodes ?? []);
      setMfaSetupVisible(false);
      setMfaBackupCodesVisible(true);
      setMfaSetupCode('');
      await refreshMfaStatus();
    } catch (e) {
      setMfaManageError(
        normalizeError(e, {
          fallback: 'Failed to verify MFA setup code.',
          code: 'ERR_MFA_004',
        }),
      );
    } finally {
      setMfaSetupLoading(false);
    }
  };

  const onMfaDisable = async () => {
    const normalized = mfaDisableCode.trim().toUpperCase();
    if (!/^\d{6}$/.test(normalized) && !/^[A-Z0-9]{8}$/.test(normalized)) {
      setMfaManageError('Enter a valid 6-digit code or 8-character backup code.');
      return;
    }
    setMfaDisableLoading(true);
    setMfaManageError(null);
    try {
      await verifyMfa(normalized);
      await disableMfaWithSignRetry(normalized);
      setMfaDisableVisible(false);
      setMfaDisableCode('');
      await refreshMfaStatus();
    } catch (e) {
      setMfaManageError(
        normalizeError(e, {
          fallback: 'Failed to disable MFA.',
          code: 'ERR_MFA_005',
        }),
      );
    } finally {
      setMfaDisableLoading(false);
    }
  };

  void verifySetupMfa;
  void disableMfaWithSignedPayload;

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
  const isInlineEmailValid = React.useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLoginValue.trim()),
    [emailLoginValue],
  );

  const handleInlineEmailContinue = React.useCallback(() => {
    if (!isInlineEmailValid) {
      setEmailLoginError('Enter a valid email address to continue.');
      return;
    }
    setEmailLoginError(null);
    setEmailOnboardingVisible(true);
  }, [isInlineEmailValid]);

  if (isConnected) {
    const copyAddress = (value, label) => {
      if (!value) return;
      Clipboard.setString(value);
      Alert.alert('Copied', `${label} copied to clipboard.`);
    };

    return (
      <SafeAreaView
        style={[styles.screenScroll, styles.screenDark]}
        edges={['top', 'left', 'right']}
      >
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.connectedScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.connectedHero}>
            <View style={styles.connectedAvatar}>
              <FontAwesome5 name="wallet" size={26} color="#a5b4fc" />
            </View>
            <Text style={styles.homeTitle}>Welcome back</Text>
            <Text style={styles.connectedSubtitle}>
              Signed in with {providerLabel}
            </Text>
            <View style={styles.providerPill}>
              <FontAwesome5 name="shield-alt" size={11} color="#86efac" />
              <Text style={styles.providerPillText}>{providerLabel}</Text>
            </View>
          </View>

          <Text style={styles.connectedSectionTitle}>Wallets</Text>
          <View style={styles.connectedCard}>
            <View style={styles.walletRow}>
              <View style={styles.walletRowIconWrap}>
                <FontAwesome5 name="ethereum" size={18} color="#627eea" brand />
              </View>
              <View style={styles.walletRowBody}>
                <Text style={styles.walletRowLabel}>Ethereum</Text>
                <Text style={styles.walletRowMono} selectable>
                  {evmAddress ? formatAddressShort(evmAddress) : 'Not available'}
                </Text>
              </View>
              {evmAddress ? (
                <TouchableOpacity
                  style={styles.walletRowCopy}
                  onPress={() => copyAddress(evmAddress, 'EVM address')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Copy EVM address"
                >
                  <FontAwesome5 name="copy" size={15} color="#8b949e" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.walletRowDivider} />
            <View style={styles.walletRow}>
              <View
                style={[styles.walletRowIconWrap, styles.walletRowIconSolana]}
              >
                <FontAwesome5 name="sun" size={17} color="#e879f9" />
              </View>
              <View style={styles.walletRowBody}>
                <Text style={styles.walletRowLabel}>Solana</Text>
                <Text style={styles.walletRowMono} selectable>
                  {solanaAddress
                    ? formatAddressShort(solanaAddress, 6, 6)
                    : 'Not available'}
                </Text>
              </View>
              {solanaAddress ? (
                <TouchableOpacity
                  style={styles.walletRowCopy}
                  onPress={() => copyAddress(solanaAddress, 'Solana address')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Copy Solana address"
                >
                  <FontAwesome5 name="copy" size={15} color="#8b949e" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <Text style={styles.connectedSectionTitle}>Security</Text>
          <View style={styles.connectedCard}>
            <View style={styles.mfaHeaderRow}>
              <Text style={styles.mfaHeaderTitle}>Multi-factor authentication</Text>
              {mfaStatusLoading ? (
                <View style={styles.mfaBadgeLoading}>
                  <ActivityIndicator size="small" color="#8b949e" />
                </View>
              ) : (
                <View
                  style={[
                    styles.mfaStatusBadge,
                    mfaStatus?.enabled
                      ? styles.mfaStatusBadgeOn
                      : styles.mfaStatusBadgeOff,
                  ]}
                >
                  <View
                    style={[
                      styles.mfaStatusDot,
                      mfaStatus?.enabled
                        ? styles.mfaStatusDotOn
                        : styles.mfaStatusDotOff,
                    ]}
                  />
                  <Text
                    style={[
                      styles.mfaStatusBadgeText,
                      mfaStatus?.enabled
                        ? styles.mfaStatusBadgeTextOn
                        : styles.mfaStatusBadgeTextOff,
                    ]}
                  >
                    {mfaStatus?.enabled ? 'On' : 'Off'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.mfaHint}>
              Add an extra layer of protection when signing transactions.
            </Text>
            <View style={styles.mfaActionRow}>
              <TouchableOpacity
                style={[
                  styles.mfaPrimaryButton,
                  (mfaSetupLoading ||
                    mfaDisableLoading ||
                    mfaStatus?.enabled) &&
                    styles.mfaPrimaryButtonDisabled,
                ]}
                onPress={onMfaSetupStart}
                disabled={
                  mfaSetupLoading || mfaDisableLoading || mfaStatus?.enabled
                }
              >
                {mfaSetupLoading ? (
                  <ActivityIndicator size="small" color="#0f172a" />
                ) : (
                  <Text style={styles.mfaPrimaryButtonText}>Set up MFA</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.mfaGhostButton,
                  (mfaDisableLoading ||
                    mfaSetupLoading ||
                    !mfaStatus?.enabled) &&
                    styles.mfaGhostButtonDisabled,
                ]}
                onPress={() => {
                  setMfaManageError(null);
                  setMfaDisableCode('');
                  setMfaDisableVisible(true);
                }}
                disabled={
                  mfaDisableLoading || mfaSetupLoading || !mfaStatus?.enabled
                }
              >
                <Text style={styles.mfaGhostButtonText}>Turn off</Text>
              </TouchableOpacity>
            </View>
            {mfaManageError ? (
              <Text style={styles.errorText}>{mfaManageError}</Text>
            ) : null}
          </View>

          <Text style={styles.connectedSectionTitle}>Try a transaction</Text>
          <Text style={styles.connectedSectionHint}>
            Demo on Polygon Amoy — sign locally or send MATIC.
          </Text>
          <View style={styles.connectedCard}>
            <DemoSignTransactionButton
              rpcUrl="https://rpc-amoy.polygon.technology"
              style={styles.connectedSecondaryButton}
              textStyle={styles.connectedSecondaryButtonText}
            />
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountInputLabel}>Amount (MATIC)</Text>
              <TextInput
                style={styles.amountInput}
                value={sendAmount}
                onChangeText={value =>
                  setSendAmount(value.replace(/[^0-9.]/g, ''))
                }
                placeholder="0.001"
                placeholderTextColor="#6e7681"
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!isSendAmountValid ? (
                <Text style={styles.amountInputError}>
                  Enter a valid amount (e.g. 0.01)
                </Text>
              ) : null}
            </View>
            <DemoSignAndSendTransactionButton
              rpcUrl="https://rpc-amoy.polygon.technology"
              label="Sign & send"
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
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={onLogoutPress}
            disabled={disconnecting || loading}
            activeOpacity={0.7}
          >
            {disconnecting ? (
              <ActivityIndicator size="small" color="#f87171" />
            ) : (
              <>
                <FontAwesome5
                  name="sign-out-alt"
                  size={15}
                  color="#f87171"
                  style={styles.logoutIcon}
                />
                <Text style={styles.logoutButtonText}>Log out</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
        <Modal
          visible={mfaSetupVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMfaSetupVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Setup MFA</Text>
              <Text style={styles.modalSubtitle}>Scan this QR in your authenticator app or use the secret.</Text>
              {!!mfaSetupPayload?.qrCode && (
                <Image
                  source={{ uri: mfaSetupPayload.qrCode }}
                  style={styles.mfaQrImage}
                  resizeMode="contain"
                />
              )}
              {!!mfaSetupPayload?.secret && (
                <Text style={styles.modalHint} selectable>Secret: {mfaSetupPayload.secret}</Text>
              )}
              <TextInput
                style={styles.modalInput}
                value={mfaSetupCode}
                onChangeText={v => setMfaSetupCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="Enter 6-digit setup code"
                placeholderTextColor="#9ca3af"
                editable={!mfaSetupLoading}
              />
              <TouchableOpacity
                style={[styles.modalPrimaryButton, (mfaSetupCode.trim().length !== 6 || mfaSetupLoading) && styles.buttonDisabled]}
                onPress={onMfaSetupVerify}
                disabled={mfaSetupCode.trim().length !== 6 || mfaSetupLoading}
              >
                {mfaSetupLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Verify setup</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setMfaSetupVisible(false)}
                disabled={mfaSetupLoading}
              >
                <Text style={styles.modalSecondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <Modal
          visible={mfaBackupCodesVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMfaBackupCodesVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Backup Codes</Text>
              <Text style={styles.modalSubtitle}>Save these codes. Each code can be used once.</Text>
              <Text style={styles.modalHint} selectable>
                {mfaBackupCodes.length ? mfaBackupCodes.join('\n') : 'No backup codes returned.'}
              </Text>
              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => setMfaBackupCodesVisible(false)}
              >
                <Text style={styles.modalPrimaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <Modal
          visible={mfaDisableVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMfaDisableVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Disable MFA</Text>
              <Text style={styles.modalSubtitle}>
                Enter MFA code to verify, then disable MFA for this account.
              </Text>
              <TextInput
                style={styles.modalInput}
                value={mfaDisableCode}
                onChangeText={v => {
                  setMfaDisableCode(v.toUpperCase());
                  setMfaManageError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!mfaDisableLoading}
                placeholder="123456 or ABCD1234"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                style={[styles.modalPrimaryButton, mfaDisableLoading && styles.buttonDisabled]}
                onPress={onMfaDisable}
                disabled={mfaDisableLoading}
              >
                {mfaDisableLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Verify & Disable</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setMfaDisableVisible(false)}
                disabled={mfaDisableLoading}
              >
                <Text style={styles.modalSecondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  const socialDisabled =
    googleLoading ||
    discordLoading ||
    twitterLoading ||
    passkeyCreateLoading ||
    passkeyImportLoading ||
    mfaLoading;
  const passkeyDisabled =
    !signupWithPasskeyRN ||
    !loginWithPasskeyRN ||
    passkeyCreateLoading ||
    passkeyImportLoading ||
    socialDisabled;

  return (
    <SafeAreaView
      style={[styles.screen, !isConnected && styles.screenDark]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      {!!(oauthError || passkeyError || mfaError || mfaManageError) && (
        <View
          style={[
            styles.errorBanner,
            Platform.OS === 'ios' && { paddingTop: 40 },
          ]}
        >
          {oauthError ? <Text style={styles.errorText}>{oauthError}</Text> : null}
          {passkeyError ? (
            <Text style={styles.errorText}>{passkeyError}</Text>
          ) : null}
          {mfaError ? <Text style={styles.errorText}>{mfaError}</Text> : null}
          {mfaManageError ? (
            <Text style={styles.errorText}>{mfaManageError}</Text>
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
          contentContainerStyle={styles.screenSignInScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.signInTitle, { fontSize: titleFontSize }]}>
            Sign In
          </Text>

          <Text style={styles.emailLabel}>Email Address</Text>
          <View style={styles.emailInputRow}>
            <Text style={styles.emailInputIcon}>✉</Text>
            <TextInput
              style={styles.emailInputField}
              placeholder="Enter your email address"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={emailLoginValue}
              onChangeText={value => {
                setEmailLoginValue(value);
                setEmailLoginError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleInlineEmailContinue}
            />
            <TouchableOpacity
              style={[
                styles.emailInputArrowButton,
                !isInlineEmailValid && styles.emailInputArrowButtonDisabled,
              ]}
              onPress={handleInlineEmailContinue}
              disabled={!isInlineEmailValid}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Text style={styles.emailInputArrow}>→</Text>
            </TouchableOpacity>
          </View>
          {emailLoginError ? (
            <Text style={styles.inlineFieldError}>{emailLoginError}</Text>
          ) : null}

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
        prefilledEmail={emailLoginValue.trim()}
        autoSendEmailOnOpen={true}
        onClose={() => setEmailOnboardingVisible(false)}
        onMfaRequired={() => {
          setEmailOnboardingVisible(false);
          openMfaPrompt('otp');
        }}
      />

      <Modal
        visible={mfaPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!mfaLoading) {
            setMfaPromptVisible(false);
            setMfaCode('');
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>MFA Verification</Text>
            <Text style={styles.modalSubtitle}>
              Enter your 6-digit authenticator code or 8-character backup code.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={mfaCode}
              onChangeText={v => {
                setMfaCode(v.toUpperCase());
                setMfaError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!mfaLoading}
              placeholder="123456 or ABCD1234"
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={[
                styles.modalPrimaryButton,
                (!isMfaCodeValid || mfaLoading) && styles.buttonDisabled,
              ]}
              onPress={handleMfaVerify}
              disabled={!isMfaCodeValid || mfaLoading}
            >
              {mfaLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Verify MFA</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => {
                if (mfaLoading) return;
                setMfaPromptVisible(false);
                setMfaCode('');
              }}
              disabled={mfaLoading}
            >
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalHint}>
              Pending auth: {pendingAuthSource ?? 'unknown'}
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={mfaSetupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMfaSetupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Setup MFA</Text>
            <Text style={styles.modalSubtitle}>
              Scan this QR in your authenticator app or use the secret.
            </Text>
            {!!mfaSetupPayload?.qrCode && (
              <Text style={styles.modalHint} selectable>
                {mfaSetupPayload.qrCode}
              </Text>
            )}
            {!!mfaSetupPayload?.secret && (
              <Text style={styles.modalHint} selectable>
                Secret: {mfaSetupPayload.secret}
              </Text>
            )}
            <TextInput
              style={styles.modalInput}
              value={mfaSetupCode}
              onChangeText={v =>
                setMfaSetupCode(v.replace(/\D/g, '').slice(0, 6))
              }
              keyboardType="number-pad"
              placeholder="Enter 6-digit setup code"
              placeholderTextColor="#9ca3af"
              editable={!mfaSetupLoading}
            />
            <TouchableOpacity
              style={[
                styles.modalPrimaryButton,
                (mfaSetupCode.trim().length !== 6 || mfaSetupLoading) &&
                  styles.buttonDisabled,
              ]}
              onPress={onMfaSetupVerify}
              disabled={mfaSetupCode.trim().length !== 6 || mfaSetupLoading}
            >
              {mfaSetupLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Verify setup</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => setMfaSetupVisible(false)}
              disabled={mfaSetupLoading}
            >
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={mfaBackupCodesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMfaBackupCodesVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backup Codes</Text>
            <Text style={styles.modalSubtitle}>
              Save these codes. Each code can be used once.
            </Text>
            <Text style={styles.modalHint} selectable>
              {mfaBackupCodes.length
                ? mfaBackupCodes.join('\n')
                : 'No backup codes returned.'}
            </Text>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => setMfaBackupCodesVisible(false)}
            >
              <Text style={styles.modalPrimaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={mfaDisableVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMfaDisableVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Disable MFA</Text>
            <Text style={styles.modalSubtitle}>
              Enter MFA code to verify, then disable MFA for this account.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={mfaDisableCode}
              onChangeText={v => {
                setMfaDisableCode(v.toUpperCase());
                setMfaManageError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!mfaDisableLoading}
              placeholder="123456 or ABCD1234"
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={[
                styles.modalPrimaryButton,
                mfaDisableLoading && styles.buttonDisabled,
              ]}
              onPress={onMfaDisable}
              disabled={mfaDisableLoading}
            >
              {mfaDisableLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>
                  Verify & Disable
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => setMfaDisableVisible(false)}
              disabled={mfaDisableLoading}
            >
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  const config = {
    apiKey: APP_API_KEY,
    autoConnect: true,
    rpId: PASSKEY_RP_ID, // or your production rpId comment
  };

  return (
    <SafeAreaProvider>
      <AbstraxnProvider config={config}>
        <View style={styles.container}>
          <WalletSection />
          <StatusBar barStyle="light-content" />
        </View>
      </AbstraxnProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  screen: {
    flex: 1,
    width: '100%',
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
    backgroundColor: '#0d1117',
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
    paddingHorizontal: 32,
    paddingVertical: 24,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  emailInputIcon: {
    fontSize: 15,
    color: '#9ca3af',
    marginRight: 10,
  },
  emailInputField: {
    flex: 1,
    fontSize: 16,
    color: '#f9fafb',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginRight: 8,
  },
  emailInputArrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f46e5',
  },
  emailInputArrowButtonDisabled: {
    backgroundColor: '#4b5563',
    opacity: 0.8,
  },
  emailInputArrow: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  inlineFieldError: {
    marginTop: 8,
    marginBottom: 12,
    alignSelf: 'stretch',
    color: '#fca5a5',
    fontSize: 12,
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
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
    color: '#f0f6fc',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  connectedSubtitle: {
    color: '#8b949e',
    fontSize: 15,
    marginBottom: 14,
    textAlign: 'center',
  },
  connectedHero: {
    alignItems: 'center',
    marginBottom: 8,
  },
  connectedAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  connectedSectionTitle: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  connectedSectionHint: {
    alignSelf: 'flex-start',
    fontSize: 13,
    color: '#6e7681',
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
  connectedCard: {
    width: '100%',
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 0,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  walletRowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(98, 126, 234, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  walletRowIconSolana: {
    backgroundColor: 'rgba(232, 121, 249, 0.12)',
  },
  walletRowBody: {
    flex: 1,
    minWidth: 0,
  },
  walletRowLabel: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletRowMono: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '500',
  },
  walletRowCopy: {
    padding: 8,
    marginLeft: 4,
  },
  walletRowDivider: {
    height: 1,
    backgroundColor: '#21262d',
    marginVertical: 6,
    marginLeft: 52,
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
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  providerPillText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '600',
  },
  connectedPrimaryButton: {
    backgroundColor: '#6366f1',
    alignSelf: 'stretch',
    marginTop: 14,
    borderRadius: 14,
    minHeight: 52,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  connectedPrimaryButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16,
  },
  connectedSecondaryButton: {
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
    marginTop: 0,
    borderRadius: 14,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: 'rgba(129, 140, 248, 0.55)',
  },
  connectedSecondaryButtonText: {
    color: '#a5b4fc',
    fontWeight: '600',
    fontSize: 15,
  },
  amountInputWrap: {
    width: '100%',
    marginTop: 16,
    marginBottom: 4,
  },
  amountInputLabel: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  amountInput: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '500',
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
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginTop: 28,
    marginBottom: 28,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30363d',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
  },
  logoutIcon: {
    marginRight: 0,
  },
  logoutButtonText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedScrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  mfaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mfaHeaderTitle: {
    flex: 1,
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 12,
  },
  mfaBadgeLoading: {
    paddingHorizontal: 8,
  },
  mfaStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  mfaStatusBadgeOn: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  mfaStatusBadgeOff: {
    backgroundColor: 'rgba(110, 118, 129, 0.15)',
    borderColor: '#30363d',
  },
  mfaStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  mfaStatusDotOn: {
    backgroundColor: '#4ade80',
  },
  mfaStatusDotOff: {
    backgroundColor: '#6e7681',
  },
  mfaStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mfaStatusBadgeTextOn: {
    color: '#86efac',
  },
  mfaStatusBadgeTextOff: {
    color: '#8b949e',
  },
  mfaHint: {
    color: '#6e7681',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  mfaActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mfaPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  mfaPrimaryButtonDisabled: {
    opacity: 0.45,
  },
  mfaPrimaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  mfaGhostButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#484f58',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  mfaGhostButtonDisabled: {
    opacity: 0.4,
  },
  mfaGhostButtonText: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 18,
    padding: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  modalInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    minHeight: 48,
    color: '#f8fafc',
    paddingHorizontal: 12,
    backgroundColor: '#0f172a',
  },
  modalPrimaryButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSecondaryButton: {
    marginTop: 12,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  modalHint: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  mfaQrImage: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
});
