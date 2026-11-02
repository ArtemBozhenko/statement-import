import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Operation } from '@/import/types';

import { StatusPanel } from './StatusPanel';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const result = {
  currency: 'AUD',
  items: [
    { id: 'rec-001', merchant: 'StreamBeam', amountMinor: 1999, cadence: 'monthly', lastSeen: '2026-10-01' },
    { id: 'rec-002', merchant: 'BrightGrid', amountMinor: 13200, cadence: 'monthly', lastSeen: '2026-10-03' },
  ],
};

function op(extra: Partial<Operation>): Operation {
  return {
    key: 'k',
    deleteKey: null,
    file: { displayName: 'statement.pdf', sizeBytes: 33882, format: 'pdf' },
    localCopyUri: null,
    status: 'uploading',
    jobId: 'job-1',
    revision: 1,
    result: null,
    error: null,
    offline: false,
    ...extra,
  };
}

async function renderPanel(extra: Partial<Operation>, pendingAction: Parameters<typeof StatusPanel>[0]['pendingAction'] = null) {
  const onAction = jest.fn();
  const onDetails = jest.fn();
  await render(<StatusPanel operation={op(extra)} pendingAction={pendingAction} onAction={onAction} onDetails={onDetails} />);
  return Object.assign(onAction, { onDetails });
}

describe('StatusPanel', () => {
  it('shows the file meta and a queued status without claiming readiness or exposing the jobId', async () => {
    await renderPanel({ status: 'queued' });
    expect(screen.getByText('statement.pdf')).toBeTruthy();
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.queryByText(/ready/i)).toBeNull();
    expect(screen.queryByText('job-1')).toBeNull();
  });

  it('renders the recurring charges and the 151.99 AUD monthly total when ready', async () => {
    await renderPanel({ status: 'ready', revision: 3, result });
    expect(screen.getByText('Report ready')).toBeTruthy();
    expect(screen.getByText('StreamBeam')).toBeTruthy();
    expect(screen.getByText('BrightGrid')).toBeTruthy();
    expect(screen.getByTestId('recurring-total')).toHaveTextContent('151.99 AUD');
  });

  it('offers a Details button per charge and reports the charge id', async () => {
    const { onDetails } = await renderPanel({ status: 'ready', revision: 3, result });
    expect(screen.getByTestId('details-rec-001')).toBeTruthy();
    fireEvent.press(screen.getByTestId('details-rec-002'));
    expect(onDetails).toHaveBeenCalledWith('rec-002');
  });

  it('offers a manual retry for an unconfirmed upload and forwards the action', async () => {
    const onAction = await renderPanel({ status: 'error', jobId: null, error: { reason: 'upload_unconfirmed', httpStatus: null } });
    expect(screen.getByText('Upload not confirmed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('action-retry_upload'));
    expect(onAction).toHaveBeenCalledWith('retry_upload');
  });

  it('shows deleting as unconfirmed: no "deleted" claim, no delete button, only the start-over exit', async () => {
    await renderPanel({ status: 'deleting', revision: 4 });
    expect(screen.getByText('Deleting…')).toBeTruthy();
    expect(screen.queryByText(/Import deleted/)).toBeNull();
    expect(screen.queryByTestId('action-delete')).toBeNull();
    expect(screen.getByTestId('action-start_over')).toBeTruthy();
  });

  it('shows delete failure with a retry and says the data is still on the server', async () => {
    await renderPanel({ status: 'error', revision: 3, error: { reason: 'delete_failed', httpStatus: 503 } });
    expect(screen.getByText(/still on the server/)).toBeTruthy();
    expect(screen.getByTestId('action-retry_delete')).toBeTruthy();
  });

  it('says "deleted" only once the server confirmed it and offers a new import', async () => {
    await renderPanel({ status: 'deleted', revision: 5 });
    expect(screen.getByText('Import deleted')).toBeTruthy();
    expect(screen.getByTestId('action-start_over')).toBeTruthy();
  });

  it('disables the other actions while one is pending', async () => {
    await renderPanel({ status: 'ready', revision: 3, result }, 'delete');
    expect(screen.getByTestId('action-start_over')).toBeDisabled();
    expect(screen.getByTestId('action-delete')).toBeBusy();
  });
});
