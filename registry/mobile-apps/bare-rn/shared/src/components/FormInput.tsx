import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface FormInputProps extends TextInputProps {
  label: string;
}

export function FormInput({ label, className, ...rest }: FormInputProps): React.JSX.Element {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[13px] font-semibold text-[#333333]">{label}</Text>
      <TextInput
        className={`rounded-lg border border-[#cccccc] px-3 py-2.5 text-base ${className ?? ''}`}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#8a8a8a"
        {...rest}
      />
    </View>
  );
}
