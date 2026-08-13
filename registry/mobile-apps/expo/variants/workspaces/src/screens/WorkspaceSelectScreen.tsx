import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { WorkspaceSummary } from "@easy-auth/auth-client";
import { useActiveWorkspaceId } from "../workspace/activeWorkspace";
import { useAuthStore } from "../store/authStore";
import { useWorkspaceStore } from "../store/workspaceStore";

/**
 * `"gate"` is the post-login stop when no workspace is active — it cannot be dismissed, and
 * offers logging out as the only way past without choosing. `"switch"` is the same screen
 * pushed from Home to change workspaces, and pops back once one is chosen.
 */
export type WorkspaceSelectMode = "gate" | "switch";

export function WorkspaceSelectScreen({ mode }: { mode: WorkspaceSelectMode }) {
  const navigation = useNavigation();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const isSubmitting = useWorkspaceStore((state) => state.isSubmitting);
  const error = useWorkspaceStore((state) => state.error);
  const clearError = useWorkspaceStore((state) => state.clearError);
  const load = useWorkspaceStore((state) => state.load);
  const select = useWorkspaceStore((state) => state.select);
  const create = useWorkspaceStore((state) => state.create);
  const activeWorkspaceId = useActiveWorkspaceId();
  const refreshCurrentUser = useAuthStore((state) => state.refreshCurrentUser);
  const logout = useAuthStore((state) => state.logout);

  const [name, setName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    // The list is normally already loaded by the auth flow; refresh it anyway so a workspace
    // added on another device shows up without a relaunch.
    load().catch(() => {
      // Surfaced through the store's `error`, rendered below.
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      // Same as above.
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /**
   * The workspace switch and the identity refresh are one user-visible step: `me()` answers
   * with the roles and permissions of *the workspace named on the request*, so re-fetching it
   * is what makes the app's idea of "what I may do here" match the server's.
   */
  const activate = useCallback(
    async (activation: () => Promise<unknown>) => {
      setIsActivating(true);
      try {
        await activation();
        await refreshCurrentUser();
        if (mode === "switch") navigation.goBack();
      } catch {
        // Store-level error already recorded and rendered.
      } finally {
        setIsActivating(false);
      }
    },
    [mode, navigation, refreshCurrentUser],
  );

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && !isSubmitting && !isActivating;
  const busy = isSubmitting || isActivating;

  if (isLoading && workspaces.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 p-6 bg-white">
      <Text className="text-[28px] font-bold mb-2">{mode === "gate" ? "Choose a workspace" : "Switch workspace"}</Text>
      <Text className="text-[13px] text-[#666] mb-4">
        Your roles are per workspace — a request acts in exactly one, named by the{" "}
        <Text className="font-semibold">X-Workspace-Id</Text> header.
      </Text>

      {error ? <Text className="text-[#c0392b] mb-3">{error}</Text> : null}

      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className="text-sm text-[#666] mb-2">
            You're not a member of any workspace yet. Create the first one below — you'll be its admin.
          </Text>
        }
        renderItem={({ item }) => (
          <WorkspaceRow
            workspace={item}
            isActive={item.id === activeWorkspaceId}
            disabled={busy}
            onPress={() => activate(() => select(item.id))}
          />
        )}
      />

      <View className="border-t border-[#eee] pt-4 mt-4">
        <Text className="text-[13px] font-semibold text-[#444] mb-1.5">New workspace</Text>
        <TextInput
          className="border border-[#ccc] rounded-lg px-3 py-2.5 text-base"
          value={name}
          onChangeText={(text) => {
            clearError();
            setName(text);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="Acme"
        />
        <Pressable
          className={`bg-blue-600 rounded-lg py-3.5 items-center mt-3 ${!canCreate ? "opacity-50" : ""}`}
          onPress={() => {
            const created = trimmedName;
            setName("");
            return activate(() => create(created));
          }}
          disabled={!canCreate}
        >
          {busy ? <ActivityIndicator className="text-white" /> : <Text className="text-white text-base font-semibold">Create workspace</Text>}
        </Pressable>
      </View>

      {mode === "gate" ? (
        <Pressable className="mt-4 items-center" onPress={() => logout()} disabled={busy}>
          <Text className="text-[#c0392b] text-sm">Log out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function WorkspaceRow({
  workspace,
  isActive,
  disabled,
  onPress,
}: {
  workspace: WorkspaceSummary;
  isActive: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`border rounded-[10px] p-3 mb-2.5 ${isActive ? "border-blue-600 bg-blue-50" : "border-[#eee]"} ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
      disabled={disabled}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold">{workspace.name}</Text>
        {isActive ? <Text className="text-xs font-semibold text-blue-600">ACTIVE</Text> : null}
      </View>
      <Text className="text-xs text-[#666] mt-1">Your roles: {workspace.roles.length ? workspace.roles.join(", ") : "—"}</Text>
      <Text className="text-xs text-[#888] mt-0.5">{workspace.id}</Text>
    </Pressable>
  );
}
