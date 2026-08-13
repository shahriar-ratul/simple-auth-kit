import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props): React.JSX.Element {
  const signup = useAuthStore((s) => s.signup);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const onSubmit = async (): Promise<void> => {
    try {
      await signup({ email: email.trim(), password });
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
        <Text className="mb-2 text-[28px] font-bold">Create account</Text>

        <FormInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />
        <FormInput label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

        {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

        <PrimaryButton title="Sign up" onPress={() => void onSubmit()} loading={isLoading} disabled={!canSubmit} />
        <PrimaryButton title="Back to log in" variant="secondary" onPress={() => navigation.navigate('Login')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
