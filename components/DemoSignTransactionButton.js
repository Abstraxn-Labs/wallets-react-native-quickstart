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
  const { isConnected, loading, address } = useAbstraxnWallet();
  const { signTxn } = useSignTxn(rpcUrl);
  const [signing, setSigning] = React.useState(false);
  const [signedResult, setSignedResult] = React.useState(null);
  const isDisabled = disabled || !isConnected || !address || loading || signing;

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
      /** @type {SignTxnResult} */
      const signResult = await signTxn(txToSign);
      const { signedTransaction } = signResult;
      setSignedResult(signResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Sign failed', message || 'Could not sign transaction.');
    } finally {
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
