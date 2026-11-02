import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import type { AcquireResult } from '@/files/pipeline';
import { getAppImport } from '@/import/appController';
import type { PreparedStatement } from '@/import/controller';
import type { ImportAction } from '@/import/presentation';
import { useImportState } from '@/import/useImportState';
import { useTheme } from '@/theme';
import { Banner, Button, Card, Screen } from '@/ui';
import { ConfirmCard } from '@/ui/import/ConfirmCard';
import { StatusPanel } from '@/ui/import/StatusPanel';
import { Text } from '@/ui/Text';

type Rejection = Extract<AcquireResult, { kind: 'rejected' }>;

/**
 * The only screen. Without an operation: file selection (a rejected file is shown with the reason),
 * then a confirmation card (name, size, format) with an explicit Send or Cancel;
 * with an operation: its state (after a restart the real job is shown without re-submitting).
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useImportState();
  const [picking, setPicking] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  // Screen-only state: the validated copy waiting for the user's Send. Not persisted on purpose:
  // if the app dies here, no operation holds the copy and the startup sweep removes it.
  const [pending, setPending] = useState<PreparedStatement | null>(null);
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<ImportAction | null>(null);

  const choose = useCallback(async () => {
    setPicking(true);
    setRejection(null);
    try {
      const result = await getAppImport().acquire();
      if (result.kind === 'rejected') setRejection(result);
      // The file passed local validation: show it and wait for an explicit Send. Nothing is sent yet.
      if (result.kind === 'accepted') setPending(result.prepared);
    } catch {
      Alert.alert('Could not read the file', 'Please try another file.');
    } finally {
      setPicking(false);
    }
  }, []);

  const send = useCallback(async () => {
    if (!pending) return;
    setSending(true);
    try {
      await getAppImport().controller.beginUpload(pending);
      setPending(null);
    } catch {
      Alert.alert('Could not start the upload', 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [pending]);

  const cancel = useCallback(() => {
    if (!pending) return;
    getAppImport().discard(pending);
    setPending(null);
  }, [pending]);

  const run = useCallback(async (action: ImportAction, job: () => Promise<void>) => {
    setPendingAction(action);
    try {
      await job();
    } finally {
      setPendingAction(null);
    }
  }, []);

  const onAction = useCallback(
    (action: ImportAction) => {
      const { controller } = getAppImport();
      switch (action) {
        case 'retry_upload':
          return void run(action, () => controller.retryUpload());
        case 'retry_delete':
          return void run(action, () => controller.requestDelete());
        case 'start_over':
          return void run(action, () => controller.startOver());
        case 'delete':
          // Deletion is irreversible on the server, so ask explicitly.
          Alert.alert('Delete this import?', 'The server will remove the statement job and its result. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void run(action, () => controller.requestDelete()) },
          ]);
      }
    },
    [run],
  );

  const onDetails = useCallback((id: string) => router.push({ pathname: '/charge/[id]', params: { id } }), [router]);

  return (
    <Screen testID="home-screen">
      {state ? (
        <StatusPanel operation={state} pendingAction={pendingAction} onAction={onAction} onDetails={onDetails} />
      ) : pending ? (
        <ConfirmCard meta={pending.meta} busy={sending} onSend={() => void send()} onCancel={cancel} />
      ) : (
        <>
          <Card>
            <Text style={[theme.type.title, { color: theme.colors.text }]} accessibilityRole="header">
              Import a bank statement
            </Text>
            <Text style={[theme.type.body, { color: theme.colors.textMuted }]}>
              Choose a PDF or CSV statement up to 10 MB.
            </Text>
          </Card>
          {rejection ? <Banner tone="danger" title={rejectionTitle(rejection)} body={rejectionBody(rejection)} testID="rejection-banner" /> : null}
          <Button label="Choose a statement" onPress={() => void choose()} busy={picking} testID="choose-statement" />
        </>
      )}
      {__DEV__ ? <Button label="Diagnostics" variant="secondary" onPress={() => router.push('/diagnostics')} testID="open-diagnostics" /> : null}
    </Screen>
  );
}

function rejectionTitle(r: Rejection): string {
  return r.reason === 'too_large' ? 'File is too large' : 'Unsupported file';
}

// Error text follows the "what happened → what to do" pattern: no bytes, codes or explanations of the mechanics.
function rejectionBody(r: Rejection): string {
  if (r.reason === 'too_large') {
    return r.sizeBytes === null ? 'The file size couldn’t be read. Choose another file.' : 'Choose a statement under 10 MB.';
  }
  return 'Choose a PDF or CSV bank statement.';
}
