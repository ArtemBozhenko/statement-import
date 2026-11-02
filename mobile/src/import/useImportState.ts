import { useEffect, useState } from 'react';

import { getAppImport } from './appController';
import type { ImportState } from './types';

/** UI subscription to the controller state. `start()` runs at module load in the root layout, so the
 * record is already hydrated when the first render reads `getState()`. */
export function useImportState(): ImportState {
  const { controller } = getAppImport();
  const [state, setState] = useState<ImportState>(() => controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}
