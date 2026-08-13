import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { WorkspaceSummary } from '@easy-auth/auth-client';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useActiveWorkspaceId } from '../workspace/activeWorkspace';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * `"gate"` is the post-login stop when no workspace is active — it cannot be dismissed, and
 * offers logging out as the only way past without choosing. `"switch"` is the same screen
 * pushed from Home to change workspaces, and pops back once one is chosen.
 */
export type WorkspaceSelectMode = 'gate' | 'switch';

export function WorkspaceSelectScreen({ mode }: { mode: WorkspaceSelectMode }): React.JSX.Element {
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

  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    // The list is normally already loaded by the auth flow; refresh it anyway so a workspace
    // added on another device shows up without a relaunch.
    load().catch(() => {
      // Surfaced through the store's `error`, rendered below.
    });
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
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
        if (mode === 'switch') navigation.goBack();
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
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 p-6">
      <Text className="mb-2 text-[13px] text-[#666666]">
        Your roles are per workspace — a request acts in exactly one, named by the{' '}
        <Text className="font-semibold">X-Workspace-Id</Text> header.
      </Text>

      {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className="mb-2 text-sm text-[#666666]">
            You're not a member of any workspace yet. Create the first one below — you'll be its admin.
          </Text>
        }
        renderItem={({ item }) => (
          <WorkspaceRow
            workspace={item}
            isActive={item.id === activeWorkspaceId}
            disabled={busy}
            onPress={() => void activate(() => select(item.id))}
          />
        )}
      />

      <View className="mt-4 border-t border-[#eeeeee] pt-4">
        <FormInput
          label="New workspace"
          value={name}
          onChangeText={(text) => {
            clearError();
            setName(text);
          }}
          autoCapitalize="words"
          placeholder="Acme"
        />
        <PrimaryButton
          title="Create workspace"
          onPress={() => {
            const created = trimmedName;
            setName('');
            void activate(() => create(created));
          }}
          loading={busy}
          disabled={!canCreate}
        />
      </View>

      {mode === 'gate' ? (
        <PrimaryButton title="Log out" variant="secondary" onPress={() => void logout()} disabled={busy} />
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
}): React.JSX.Element {
  return (
    <Pressable
      className={`mb-2.5 rounded-[10px] border p-3 ${isActive ? 'border-blue-600 bg-blue-50' : 'border-[#eeeeee]'} ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
      disabled={disabled}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold">{workspace.name}</Text>
        {isActive ? <Text className="text-xs font-semibold text-blue-600">ACTIVE</Text> : null}
      </View>
      <Text className="mt-1 text-xs text-[#666666]">Your roles: {workspace.roles.length ? workspace.roles.join(', ') : '—'}</Text>
      <Text className="mt-0.5 text-xs text-[#888888]">{workspace.id}</Text>
    </Pressable>
  );
}
