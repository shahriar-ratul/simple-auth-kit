import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthApiError } from '@simple-auth-kit/auth-client';
import { authClient } from '../api/authClient';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TwoFactorSettings'>;

/**
 * 2FA is opt-in per user. Off: enroll -> add the secret to an authenticator -> confirm with a code
 * -> keep the backup codes. On: turning it off also needs a current code.
 */
export function TwoFactorSettingsScreen({
  navigation,
}: Props): React.JSX.Element {
  const enabled = useAuthStore(s => s.currentUser?.twoFactorEnabled ?? false);
  const refreshCurrentUser = useAuthStore(s => s.refreshCurrentUser);

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
    <Text className="mb-3 text-sm text-red-600">{error}</Text>
  ) : null;

  if (backupCodes) {
    return (
      <ScrollView contentContainerClassName="flex-grow p-6">
        <Text className="mb-2 text-[22px] font-bold">Two-factor is on</Text>
        <Text className="mb-4 text-sm text-[#555555]">
          Save these backup codes somewhere safe. Each one signs you in once if
          you lose your authenticator.
        </Text>
        <View className="mb-6 rounded-xl bg-[#f5f5f7] p-4">
          {backupCodes.map(backupCode => (
            <Text
              key={backupCode}
              selectable
              className="mb-1 font-mono text-[15px] text-[#111111]"
            >
              {backupCode}
            </Text>
          ))}
        </View>
        <PrimaryButton title="Done" onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  if (enabled) {
    return (
      <ScrollView
        contentContainerClassName="flex-grow p-6"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-4 text-sm text-[#555555]">
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
        <PrimaryButton
          title="Turn off 2FA"
          variant="danger"
          onPress={() => void disable()}
          loading={busy}
          disabled={code.trim() === ''}
        />
      </ScrollView>
    );
  }

  if (!secret) {
    return (
      <ScrollView contentContainerClassName="flex-grow p-6">
        <Text className="mb-4 text-sm text-[#555555]">
          Two-factor authentication is off. Turn it on to require a code from an
          authenticator app every time you log in.
        </Text>
        {errorText}
        <PrimaryButton
          title="Set up 2FA"
          onPress={() => void startSetup()}
          loading={busy}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="flex-grow p-6"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="mb-2 text-sm text-[#555555]">
        Add this key to your authenticator app, then enter the code it shows.
      </Text>
      <View className="mb-4 rounded-xl bg-[#f5f5f7] p-4">
        <Text className="mb-0.5 text-xs font-semibold text-[#666666]">
          Setup key
        </Text>
        <Text selectable className="font-mono text-[15px] text-[#111111]">
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
      <PrimaryButton
        title="Turn on 2FA"
        onPress={() => void confirmSetup()}
        loading={busy}
        disabled={code.trim() === ''}
      />
    </ScrollView>
  );
}
