import { TextInput, View, Text, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps & { className?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-sgvu-navy">{label}</Text>
      <TextInput
        placeholderTextColor="#94a3b8"
        className={`rounded-xl border border-sgvu-navy/15 bg-white px-4 py-3 text-base text-sgvu-navy ${error ? 'border-red-500' : ''} ${className ?? ''}`}
        {...props}
      />
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
