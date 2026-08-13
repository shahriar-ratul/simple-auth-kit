import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList, AuthStackParamList } from "./types";
import { useAuthStore, useIsAuthenticated } from "../store/authStore";
import { LoginScreen } from "../screens/LoginScreen";
import { SignupScreen } from "../screens/SignupScreen";
import { TwoFactorScreen } from "../screens/TwoFactorScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SessionsScreen } from "../screens/SessionsScreen";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="TwoFactor" component={TwoFactorScreen} options={{ headerShown: true, title: "Verify" }} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator>
      <AppStack.Screen name="Home" component={HomeScreen} options={{ title: "Profile" }} />
      <AppStack.Screen name="Sessions" component={SessionsScreen} options={{ title: "Sessions" }} />
    </AppStack.Navigator>
  );
}

/**
 * Standard React Navigation "auth flow" pattern: the whole navigator is swapped
 * based on auth state rather than navigating between stacks, so there's no way to
 * back-swipe from Home into the auth screens after logging in (or vice versa).
 */
export function RootNavigator() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const isAuthenticated = useIsAuthenticated();

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

  return <NavigationContainer>{isAuthenticated ? <AppNavigator /> : <AuthNavigator />}</NavigationContainer>;
}
