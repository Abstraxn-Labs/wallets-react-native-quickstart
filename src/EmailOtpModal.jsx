/**
 * Custom email + OTP modal (no SDK OnboardingUI).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { isValidEmail } from '@abstraxn/signer-core-react-native';
import { useAbstraxnWallet } from '@abstraxn/signer-react-native';

export function EmailOtpModal({ visible, onClose }) {
  const { loginWithOTP, verifyOTP } = useAbstraxnWallet();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpId, setOtpId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (visible) {
      setStep('email');
      setEmail('');
      setOtp('');
      setOtpId(null);
      setError(null);
      setLoading(false);
      setResendCooldown(0);
    }
  }, [visible]);

  const resetAndClose = useCallback(() => {
    setStep('email');
    setEmail('');
    setOtp('');
    setOtpId(null);
    setError(null);
    setResendCooldown(0);
    onClose();
  }, [onClose]);

  const handleEmailSubmit = useCallback(async () => {
    if (!email || !isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithOTP(email);
      setOtpId(result.otpId);
      setStep('otp');
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }, [email, loginWithOTP]);

  const handleOtpSubmit = useCallback(async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    if (!otpId) {
      setError('Session expired. Please start again.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await verifyOTP(otpId, otp);
      resetAndClose();
    } catch (err) {
      console.error('[EmailOtpModal] verifyOTP error:', err);
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }, [otp, otpId, verifyOTP, resetAndClose]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithOTP(email);
      setOtpId(result.otpId);
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setLoading(false);
    }
  }, [email, loginWithOTP, resendCooldown]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step === 'email' ? (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#6b7280"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={[styles.button, (loading || !isValidEmail(email)) && styles.buttonDisabled]}
                onPress={handleEmailSubmit}
                disabled={loading || !isValidEmail(email)}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Verification code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#6b7280"
                value={otp}
                onChangeText={(t) => {
                  setOtp(t.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
              <TouchableOpacity
                style={[styles.button, (loading || otp.length !== 6) && styles.buttonDisabled]}
                onPress={handleOtpSubmit}
                disabled={loading || otp.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resend, resendCooldown > 0 && styles.resendDisabled]}
                onPress={handleResend}
                disabled={resendCooldown > 0}
              >
                <Text style={styles.resendText}>
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.closeRow} onPress={resetAndClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 24,
    color: '#f9fafb',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#d1d5db',
  },
  input: {
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    color: '#f9fafb',
  },
  button: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 12,
  },
  closeRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 14,
  },
  resend: {
    marginTop: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#fff',
    fontSize: 14,
  },
  resendDisabled: {
    opacity: 0.5,
  },
});
