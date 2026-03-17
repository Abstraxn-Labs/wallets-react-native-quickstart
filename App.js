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
} from 'react-native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import {
  AbstraxnProvider,
  SignTransactionButton,
  SignAndSendTransactionButton,
  useAbstraxnWallet,
} from '@abstraxn/signer-react-native';

// Redirect scheme for OAuth: backend redirects to myabstraxnapp://success=true&user=...
const OAUTH_REDIRECT_SCHEME = 'myabstraxnapp://';
const GOOGLE_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/google/callback';
const DISCORD_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/discord/callback';
const TWITTER_CALLBACK_URL_PATH = 'signer.abstraxn.com/login/x/callback';

function getSearchParams(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams;
  } catch {
    const qs = url.includes('?')
      ? url.split('?')[1]
      : url.replace(/^[^?]*\/\/?/, '');
    return qs ? new URLSearchParams(qs) : null;
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
    wallet,
    disconnect,
    showOnboarding,
    getGoogleAuthUrl,
    handleGoogleCallback,
    completeOAuthFromDeepLink,
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
  // Dedupe: Google/Discord auth codes are single-use; prevent processing same code twice (avoids invalid_grant)
  const processedCallbackRef = React.useRef(null);

  const { width: screenWidth } = useWindowDimensions();
  const cardMaxWidth = Math.min(400, screenWidth - 32);
  const paddingHoriz = screenWidth < 360 ? 16 : screenWidth < 600 ? 24 : 32;
  const socialSize = screenWidth < 360 ? 48 : 56;
  const iconSize = screenWidth < 360 ? 20 : 24;
  const titleFontSize = screenWidth < 360 ? 24 : 28;

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
      if (errorParam != null && errorParam !== '') {
        const decodedError = decodeURIComponent(errorParam);
        console.error('[OAuth] Error from backend:', decodedError);
        setOauthError(decodedError);
        return;
      }
      if (success === 'true') {
        const accessToken = params.get('accessToken');
        const refreshToken = params.get('refreshToken');
        const userParam = params.get('user');
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
          const dedupeKey = `success:${accessToken.slice(0, 20)}`;
          if (processedCallbackRef.current === dedupeKey) {
            console.warn(
              '[OAuth] Skipping duplicate success callback (already processed)',
            );
            return;
          }
          processedCallbackRef.current = dedupeKey;
          setGoogleLoading(true);
          let userObj;
          try {
            userObj = JSON.parse(decodeURIComponent(userParam));
          } catch (e) {
            const errMsg = 'Invalid user data from sign-in';
            console.error('[OAuth]', errMsg, e);
            setOauthError(errMsg);
            setGoogleLoading(false);
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
        } else {
          console.log(
            '[OAuth] Success=true but missing accessToken/refreshToken/user; cannot complete login',
          );
        }
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
      const dedupeKey = `code:${code}:${state}`;
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
          '[OAuth] Sending fresh authorization code to backend for Google (single-use)',
        );
        setGoogleLoading(true);
        handleGoogleCallback(code, state)
          .catch(e => {
            const errMsg = e?.message ?? 'Google sign-in failed';
            console.error('[OAuth] handleGoogleCallback failed:', errMsg, e);
            setOauthError(errMsg);
          })
          .finally(() => setGoogleLoading(false));
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
  }, [handleGoogleCallback, completeOAuthFromDeepLink]);

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
    console.log('[OAuth] Discord button pressed');
    setOauthError(null);
    try {
      setDiscordLoading(true);
      const discordAuthUrl = await getDiscordAuthUrl(OAUTH_REDIRECT_SCHEME);
      console.log('[OAuth] Got Discord auth URL, opening...');
      if (!discordAuthUrl || !discordAuthUrl.startsWith('http')) {
        throw new Error('Invalid Discord sign-in URL');
      }
      await Linking.openURL(discordAuthUrl);
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
    console.log('[OAuth] Twitter button pressed');
    setOauthError(null);
    try {
      setTwitterLoading(true);
      const twitterAuthUrl = await getTwitterAuthUrl(OAUTH_REDIRECT_SCHEME);
      console.log('[OAuth] Got X (Twitter) auth URL, opening...');
      if (!twitterAuthUrl || !twitterAuthUrl.startsWith('http')) {
        throw new Error('Invalid X (Twitter) sign-in URL');
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
    if (!wallet) return;
    setPasskeyError(null);
    setPasskeyCreateLoading(true);
    try {
      await wallet.signupWithPasskey({
        // Leave userName undefined so SDK can generate a unique one (User_<timestamp>)
        organizationName: 'MyAbstraxnApp',
      });
    } catch (e) {
      const msg = e?.message ?? 'Create wallet with passkey failed';
      setPasskeyError(msg);
    } finally {
      setPasskeyCreateLoading(false);
    }
  };

  const onImportPasskeyPress = async () => {
    if (!wallet) return;
    setPasskeyError(null);
    setPasskeyImportLoading(true);
    try {
      await wallet.loginWithPasskey();
    } catch (e) {
      const msg = e?.message ?? 'Import wallet with passkey failed';
      setPasskeyError(msg);
    } finally {
      setPasskeyImportLoading(false);
    }
  };

  const isSigningIn =
    googleLoading ||
    discordLoading ||
    twitterLoading ||
    passkeyCreateLoading ||
    passkeyImportLoading ||
    loading;

  const onLogoutPress = async () => {
    if (!wallet) return;
    setPasskeyError(null);
    setOauthError(null);
    processedCallbackRef.current = null; // allow next OAuth redirect (e.g. Twitter/Discord re-login) to run completeOAuthFromDeepLink
    try {
      await disconnect();
    } catch (e) {
      console.warn('Logout failed', e);
    }
  };

  if (isConnected) {
    return (
      <View style={[styles.screen, styles.screenDark]}>
        <Text style={styles.homeTitle}>You're in</Text>
        {address ? (
          <View style={styles.addressContainer}>
            <Text style={styles.addressText} selectable>
              {address}
            </Text>
          </View>
        ) : null}
        <SignTransactionButton
          style={styles.connectedPrimaryButton}
          textStyle={styles.connectedPrimaryButtonText}
        />
        <SignAndSendTransactionButton
          rpcUrl="https://rpc-amoy.polygon.technology"
          label="Sign & Send Transaction"
          txParams={{
            to: '0x4ECba15A68637CAC139b0A1213a1075632D8b8c5',
            value: '0x0',
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
    !wallet || passkeyCreateLoading || passkeyImportLoading || socialDisabled;

  return (
    <View
      style={[styles.screen, !isSigningIn && !isConnected && styles.screenDark]}
    >
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
            onPress={showOnboarding}
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

          {oauthError ? (
            <Text style={styles.errorText}>{oauthError}</Text>
          ) : null}
          {passkeyError ? (
            <Text style={styles.errorText}>{passkeyError}</Text>
          ) : null}

          <Text style={styles.footer}>Powered by abstraxn</Text>
        </ScrollView>
      )}
    </View>
  );
}

export default function App() {
  const config = {
    apiKey: 'OG3B8vk99Ev3mxRfgToPCNkrT0A0LNI3',
    autoConnect: true,
    rpId: 'signer.abstraxn.com', // or your production rpId comment
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
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#f9fafb',
  },
  addressContainer: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
    maxWidth: '100%',
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
  addressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
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
