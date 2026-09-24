import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthApiError } from '@simple-auth-kit/auth-client';
import { authClient } from '../api/authClient';
import { Button, FormInput } from '../components/Form';
import type { AppStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';

type Props = NativeStackScreenProps<AppStackParamList, 'EditProfile'>;

/** Blank means "clear it": the API stores null for an unset optional profile field. */
const orNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim();

export function EditProfileScreen({ navigation }: Props) {
  const currentUser = useAuthStore(state => state.currentUser);
  const refreshCurrentUser = useAuthStore(state => state.refreshCurrentUser);

  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [displayName, setDisplayName] = useState(
    currentUser?.displayName ?? '',
  );
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
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
      contentContainerClassName="grow p-6 bg-white"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-sm text-[#666] mb-4">{currentUser?.email}</Text>
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
      {error ? <Text className="text-[#c0392b] mb-3">{error}</Text> : null}
      <Button title="Save" onPress={handleSave} loading={saving} />
    </ScrollView>
  );
}
