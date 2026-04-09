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
import {
  useAbstraxnWallet,
  useSignAndSendTxn,
} from '@abstraxn/signer-react-native';
import { normalizeError } from '../src/utils/errorMessages';
import { SignMfaModal } from '../src/SignMfaModal';

/** @typedef {import('@abstraxn/signer-react-native').SignAndSendTxnParams} SignAndSendTxnParams */
/** @typedef {import('@abstraxn/signer-react-native').SignAndSendTxnResult} SignAndSendTxnResult */

export function DemoSignAndSendTransactionButton({
  rpcUrl,
  txParams,
  label = 'Sign & Send Transaction',
  style,
  textStyle,
  disabled = false,
}) {
  const { isConnected, address, verifySignMfa } = useAbstraxnWallet();
  const { signAndSendTxn } = useSignAndSendTxn(rpcUrl);
  const [sending, setSending] = React.useState(false);
  const [sendResult, setSendResult] = React.useState(null);
  const [mfaVisible, setMfaVisible] = React.useState(false);
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState(null);
  const [pendingParams, setPendingParams] = React.useState(null);
  const isDisabled = disabled || !isConnected || !address || sending;

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

  const executeSignAndSend = React.useCallback(
    async (params, allowMfaRetry) => {
      try {
        const result = await signAndSendTxn(params);
        setSendResult(result);
        return result;
      } catch (err) {
        if (allowMfaRetry && isSignMfaRequiredError(err)) {
          setPendingParams(params);
          setMfaCode('');
          setMfaError(null);
          setMfaVisible(true);
          return null;
        }
        throw err;
      }
    },
    [isSignMfaRequiredError, signAndSendTxn]
  );

  const handlePress = async () => {
    if (isDisabled || !address) return;
    setSending(true);
    try {
      /** @type {SignAndSendTxnParams} */
      const params = {
        from: address,
        to: txParams?.to ?? address,
        value: txParams?.value ?? 0n,
        data: txParams?.data ?? '0x',
        chainId: txParams?.chainId,
        gas:
          typeof txParams?.gas === 'bigint'
            ? { gasLimit: txParams.gas }
            : txParams?.gas,
      };
      await executeSignAndSend(params, true);
    } catch (err) {
      Alert.alert(
        'Sign & Send failed',
        normalizeError(err, {
          fallback: 'Could not sign or send transaction. Please try again.',
          code: 'ERR_TX_001',
        }),
      );
    } finally {
      setSending(false);
    }
  };

  const onSubmitSignMfa = async () => {
    const code = mfaCode.trim();
    if (code.length !== 6) {
      setMfaError('Please enter a valid 6-digit code.');
      return;
    }
    if (!pendingParams) {
      setMfaError('No pending signing request found. Please try again.');
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifySignMfa(code);
      setMfaVisible(false);
      setSending(true);
      await executeSignAndSend(pendingParams, false);
      setPendingParams(null);
    } catch (err) {
      setMfaError(
        normalizeError(err, {
          fallback: 'MFA verification failed. Please try again.',
          code: 'ERR_MFA_SIGN_001',
        })
      );
    } finally {
      setMfaLoading(false);
      setSending(false);
    }
  };

  const onCopyHash = () => {
    if (!sendResult?.hash) return;
    Clipboard.setString(String(sendResult.hash));
    Alert.alert('Copied', 'Transaction hash copied to clipboard.');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, style, isDisabled && styles.disabled]}
        onPress={handlePress}
        disabled={isDisabled}
        activeOpacity={0.8}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#f9fafb" />
        ) : (
          <Text style={[styles.text, textStyle]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </TouchableOpacity>

      {sendResult?.hash ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Transaction sent</Text>
          <Text style={styles.resultLabel}>Hash</Text>
          <Text style={styles.resultValue} selectable>
            {sendResult.hash}
          </Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={onCopyHash}
            activeOpacity={0.8}
          >
            <Text style={styles.copyButtonText}>Copy hash</Text>
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
          setPendingParams(null);
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
  resultLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
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
