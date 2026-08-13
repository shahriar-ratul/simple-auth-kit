import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props): React.JSX.Element {
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const onSubmit = async (): Promise<void> => {
    try {
      const result = await login({ identifier: email.trim(), password });
      if ('twoFactorRequired' in result) {
        navigation.navigate('TwoFactor', { challengeToken: result.challengeToken });
      }
      // On a direct AuthTokens result, the root navigator swaps to the authenticated
      // stack automatically once `currentUser` is set — no manual navigation needed.
    } catch {
      // Error message is already surfaced via the store's `error` field.
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-6"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-2 text-[28px] font-bold">Log in</Text>

        <FormInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />
        <FormInput label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

        {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

        <PrimaryButton title="Log in" onPress={() => void onSubmit()} loading={isLoading} disabled={!canSubmit} />
        <PrimaryButton title="Create an account" variant="secondary" onPress={() => navigation.navigate('Signup')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
