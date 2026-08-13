import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useAuthStore((state) => state.login);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    try {
      const result = await login({ identifier: email.trim(), password });
      if (result.twoFactorRequired) {
        navigation.navigate("TwoFactor");
      }
      // On plain success, RootNavigator swaps to the app stack automatically
      // because `currentUser` becomes non-null — nothing to navigate to here.
    } catch {
      // Error is surfaced via the store's `error` field, rendered below.
    }
  }

  return (
    <View className="flex-1 justify-center p-6 bg-white">
      <Text className="text-[28px] font-bold mb-6">Log in</Text>

      <Text className="text-[13px] font-semibold text-[#444] mb-1.5 mt-3">Email</Text>
      <TextInput
        className="border border-[#ccc] rounded-lg px-3 py-2.5 text-base"
        value={email}
        onChangeText={(text) => {
          clearError();
          setEmail(text);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
      />

      <Text className="text-[13px] font-semibold text-[#444] mb-1.5 mt-3">Password</Text>
      <TextInput
        className="border border-[#ccc] rounded-lg px-3 py-2.5 text-base"
        value={password}
        onChangeText={(text) => {
          clearError();
          setPassword(text);
        }}
        secureTextEntry
        placeholder="••••••••"
      />

      {error ? <Text className="text-[#c0392b] mt-4">{error}</Text> : null}

      <Pressable
        className={`bg-blue-600 rounded-lg py-3.5 items-center mt-6 ${!canSubmit ? "opacity-50" : ""}`}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <ActivityIndicator className="text-white" />
        ) : (
          <Text className="text-white text-base font-semibold">Log in</Text>
        )}
      </Pressable>

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate("Signup")}>
        <Text className="text-blue-600 text-sm">Need an account? Sign up</Text>
      </Pressable>
    </View>
  );
}
