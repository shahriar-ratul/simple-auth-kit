import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { AuthApiError, type SessionSummary } from "@easy-auth/auth-client";
import { authClient } from "../api/authClient";
import { useAuthStore } from "../store/authStore";

export function SessionsScreen() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutAll = useAuthStore((state) => state.logoutAll);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await authClient.sessions();
      setSessions(result);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Failed to load sessions.");
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 p-6 bg-white">
      {error ? <Text className="text-[#c0392b] mb-3">{error}</Text> : null}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text className="text-sm text-[#666]">No active sessions.</Text>}
        contentContainerClassName={sessions.length === 0 ? "grow justify-center items-center" : undefined}
        renderItem={({ item }) => (
          <View className="border border-[#eee] rounded-[10px] p-3 mb-2.5">
            <Text className="text-sm font-semibold mb-1">{item.id}</Text>
            <Text className="text-xs text-[#666]">Created: {new Date(item.createdAt).toLocaleString()}</Text>
            {item.userAgent ? <Text className="text-xs text-[#666]">User agent: {item.userAgent}</Text> : null}
            {item.ip ? <Text className="text-xs text-[#666]">IP: {item.ip}</Text> : null}
          </View>
        )}
      />

      <Pressable
        className={`bg-red-600 rounded-lg py-3.5 items-center mt-3 ${isSubmitting ? "opacity-50" : ""}`}
        onPress={() => logoutAll()}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator className="text-white" />
        ) : (
          <Text className="text-white text-base font-semibold">Log out everywhere</Text>
        )}
      </Pressable>
    </View>
  );
}
