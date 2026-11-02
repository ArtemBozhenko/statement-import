import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConfirmCard } from './ConfirmCard';

const meta = { displayName: 'statement.pdf', sizeBytes: 33882, format: 'pdf' as const };

describe('ConfirmCard', () => {
  it('shows name, size and format and says nothing was sent', async () => {
    await render(<ConfirmCard meta={meta} onSend={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('confirm-name')).toHaveTextContent('statement.pdf');
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText('33.1 KB')).toBeTruthy();
    expect(screen.getByText('Nothing has been sent yet.')).toBeTruthy();
  });

  it('Send and Cancel call their callbacks', async () => {
    const onSend = jest.fn();
    const onCancel = jest.fn();
    await render(<ConfirmCard meta={meta} onSend={onSend} onCancel={onCancel} />);
    await fireEvent.press(screen.getByTestId('confirm-send'));
    expect(onSend).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('confirm-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks both buttons while sending', async () => {
    await render(<ConfirmCard meta={meta} busy onSend={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('confirm-send')).toBeBusy();
    expect(screen.getByTestId('confirm-cancel')).toBeDisabled();
  });
});
