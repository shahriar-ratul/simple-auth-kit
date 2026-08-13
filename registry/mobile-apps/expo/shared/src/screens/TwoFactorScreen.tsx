import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useAuthStore } from "../store/authStore";

export function TwoFactorScreen() {
  const [code, setCode] = useState("");
  const loginTwoFactor = useAuthStore((state) => state.loginTwoFactor);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const canSubmit = code.trim().length > 0 && !isSubmitting;

  async function handleSubmit() {
    try {
      await loginTwoFactor(code.trim());
      // RootNavigator swaps to the app stack once `currentUser` is set.
    } catch {
      // Error surfaced via the store's `error` field, rendered below.
    }
  }

  return (
    <View className="flex-1 justify-center p-6 bg-white">
      <Text className="text-2xl font-bold mb-2">Enter your 2FA code</Text>
      <Text className="text-[13px] text-[#666] mb-6">
        Open your authenticator app and enter the current code.
      </Text>

      <TextInput
        className="border border-[#ccc] rounded-lg px-3 py-2.5 text-xl tracking-[4px] text-center"
        value={code}
        onChangeText={(text) => {
          clearError();
          setCode(text);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="number-pad"
        placeholder="123456"
        maxLength={10}
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
          <Text className="text-white text-base font-semibold">Verify</Text>
        )}
      </Pressable>
    </View>
  );
}
