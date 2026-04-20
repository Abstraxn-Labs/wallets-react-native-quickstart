/* eslint-env jest */

jest.mock('@env', () => ({
  ABSTRAXN_API_KEY: 'test-api-key',
}), { virtual: true });

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5');

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
}));

jest.mock('react-native-inappbrowser-reborn', () => ({
  isAvailable: jest.fn().mockResolvedValue(false),
  open: jest.fn().mockResolvedValue({}),
  close: jest.fn(),
}));

jest.mock('@turnkey/react-native-passkey-stamper', () => ({}));

jest.mock('@abstraxn/signer-react-native', () => {
  return {
    AbstraxnProvider: ({ children }) => children,
    useAbstraxnWallet: () => ({
      wallet: null,
      isInitialized: true,
      isConnected: false,
      address: null,
      whoami: null,
      signupWithPasskeyRN: jest.fn(),
      loginWithPasskeyRN: jest.fn(),
      connect: jest.fn(),
      refreshWhoami: jest.fn(),
      verifyMfa: jest.fn(),
      getLastAuthState: jest.fn(() => ({ mfaRequired: false })),
      getMfaStatus: jest.fn().mockResolvedValue({ enabled: false }),
      enableMfa: jest.fn(),
      verifySetupMfa: jest.fn(),
      disableMfaWithSignedPayload: jest.fn(),
      disconnect: jest.fn(),
      getGoogleAuthUrl: jest.fn(),
      handleGoogleCallback: jest.fn(),
      handleDiscordCallback: jest.fn(),
      handleTwitterCallback: jest.fn(),
      completeOAuthFromDeepLink: jest.fn(),
      completeOAuthReturnFromUrl: jest.fn(),
      getDiscordAuthUrl: jest.fn(),
      getTwitterAuthUrl: jest.fn(),
      loading: false,
      disconnecting: false,
    }),
    useEnableMfa: () => ({ verifySetupMfaWithSignRetry: jest.fn() }),
    useDisableMfa: () => ({ disableMfaWithSignRetry: jest.fn() }),
  };
});
