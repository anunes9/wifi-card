import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/* false during the static pre-render and the hydration pass, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
