import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

export function SignMfaModal({
  visible,
  code,
  onChangeCode,
  onSubmit,
  onCancel,
  loading,
  error,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>MFA Verification Required</Text>
          <Text style={styles.subtitle}>
            Enter your 6-digit authenticator code to continue signing.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor="#9ca3af"
            editable={!loading}
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.primaryButton, (loading || code.trim().length !== 6) && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={loading || code.trim().length !== 6}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify and Retry</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  title: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  error: {
    color: '#f87171',
    marginBottom: 10,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f9fafb',
    fontSize: 16,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#374151',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 10,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
