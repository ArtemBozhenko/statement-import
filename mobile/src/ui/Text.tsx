import { Text as NativeText, type TextProps } from 'react-native';

import { fontScaleCap } from '@/theme/tokens';

/**
 * The app's Text: system font scaling is honoured up to `fontScaleCap`. Beyond that the layout
 * (one-screen status card, action buttons) would stop fitting on a small phone, so the cap keeps
 * the main actions reachable at the largest accessibility sizes while still growing the type by up to 60 %.
 */
export function Text(props: TextProps) {
  return <NativeText maxFontSizeMultiplier={fontScaleCap} {...props} />;
}
