import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export function FormInput({
  label,
  ...rest
}: TextInputProps & { label: string }) {
  return (
    <View className="mb-4">
      <Text className="text-[13px] font-semibold text-[#444] mb-1.5">
        {label}
      </Text>
      <TextInput
        className="border border-[#ccc] rounded-lg px-3 py-2.5 text-base"
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#8a8a8a"
        {...rest}
      />
    </View>
  );
}

const variants = {
  primary: { box: 'bg-blue-600', text: 'text-white' },
  outline: { box: 'border border-blue-600', text: 'text-blue-600' },
  danger: { box: 'bg-red-600', text: 'text-white' },
} as const;

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: keyof typeof variants;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      className={`${variants[variant].box} rounded-lg py-3.5 items-center mb-3 ${inactive ? 'opacity-50' : ''}`}
      onPress={onPress}
      disabled={inactive}
    >
      {loading ? (
        <ActivityIndicator className={variants[variant].text} />
      ) : (
        <Text className={`${variants[variant].text} text-base font-semibold`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
