import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/Text';

/** The app's only button. Busy state is shown with an indicator in place of the label. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, busy = false, testID }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || busy;
  const bg = variant === 'primary' ? theme.colors.accent : variant === 'danger' ? theme.colors.danger : theme.colors.surface;
  const fg = variant === 'secondary' ? theme.colors.text : theme.colors.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.hitTarget,
          borderRadius: theme.radius,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? theme.colors.border : 'transparent',
          opacity: pressed || (inactive && !busy) ? 0.6 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[theme.type.bodyStrong, styles.label, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  label: { textAlign: 'center' },
});
