import { renderHook } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { palettes } from './tokens';
import { resolveTheme, useTheme } from './useTheme';

describe('theme', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves dark palette when the system scheme is dark', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors).toBe(palettes.dark);
  });

  it('falls back to light when the scheme is unknown', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(null);
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
  });

  it('both palettes define every color token', () => {
    const lightKeys = Object.keys(palettes.light).sort();
    const darkKeys = Object.keys(palettes.dark).sort();
    expect(darkKeys).toEqual(lightKeys);
    for (const scheme of ['light', 'dark'] as const) {
      for (const value of Object.values(resolveTheme(scheme).colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
