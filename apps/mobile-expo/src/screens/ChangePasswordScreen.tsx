import React, { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthApiError } from '@simple-auth-kit/auth-client';
import { authClient } from '../api/authClient';
import { Button, FormInput } from '../components/Form';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0;

  async function handleSubmit() {
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      // The API revokes every other session; this one stays signed in.
      Alert.alert(
        'Password changed',
        'You have been signed out on your other devices.',
      );
      navigation.goBack();
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.message
          : 'Could not change your password.',
      );
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerClassName="grow p-6 bg-white"
      keyboardShouldPersistTaps="handled"
    >
      <FormInput
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder="Current password"
        secureTextEntry
      />
      <FormInput
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New password"
        secureTextEntry
      />
      <FormInput
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        secureTextEntry
      />
      {error ? <Text className="text-[#c0392b] mb-3">{error}</Text> : null}
      <Button
        title="Change password"
        onPress={handleSubmit}
        loading={saving}
        disabled={!canSubmit}
      />
    </ScrollView>
  );
}
