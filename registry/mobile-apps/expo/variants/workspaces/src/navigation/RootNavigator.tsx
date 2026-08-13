import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList, AuthStackParamList, WorkspaceGateStackParamList } from "./types";
import { useAuthStore, useIsAuthenticated } from "../store/authStore";
import { useActiveWorkspaceId } from "../workspace/activeWorkspace";
import { LoginScreen } from "../screens/LoginScreen";
import { SignupScreen } from "../screens/SignupScreen";
import { TwoFactorScreen } from "../screens/TwoFactorScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SessionsScreen } from "../screens/SessionsScreen";
import { WorkspaceSelectScreen } from "../screens/WorkspaceSelectScreen";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const WorkspaceGateStack = createNativeStackNavigator<WorkspaceGateStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Module-scope wrappers rather than inline arrows so the screen component identity is stable
// across renders and React Navigation doesn't remount the screen on every parent render.
const ChooseWorkspace = () => <WorkspaceSelectScreen mode="gate" />;
const SwitchWorkspace = () => <WorkspaceSelectScreen mode="switch" />;

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="TwoFactor" component={TwoFactorScreen} options={{ headerShown: true, title: "Verify" }} />
    </AuthStack.Navigator>
  );
}

function WorkspaceGateNavigator() {
  return (
    <WorkspaceGateStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkspaceGateStack.Screen name="ChooseWorkspace" component={ChooseWorkspace} />
    </WorkspaceGateStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator>
      <AppStack.Screen name="Home" component={HomeScreen} options={{ title: "Profile" }} />
      <AppStack.Screen name="Sessions" component={SessionsScreen} options={{ title: "Sessions" }} />
      <AppStack.Screen name="SwitchWorkspace" component={SwitchWorkspace} options={{ title: "Workspaces" }} />
    </AppStack.Navigator>
  );
}

/**
 * Standard React Navigation "auth flow" pattern, with one extra gate: the whole navigator is
 * swapped based on state rather than navigated between, so there's no way to back-swipe from
 * Home into the auth screens (or vice versa), and no way to reach the app while no workspace is
 * active. That last one matters — every workspace-scoped call would otherwise go out with no
 * `X-Workspace-Id` and be refused.
 */
export function RootNavigator() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const isAuthenticated = useIsAuthenticated();
  const activeWorkspaceId = useActiveWorkspaceId();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!isAuthenticated ? <AuthNavigator /> : activeWorkspaceId ? <AppNavigator /> : <WorkspaceGateNavigator />}
    </NavigationContainer>
  );
}
