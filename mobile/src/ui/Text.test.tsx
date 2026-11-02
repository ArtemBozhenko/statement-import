import { render, screen } from '@testing-library/react-native';

import { fontScaleCap } from '@/theme/tokens';

import { Text } from './Text';

describe('Text', () => {
  it('caps the system font scale at the shared token', async () => {
    await render(<Text testID="t">Hello</Text>);
    expect(screen.getByTestId('t').props.maxFontSizeMultiplier).toBe(fontScaleCap);
  });

  it('lets a caller tighten the cap further', async () => {
    await render(
      <Text testID="t" maxFontSizeMultiplier={1.2}>
        Hello
      </Text>,
    );
    expect(screen.getByTestId('t').props.maxFontSizeMultiplier).toBe(1.2);
  });
});
