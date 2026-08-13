import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TwoFactor'>;

export function TwoFactorScreen({ route }: Props): React.JSX.Element {
  const { challengeToken } = route.params;
  const loginTwoFactor = useAuthStore((s) => s.loginTwoFactor);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const [code, setCode] = useState('');

  const onSubmit = async (): Promise<void> => {
    try {
      await loginTwoFactor({ challengeToken, code: code.trim() });
      // Root navigator swaps to the authenticated stack once `currentUser` is set.
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
        <Text className="mb-2 text-[28px] font-bold">Enter your code</Text>
        <Text className="mb-6 text-sm text-[#666666]">
          Open your authenticator app and enter the current 6-digit code.
        </Text>

        <FormInput
          label="Verification code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
        />

        {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

        <PrimaryButton
          title="Verify"
          onPress={() => void onSubmit()}
          loading={isLoading}
          disabled={code.trim().length === 0}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
