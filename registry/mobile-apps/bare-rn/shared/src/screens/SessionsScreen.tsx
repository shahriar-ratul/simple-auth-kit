import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { AuthApiError, type SessionSummary } from '@easy-auth/auth-client';
import { authClient } from '../api/authClient';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';

export function SessionsScreen(): React.JSX.Element {
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const isLoggingOutAll = useAuthStore((s) => s.isLoading);

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await authClient.sessions();
      setSessions(result);
      setError(null);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Failed to load sessions.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  return (
    <View className="flex-1">
      {sessions === null && !error ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-6"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <>
              <Text className="mb-4 text-[28px] font-bold">Active sessions</Text>
              {/* No per-session revoke endpoint on the backend today — only bulk logout-all. */}
              <PrimaryButton
                title="Log out everywhere"
                variant="danger"
                onPress={() => void logoutAll()}
                loading={isLoggingOutAll}
              />
              {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}
            </>
          }
          ListEmptyComponent={!error ? <Text className="text-sm text-[#666666]">No sessions found.</Text> : null}
          renderItem={({ item }) => (
            <View className="mb-3 rounded-xl bg-[#f5f5f7] p-4">
              <Text className="mb-1.5 text-sm font-semibold text-[#111111]">{item.id}</Text>
              <Text className="mb-0.5 text-[13px] text-[#555555]">
                Created: {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.ip ? <Text className="mb-0.5 text-[13px] text-[#555555]">IP: {item.ip}</Text> : null}
              {item.userAgent ? (
                <Text className="mb-0.5 text-[13px] text-[#555555]">{item.userAgent}</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
