import { Platform } from 'react-native';

/** Design tokens: only what is actually used on the screens. Light and dark palettes. */
export type ColorScheme = 'light' | 'dark';

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    border: '#D9DDE3',
    text: '#121417',
    textMuted: '#4F5862',
    accent: '#1F5EFF',
    onAccent: '#FFFFFF',
    success: '#167A3D',
    warning: '#9A5B00',
    danger: '#B3261E',
  },
  dark: {
    background: '#0F1216',
    surface: '#171B21',
    border: '#2E353F',
    text: '#F2F4F7',
    textMuted: '#A6AEB8',
    accent: '#6D9BFF',
    onAccent: '#FFFFFF',
    success: '#5CC489',
    warning: '#E0A94D',
    danger: '#FF7B72',
  },
};

export const spacing = { sm: 8, md: 12, lg: 16 } as const;
export const radius = 12;
/** Minimum tap target per both platforms' guidelines. */
export const hitTarget = 44;
/** Upper bound for the system font scale applied to app text (see `ui/Text`). 1.6 keeps the status card and its buttons on one small screen. */
export const fontScaleCap = 1.6;

/** Sizes at scale 1.0; `Text` multiplies them by the system font scale itself. */
export const typeScale = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '400', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
} as const;
