import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { getAppImport } from '@/import/appController';
import { useTheme } from '@/theme';

// Started at module load, before the first render: the record itself is read synchronously inside
// `hydrate`, so the first frame already shows the stored operation instead of flashing the empty
// state; only the network follow-up (GET by key / polling) is asynchronous.
void getAppImport().start();

export default function RootLayout() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Statement Import' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
        <Stack.Screen name="charge/[id]" options={{ title: 'Recurring charge', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
