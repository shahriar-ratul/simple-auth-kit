import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthApiError } from '@simple-auth-kit/auth-client';
import { authClient } from '../api/authClient';
import { Button, FormInput } from '../components/Form';
import type { AppStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';

type Props = NativeStackScreenProps<AppStackParamList, 'TwoFactorSettings'>;

/**
 * 2FA is opt-in per user. Off: enroll -> add the secret to an authenticator -> confirm with a code
 * -> keep the backup codes. On: turning it off also needs a current code.
 */
export function TwoFactorSettingsScreen({ navigation }: Props) {
  const enabled = useAuthStore(
    state => state.currentUser?.twoFactorEnabled ?? false,
  );
  const refreshCurrentUser = useAuthStore(state => state.refreshCurrentUser);

  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      const enrollment = await authClient.enrollTwoFactor();
      setSecret(enrollment.secret);
    }, 'Could not start two-factor setup.');

  const confirmSetup = () =>
    run(async () => {
      const result = await authClient.confirmTwoFactor(code.trim());
      setBackupCodes(result.backupCodes);
      setCode('');
      await refreshCurrentUser();
    }, 'That code did not work. Try the current one.');

  const disable = () =>
    run(async () => {
      await authClient.disableTwoFactor(code.trim());
      await refreshCurrentUser();
      navigation.goBack();
    }, 'Could not turn off two-factor authentication.');

  const errorText = error ? (
    <Text className="text-[#c0392b] mb-3">{error}</Text>
  ) : null;

  if (backupCodes) {
    return (
      <ScrollView contentContainerClassName="grow p-6 bg-white">
        <Text className="text-[22px] font-bold mb-2">Two-factor is on</Text>
        <Text className="text-sm text-[#555] mb-4">
          Save these backup codes somewhere safe. Each one signs you in once if
          you lose your authenticator.
        </Text>
        <View className="border border-[#eee] rounded-xl p-4 mb-6">
          {backupCodes.map(backupCode => (
            <Text
              key={backupCode}
              selectable
              className="font-mono text-[15px] text-[#111] mb-1"
            >
              {backupCode}
            </Text>
          ))}
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  if (enabled) {
    return (
      <ScrollView
        contentContainerClassName="grow p-6 bg-white"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-[#555] mb-4">
          Two-factor authentication is on. Enter a code from your authenticator
          to turn it off.
        </Text>
        <FormInput
          label="Authentication code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={10}
        />
        {errorText}
        <Button
          title="Turn off 2FA"
          variant="danger"
          onPress={disable}
          loading={busy}
          disabled={code.trim() === ''}
        />
      </ScrollView>
    );
  }

  if (!secret) {
    return (
      <ScrollView contentContainerClassName="grow p-6 bg-white">
        <Text className="text-sm text-[#555] mb-4">
          Two-factor authentication is off. Turn it on to require a code from an
          authenticator app every time you log in.
        </Text>
        {errorText}
        <Button title="Set up 2FA" onPress={startSetup} loading={busy} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="grow p-6 bg-white"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-sm text-[#555] mb-2">
        Add this key to your authenticator app, then enter the code it shows.
      </Text>
      <View className="border border-[#eee] rounded-xl p-4 mb-4">
        <Text className="text-xs font-semibold text-[#888] uppercase mb-0.5">
          Setup key
        </Text>
        <Text selectable className="font-mono text-[15px] text-[#111]">
          {secret}
        </Text>
      </View>
      <FormInput
        label="Authentication code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={10}
      />
      {errorText}
      <Button
        title="Turn on 2FA"
        onPress={confirmSetup}
        loading={busy}
        disabled={code.trim() === ''}
      />
    </ScrollView>
  );
}
