import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const currentUser = useAuthStore((s) => s.currentUser);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const logout = useAuthStore((s) => s.logout);
  const refreshCurrentUser = useAuthStore((s) => s.refreshCurrentUser);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void refreshCurrentUser();
  }, [refreshCurrentUser]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshCurrentUser().finally(() => setRefreshing(false));
  }, [refreshCurrentUser]);

  return (
    <ScrollView
      contentContainerClassName="flex-grow p-6"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-[28px] font-bold">Profile</Text>

      {currentUser ? (
        <View className="mb-6 rounded-xl bg-[#f5f5f7] p-4">
          <Row label="User ID" value={currentUser.sub} />
          <Row label="Session ID" value={currentUser.sessionId} />
          <Row label="Roles" value={currentUser.roles.length ? currentUser.roles.join(', ') : '—'} />
          <Row
            label="Permissions"
            value={currentUser.permissions.length ? currentUser.permissions.join(', ') : '—'}
          />
        </View>
      ) : (
        <Text className="mb-6 text-sm text-[#666666]">Loading your profile…</Text>
      )}

      {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

      <PrimaryButton title="View sessions" variant="secondary" onPress={() => navigation.navigate('Sessions')} />
      <PrimaryButton title="Log out" variant="danger" onPress={() => void logout()} loading={isLoading} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View className="mb-3">
      <Text className="mb-0.5 text-xs font-semibold text-[#666666]">{label}</Text>
      <Text className="text-[15px] text-[#111111]">{value}</Text>
    </View>
  );
}
