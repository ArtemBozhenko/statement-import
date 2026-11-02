import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

/** Surface with a border and rounded corners. */
export function Card({ style, children, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View {...rest} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius, padding: theme.spacing.lg, gap: theme.spacing.sm }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ card: { borderWidth: StyleSheet.hairlineWidth } });
