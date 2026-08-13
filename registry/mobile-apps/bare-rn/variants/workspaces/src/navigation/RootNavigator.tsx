import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useActiveWorkspaceId } from '../workspace/activeWorkspace';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { TwoFactorScreen } from '../screens/TwoFactorScreen';
import { WorkspaceSelectScreen } from '../screens/WorkspaceSelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SessionsScreen } from '../screens/SessionsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Module-scope wrappers rather than inline arrows so the screen component identity is stable
// across renders and React Navigation doesn't remount the screen on every parent render.
const ChooseWorkspace = () => <WorkspaceSelectScreen mode="gate" />;
const SwitchWorkspace = () => <WorkspaceSelectScreen mode="switch" />;

export function RootNavigator(): React.JSX.Element {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.currentUser !== null);
  const hydrate = useAuthStore((s) => s.hydrate);
  const activeWorkspaceId = useActiveWorkspaceId();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log in' }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create account' }} />
            <Stack.Screen name="TwoFactor" component={TwoFactorScreen} options={{ title: 'Verification code' }} />
          </>
        ) : !activeWorkspaceId ? (
          // Authenticated but no workspace chosen yet: the only screen reachable is the
          // gate. Every workspace-scoped call would otherwise go out with no
          // `X-Workspace-Id` and be refused.
          <Stack.Screen name="ChooseWorkspace" component={ChooseWorkspace} options={{ title: 'Choose a workspace' }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Profile' }} />
            <Stack.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Sessions' }} />
            <Stack.Screen name="SwitchWorkspace" component={SwitchWorkspace} options={{ title: 'Workspaces' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
