/**
 * App-owned wallet context: AbstraxnWallet from @abstraxn/signer-core-react-native (no @abstraxn/signer-react-native).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AbstraxnWallet } from '@abstraxn/signer-core-react-native';

const WalletContext = createContext(null);

export function WalletProvider({ config, children }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [user, setUser] = useState(null);
  const [whoami, setWhoami] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const walletRef = useRef(null);
  const [walletInstance, setWalletInstance] = useState(null);

  const init = useCallback(async () => {
    if (walletRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const wallet = new AbstraxnWallet({
        apiKey: config.apiKey,
        authMethods: config.authMethods,
        googleClientId: config.googleClientId,
        defaultChainId: config.defaultChainId ?? config.chains?.defaultChainId,
        supportedChains: config.supportedChains,
        autoConnect: config.autoConnect ?? false,
        enableLogging: config.enableLogging ?? false,
        storage: config.storage,
        stamper: config.stamper,
        rpId: config.rpId,
        passkeyConfig: config.passkeyConfig,
      });
      walletRef.current = wallet;
      setWalletInstance(wallet);

      wallet.on('connect', async () => {
        try {
          setIsConnected(true);
          setError(null);
          const whoamiInfo = await wallet.getWhoami();
          if (whoamiInfo) setWhoami(whoamiInfo);
          try {
            setUser(await wallet.getUserInfo());
          } catch {
            setUser(null);
          }
          try {
            setAddress(await wallet.getAddress());
          } catch {
            setAddress(null);
          }
          try {
            setChainId(await wallet.getChainId());
          } catch {
            setChainId(null);
          }
        } catch (err) {
          console.error('Connect handler error:', err);
        }
      });

      wallet.on('disconnect', () => {
        setIsConnected(false);
        setAddress(null);
        setUser(null);
        setWhoami(null);
        setChainId(null);
      });

      wallet.on('accountChanged', (newAddress) => setAddress(newAddress));
      wallet.on('chainChanged', (newChainId) => setChainId(newChainId));

      setIsInitialized(true);
      if (wallet.isConnected) {
        try {
          const whoamiInfo = await wallet.getWhoami();
          if (whoamiInfo) {
            setIsConnected(true);
            setUser(await wallet.getUserInfo());
            setWhoami(whoamiInfo);
            setAddress(await wallet.getAddress().catch(() => null));
            setChainId(await wallet.getChainId());
          }
        } catch (e) {
          if (config.enableLogging) console.warn('Restore state:', e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [
    config.apiKey,
    config.authMethods,
    config.googleClientId,
    config.defaultChainId,
    config.chains?.defaultChainId,
    config.supportedChains,
    config.autoConnect,
    config.enableLogging,
    config.storage,
    config.stamper,
    config.rpId,
  ]);

  useEffect(() => {
    if (config.autoInit !== false) {
      init();
    }
    return () => {
      walletRef.current = null;
      setWalletInstance(null);
    };
  }, []);

  const connect = useCallback(async () => {
    const w = walletRef.current;
    if (!w) return;
    await w.connect();
  }, []);

  const disconnect = useCallback(async () => {
    const w = walletRef.current;
    if (!w) return;
    setDisconnecting(true);
    try {
      await w.disconnect();
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const getAddress = useCallback(async () => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.getAddress();
  }, []);

  const getChainId = useCallback(async () => {
    const w = walletRef.current;
    if (!w) return null;
    return w.getChainId();
  }, []);

  const signMessage = useCallback(async (message) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.signMessage(message);
  }, []);

  const signTransaction = useCallback(async (tx) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.signTransaction(tx);
  }, []);

  const sendTransaction = useCallback(async (tx) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.sendTransaction(tx);
  }, []);

  const loginWithOTP = useCallback(async (email) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.loginWithOTP(email);
  }, []);

  const verifyOTP = useCallback(async (otpId, otpCode) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    const userResult = await w.verifyOTP(otpId, otpCode);
    await w.connect();
    return userResult;
  }, []);

  const signupWithPasskey = useCallback(async (options) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.signupWithPasskey(options);
  }, []);

  const signupWithPasskeyRN = useCallback(async (options) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    if (typeof w.signupWithPasskeyRN === 'function') {
      return w.signupWithPasskeyRN(options);
    }
    const userResult = await w.signupWithPasskey(options);
    return { user: userResult, tokens: null, whoami: null };
  }, []);

  const loginWithPasskey = useCallback(async (organizationId, overrides) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.loginWithPasskey(organizationId, overrides);
  }, []);

  const loginWithPasskeyRN = useCallback(async (organizationId, overrides) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    if (typeof w.loginWithPasskeyRN === 'function') {
      return w.loginWithPasskeyRN(organizationId, overrides);
    }
    const userResult = await w.loginWithPasskey(organizationId, overrides);
    return { user: userResult, tokens: null, whoami: null };
  }, []);

  const getGoogleAuthUrl = useCallback(async (originUrl) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.getAuthManager().getGoogleAuthUrl(originUrl);
  }, []);

  const handleGoogleCallback = useCallback(async (code, state) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.handleGoogleCallback(code, state);
  }, []);

  const completeOAuthFromDeepLink = useCallback(async (payload) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.completeOAuthFromDeepLink(payload);
  }, []);

  const completeOAuthReturnFromUrl = useCallback(async (url, provider) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.completeOAuthReturnFromUrl(url, provider);
  }, []);

  const completeOAuthReturnFromParams = useCallback(async (params, provider) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.completeOAuthReturnFromParams(params, provider);
  }, []);

  const getDiscordAuthUrl = useCallback(async (originUrl) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.getAuthManager().getDiscordAuthUrl(originUrl);
  }, []);

  const handleDiscordCallback = useCallback(async (code, state) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.handleDiscordCallback(code, state);
  }, []);

  const getTwitterAuthUrl = useCallback(async (originUrl) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.getAuthManager().getTwitterAuthUrl(originUrl);
  }, []);

  const handleTwitterCallback = useCallback(async (code, state) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.handleTwitterCallback(code, state);
  }, []);

  const refreshWhoami = useCallback(async () => {
    const w = walletRef.current;
    if (!w) return null;
    const info = await w.refreshWhoami();
    setWhoami(info);
    return info;
  }, []);

  const signTurnkeyRequest = useCallback(async (body) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.signTurnkeyRequest(body);
  }, []);

  const signTransactionViaAPI = useCallback(async (unsignedTransaction, fromAddress) => {
    const w = walletRef.current;
    if (!w) throw new Error('Wallet not initialized');
    return w.signTransactionViaAPI(unsignedTransaction, fromAddress);
  }, []);

  const value = useMemo(
    () => ({
      wallet: walletInstance,
      isInitialized,
      isConnected,
      address,
      user,
      whoami,
      chainId,
      error,
      loading,
      disconnecting,
      init,
      connect,
      disconnect,
      getAddress,
      getChainId,
      signMessage,
      signTransaction,
      sendTransaction,
      signTurnkeyRequest,
      signTransactionViaAPI,
      loginWithOTP,
      verifyOTP,
      signupWithPasskeyRN,
      loginWithPasskeyRN,
      signupWithPasskey,
      loginWithPasskey,
      refreshWhoami,
      getGoogleAuthUrl,
      handleGoogleCallback,
      completeOAuthFromDeepLink,
      completeOAuthReturnFromUrl,
      completeOAuthReturnFromParams,
      getDiscordAuthUrl,
      handleDiscordCallback,
      getTwitterAuthUrl,
      handleTwitterCallback,
    }),
    [
      walletInstance,
      isInitialized,
      isConnected,
      address,
      user,
      whoami,
      chainId,
      error,
      loading,
      disconnecting,
      init,
      connect,
      disconnect,
      getAddress,
      getChainId,
      signMessage,
      signTransaction,
      sendTransaction,
      signTurnkeyRequest,
      signTransactionViaAPI,
      loginWithOTP,
      verifyOTP,
      signupWithPasskeyRN,
      loginWithPasskeyRN,
      signupWithPasskey,
      loginWithPasskey,
      refreshWhoami,
      getGoogleAuthUrl,
      handleGoogleCallback,
      completeOAuthFromDeepLink,
      completeOAuthReturnFromUrl,
      completeOAuthReturnFromParams,
      getDiscordAuthUrl,
      handleDiscordCallback,
      getTwitterAuthUrl,
      handleTwitterCallback,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return ctx;
}
