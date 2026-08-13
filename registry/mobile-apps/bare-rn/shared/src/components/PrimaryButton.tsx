import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

const variantBg: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
  primary: 'bg-blue-600',
  secondary: 'bg-gray-200',
  danger: 'bg-red-600',
};

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: PrimaryButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={[
        'mb-3 items-center justify-center rounded-lg py-3.5',
        variantBg[variant],
        isDisabled ? 'opacity-50' : 'active:opacity-[0.85]',
      ].join(' ')}
    >
      {loading ? (
        <ActivityIndicator className={isSecondary ? 'text-gray-800' : 'text-white'} />
      ) : (
        <Text className={`text-base font-semibold ${isSecondary ? 'text-gray-800' : 'text-white'}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
