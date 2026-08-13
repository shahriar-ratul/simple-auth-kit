import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useActiveWorkspace } from "../store/workspaceStore";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const activeWorkspace = useActiveWorkspace();
  const refreshCurrentUser = useAuthStore((state) => state.refreshCurrentUser);
  const logout = useAuthStore((state) => state.logout);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCurrentUser();
    } catch {
      // Swallow — the store already recorded the error; this is a background refresh.
    } finally {
      setRefreshing(false);
    }
  }, [refreshCurrentUser]);

  return (
    <ScrollView
      contentContainerClassName="grow p-6 bg-white"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-[28px] font-bold mb-4">Profile</Text>

      <View className="border border-blue-600 bg-blue-50 rounded-xl p-4 mb-6">
        <Text className="text-xs font-semibold text-blue-600 uppercase mb-0.5">Active workspace</Text>
        <Text className="text-[17px] font-semibold text-[#111]">{activeWorkspace?.name ?? "—"}</Text>
        <Text className="text-xs text-[#666] mt-1">{activeWorkspace?.id ?? ""}</Text>
        <Pressable className="mt-3" onPress={() => navigation.navigate("SwitchWorkspace")}>
          <Text className="text-blue-600 text-sm font-semibold">Switch workspace</Text>
        </Pressable>
      </View>

      {currentUser ? (
        <View className="border border-[#eee] rounded-xl p-4 mb-6 gap-3">
          <Field label="User ID" value={currentUser.sub} />
          <Field label="Session ID" value={currentUser.sessionId} />
          {/*
            `me()` carries the active workspace, so these two are the caller's roles and
            permissions *inside it* — not deployment-wide. Being admin here says nothing about
            any other workspace, which is the property the backend enforces.
          */}
          <Field
            label={`Roles in ${activeWorkspace?.name ?? "this workspace"}`}
            value={currentUser.roles.length ? currentUser.roles.join(", ") : "—"}
          />
          <Field
            label="Permissions here"
            value={currentUser.permissions.length ? currentUser.permissions.join(", ") : "—"}
          />
          <Field label="Two-factor" value={currentUser.twoFactorEnabled ? "Enabled" : "Disabled"} />
        </View>
      ) : (
        <Text className="text-sm text-[#666]">No profile data.</Text>
      )}

      <Pressable className="border border-blue-600 rounded-lg py-3.5 items-center mb-3" onPress={() => navigation.navigate("Sessions")}>
        <Text className="text-blue-600 text-base font-semibold">View sessions</Text>
      </Pressable>

      <Pressable
        className={`bg-red-600 rounded-lg py-3.5 items-center mt-auto ${isSubmitting ? "opacity-50" : ""}`}
        onPress={() => logout()}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator className="text-white" />
        ) : (
          <Text className="text-white text-base font-semibold">Log out</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-[#888] uppercase mb-0.5">{label}</Text>
      <Text className="text-[15px] text-[#111]">{value}</Text>
    </View>
  );
}
