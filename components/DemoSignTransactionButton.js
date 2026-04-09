import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useAbstraxnWallet, useSignTxn } from '@abstraxn/signer-react-native';
import { normalizeError } from '../src/utils/errorMessages';
import { SignMfaModal } from '../src/SignMfaModal';

/** @typedef {import('@abstraxn/signer-react-native').SignTxnParams} SignTxnParams */
/** @typedef {import('@abstraxn/signer-react-native').SignTxnResult} SignTxnResult */

const DEFAULT_TX = {
  // Self-transfer demo tx; uses the connected address at runtime.
  to: null,
  value: 0n,
  data: '0x',
  chainId: 80002,
  gasLimit: 21000n,
  type: 'legacy',
};

export function DemoSignTransactionButton({
  rpcUrl = 'https://rpc-amoy.polygon.technology',
  tx = DEFAULT_TX,
  label = 'Sign Transaction',
  style,
  textStyle,
  disabled = false,
}) {
  const { isConnected, loading, address, verifySignMfa } = useAbstraxnWallet();
  const { signTxn } = useSignTxn(rpcUrl);
  const [signing, setSigning] = React.useState(false);
  const [signedResult, setSignedResult] = React.useState(null);
  const [mfaVisible, setMfaVisible] = React.useState(false);
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState(null);
  const [pendingTxToSign, setPendingTxToSign] = React.useState(null);
  const isDisabled = disabled || !isConnected || !address || loading || signing;

  const isSignMfaRequiredError = React.useCallback((err) => {
    const code = err?.code ?? err?.response?.data?.code;
    const status = Number(err?.status ?? err?.response?.status ?? 0);
    const message = String(err?.message ?? err?.response?.data?.message ?? '').toLowerCase();
    return (
      code === 'SIGN_MFA_REQUIRED' ||
      message.includes('sign_mfa_required') ||
      message.includes('mfa verification required before signing') ||
      status === 403 ||
      message.includes('status 403') ||
      message.includes('forbidden')
    );
  }, []);

  const executeSign = React.useCallback(
    async (txToSign, allowMfaRetry) => {
      try {
        const signResult = await signTxn(txToSign);
        setSignedResult(signResult);
        return signResult;
      } catch (err) {
        if (allowMfaRetry && isSignMfaRequiredError(err)) {
          setPendingTxToSign(txToSign);
          setMfaCode('');
          setMfaError(null);
          setMfaVisible(true);
          return null;
        }
        throw err;
      }
    },
    [isSignMfaRequiredError, signTxn]
  );

  const handlePress = async () => {
    if (isDisabled || !address) return;
    setSigning(true);
    try {
      /** @type {SignTxnParams} */
      const txToSign = {
        from: address,
        to: tx?.to ?? address,
        value: tx?.value ?? 0n,
        data: tx?.data ?? '0x',
        chainId: tx?.chainId,
        gas:
          typeof tx?.gasLimit === 'bigint'
            ? { gasLimit: tx.gasLimit }
            : tx?.gas,
      };
      await executeSign(txToSign, true);
    } catch (err) {
      Alert.alert(
        'Sign failed',
        normalizeError(err, {
          fallback: 'Could not sign transaction. Please try again.',
          code: 'ERR_TX_002',
        }),
      );
    } finally {
      setSigning(false);
    }
  };

  const onSubmitSignMfa = async () => {
    const code = mfaCode.trim();
    if (code.length !== 6) {
      setMfaError('Please enter a valid 6-digit code.');
      return;
    }
    if (!pendingTxToSign) {
      setMfaError('No pending signing request found. Please try again.');
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifySignMfa(code);
      setMfaVisible(false);
      setSigning(true);
      await executeSign(pendingTxToSign, false);
      setPendingTxToSign(null);
    } catch (err) {
      setMfaError(
        normalizeError(err, {
          fallback: 'MFA verification failed. Please try again.',
          code: 'ERR_MFA_SIGN_001',
        })
      );
    } finally {
      setMfaLoading(false);
      setSigning(false);
    }
  };

  const onCopyPress = () => {
    if (!signedResult?.signedTransaction) return;
    Clipboard.setString(String(signedResult.signedTransaction));
    Alert.alert('Copied', 'Signed transaction copied to clipboard.');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, style, isDisabled && styles.disabled]}
        onPress={handlePress}
        disabled={isDisabled}
        activeOpacity={0.8}
      >
        {signing ? (
          <ActivityIndicator size="small" color="#f9fafb" />
        ) : (
          <Text style={[styles.text, textStyle]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </TouchableOpacity>

      {signedResult?.signedTransaction ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Signed transaction</Text>
          <Text style={styles.resultValue} selectable>
            {signedResult.signedTransaction}
          </Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={onCopyPress}
            activeOpacity={0.8}
          >
            <Text style={styles.copyButtonText}>Copy</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <SignMfaModal
        visible={mfaVisible}
        code={mfaCode}
        onChangeCode={(value) => {
          setMfaCode(value.replace(/\D/g, '').slice(0, 6));
          setMfaError(null);
        }}
        onSubmit={onSubmitSignMfa}
        onCancel={() => {
          if (mfaLoading) return;
          setMfaVisible(false);
          setPendingTxToSign(null);
          setMfaCode('');
          setMfaError(null);
        }}
        loading={mfaLoading}
        error={mfaError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#374151',
  },
  disabled: {
    opacity: 0.7,
  },
  text: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#202634',
    padding: 12,
  },
  resultTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  resultValue: {
    color: '#f9fafb',
    fontSize: 12,
    lineHeight: 18,
  },
  copyButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#6b7280',
  },
  copyButtonText: {
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: '700',
  },
});
