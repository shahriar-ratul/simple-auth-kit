import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthApiError } from '@simple-auth-kit/auth-client';
import { authClient } from '../api/authClient';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

/** Blank means "clear it": the API stores null for an unset optional profile field. */
const orNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim();

export function EditProfileScreen({ navigation }: Props): React.JSX.Element {
  const currentUser = useAuthStore(s => s.currentUser);
  const refreshCurrentUser = useAuthStore(s => s.refreshCurrentUser);

  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [displayName, setDisplayName] = useState(
    currentUser?.displayName ?? '',
  );
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await authClient.updateProfile({
        firstName: orNull(firstName),
        lastName: orNull(lastName),
        displayName: orNull(displayName),
        username: orNull(username),
        phone: orNull(phone),
      });
      await refreshCurrentUser();
      navigation.goBack();
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.message
          : 'Could not save your profile.',
      );
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerClassName="flex-grow p-6"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="mb-4 text-sm text-[#666666]">{currentUser?.email}</Text>
      <FormInput
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="First name"
        autoCapitalize="words"
      />
      <FormInput
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Last name"
        autoCapitalize="words"
      />
      <FormInput
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display name"
        autoCapitalize="words"
      />
      <FormInput
        label="Username"
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
      />
      <FormInput
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone"
        keyboardType="phone-pad"
      />
      {error ? (
        <Text className="mb-3 text-sm text-red-600">{error}</Text>
      ) : null}
      <PrimaryButton
        title="Save"
        onPress={() => void onSave()}
        loading={saving}
      />
    </ScrollView>
  );
}
