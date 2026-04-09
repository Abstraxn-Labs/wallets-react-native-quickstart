/**
 * Custom email + OTP modal (no SDK OnboardingUI).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Pressable,
} from 'react-native';
import { isValidEmail } from '@abstraxn/signer-core-react-native';
import { useAbstraxnWallet } from '@abstraxn/signer-react-native';
import { normalizeError } from './utils/errorMessages';

export function EmailOtpModal({
  visible,
  onClose,
  onMfaRequired,
  prefilledEmail = '',
  autoSendEmailOnOpen = false,
}) {
  const { loginWithOTP, verifyOTP } = useAbstraxnWallet();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpId, setOtpId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef(null);

  const clearResendInterval = useCallback(() => {
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
      resendIntervalRef.current = null;
    }
  }, []);

  const startResendCooldown = useCallback(() => {
    clearResendInterval();
    setResendCooldown(60);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearResendInterval();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearResendInterval]);

  const maskedEmail = useMemo(() => {
    const trimmed = String(email || '').trim();
    if (!trimmed.includes('@')) return trimmed;
    const [local, domain] = trimmed.split('@');
    if (!local || !domain) return trimmed;
    if (local.length <= 2) return `${local[0] || ''}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }, [email]);

  useEffect(() => {
    if (visible) {
      setStep('email');
      setEmail(prefilledEmail || '');
      setOtp('');
      setOtpId(null);
      setError(null);
      setLoading(false);
      setResendCooldown(0);
      clearResendInterval();
    }
    return () => {
      clearResendInterval();
    };
  }, [visible, prefilledEmail, clearResendInterval]);

  const resetAndClose = useCallback(() => {
    clearResendInterval();
    setStep('email');
    setEmail('');
    setOtp('');
    setOtpId(null);
    setError(null);
    setResendCooldown(0);
    onClose();
  }, [onClose, clearResendInterval]);

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
      startResendCooldown();
    } catch (err) {
      setError(
        normalizeError(err, {
          fallback: 'Failed to send verification code. Please try again.',
          code: 'ERR_OTP_001',
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [email, loginWithOTP, startResendCooldown]);

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
      const result = await verifyOTP(otpId, otp);
      if (result?.mfaRequired) {
        onMfaRequired?.('otp');
        onClose();
        return;
      }
      resetAndClose();
    } catch (err) {
      console.error('[EmailOtpModal] verifyOTP error:', err);
      setError(
        normalizeError(err, {
          fallback: 'Invalid verification code. Please try again.',
          code: 'ERR_OTP_002',
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [otp, otpId, verifyOTP, resetAndClose, onClose, onMfaRequired]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithOTP(email);
      setOtpId(result.otpId);
      startResendCooldown();
    } catch (err) {
      setError(
        normalizeError(err, {
          fallback: 'Failed to resend code. Please try again.',
          code: 'ERR_OTP_003',
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [email, loginWithOTP, resendCooldown, loading, startResendCooldown]);

  useEffect(() => {
    if (!visible || !autoSendEmailOnOpen) return;
    if (!isValidEmail(email) || loading || step !== 'email') return;
    handleEmailSubmit();
  }, [visible, autoSendEmailOnOpen, email, loading, step, handleEmailSubmit]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!loading) resetAndClose();
          }}
        />
        <View style={styles.card}>
          <View style={styles.stepRow}>
            <View style={[styles.stepPill, styles.stepPillActive]}>
              <Text style={styles.stepPillTextActive}>1. Email</Text>
            </View>
            <View
              style={[
                styles.stepPill,
                step === 'otp' ? styles.stepPillActive : styles.stepPillIdle,
              ]}
            >
              <Text
                style={[
                  styles.stepPillTextIdle,
                  step === 'otp' && styles.stepPillTextActive,
                ]}
              >
                2. Verify
              </Text>
            </View>
          </View>

          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Use your email to receive a verification code.'
              : `Enter the 6-digit code sent to ${maskedEmail || 'your inbox'}.`}
          </Text>
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
                selectionColor="#818cf8"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleEmailSubmit}
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
                selectionColor="#818cf8"
                autoFocus
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={handleOtpSubmit}
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
                style={[styles.resend, (resendCooldown > 0 || loading) && styles.resendDisabled]}
                onPress={handleResend}
                disabled={resendCooldown > 0 || loading}
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
    backgroundColor: 'rgba(3, 7, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 430,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  stepPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  stepPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderColor: 'rgba(129, 140, 248, 0.5)',
  },
  stepPillIdle: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderColor: '#334155',
  },
  stepPillTextActive: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '700',
  },
  stepPillTextIdle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#cbd5e1',
  },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 16,
    color: '#f8fafc',
    backgroundColor: '#0f172a',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  closeRow: {
    marginTop: 14,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  closeText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  resend: {
    marginTop: 12,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  resendText: {
    color: '#a5b4fc',
    fontSize: 13,
    fontWeight: '600',
  },
  resendDisabled: {
    opacity: 0.5,
  },
});
