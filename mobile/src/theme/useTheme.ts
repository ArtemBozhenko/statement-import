import { useColorScheme } from 'react-native';

import { hitTarget, palettes, radius, spacing, typeScale, type ColorScheme, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: number;
  type: typeof typeScale;
  hitTarget: number;
}

export function resolveTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: palettes[scheme], spacing, radius, type: typeScale, hitTarget };
}

/** Theme for the current system color scheme; light by default. */
export function useTheme(): Theme {
  return resolveTheme(useColorScheme() === 'dark' ? 'dark' : 'light');
}
