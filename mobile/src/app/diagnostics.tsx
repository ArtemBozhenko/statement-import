import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { createMockControl, SCENARIOS, type MockState } from '@/diagnostics/mockControl';
import { getAppImport } from '@/import/appController';
import { API_BASE_URL } from '@/import/config';
import { useImportState } from '@/import/useImportState';
import { useTheme } from '@/theme';
import { Button, Card, KeyValueRow, Screen } from '@/ui';
import { Text } from '@/ui/Text';

/** Screen for the reviewer (dev builds only): mock address, scenario, reset, `/__test/state` counters. */
const control = createMockControl(() => API_BASE_URL);

export default function DiagnosticsScreen() {
  const theme = useTheme();
  const { controller } = getAppImport();
  const operation = useImportState();
  const [mock, setMock] = useState<MockState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setMock(await control.state());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    }
  };

  // Once when the screen opens.
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);

  const act = (job: () => Promise<void>) => async () => {
    try {
      await job();
      await refresh();
    } catch (e) {
      Alert.alert('Request failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen testID="diagnostics-screen">
      <Card>
        <Text style={[theme.type.heading, { color: theme.colors.text }]}>Mock API</Text>
        <KeyValueRow label="address" value={API_BASE_URL} mono />
        <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>Fixed at build time via EXPO_PUBLIC_API_URL (see README).</Text>
      </Card>

      <Card>
        <Text style={[theme.type.heading, { color: theme.colors.text }]}>Scenario</Text>
        <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
          {SCENARIOS.map((mode) => (
            <Button key={mode} label={mode} variant={mock?.mode === mode ? 'primary' : 'secondary'} onPress={() => void act(() => control.setScenario(mode))()} testID={`scenario-${mode}`} />
          ))}
        </View>
        <Button label="Reset mock state" variant="danger" onPress={() => void act(() => control.reset())()} testID="reset-mock" />
      </Card>

      <Card testID="mock-counters">
        <Text style={[theme.type.heading, { color: theme.colors.text }]}>Mock counters</Text>
        {error ? <Text style={[theme.type.caption, { color: theme.colors.danger }]}>Mock not reachable: {error}</Text> : null}
        {(['createRequests', 'newJobs', 'duplicateHits', 'acceptedBytes', 'deleteRequests'] as const).map((name) => (
          <KeyValueRow key={name} label={name} value={String(mock?.stats[name] ?? '—')} mono />
        ))}
        {mock?.jobs.map((job) => <KeyValueRow key={job.jobId} label={job.jobId} value={`${job.status} · rev ${job.revision}`} mono />)}
        <Button label="Refresh counters" variant="secondary" onPress={() => void refresh()} />
      </Card>

      <Card testID="operation-internals">
        <Text style={[theme.type.heading, { color: theme.colors.text }]}>Current operation</Text>
        {operation ? (
          <>
            <KeyValueRow label="status" value={operation.status} mono />
            <KeyValueRow label="jobId" value={operation.jobId ?? '—'} mono />
            <KeyValueRow label="revision" value={String(operation.revision)} mono />
            <KeyValueRow label="idempotency key" value={operation.key} mono />
            <KeyValueRow label="delete key" value={operation.deleteKey ?? '—'} mono />
          </>
        ) : (
          <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>No operation persisted.</Text>
        )}
        <Button label="Start over (clear local state)" variant="secondary" onPress={() => void controller.startOver()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
