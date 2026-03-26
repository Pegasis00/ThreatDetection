import { useSyncExternalStore } from 'react';
import { getRuntimeSnapshot, subscribeRuntimeChanges } from '../utils/runtime';

export function useRuntimeSignal() {
  return useSyncExternalStore(subscribeRuntimeChanges, getRuntimeSnapshot, () => 0);
}
