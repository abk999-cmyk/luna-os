import { useEffect, useRef, useCallback } from 'react';
import { subscribe } from './SyncManager';

/**
 * React hook to subscribe to sync topic updates.
 * Automatically unsubscribes on unmount.
 */
export function useSubscription(topic: string, callback: (payload: any) => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableCallback = useCallback((payload: any) => {
    callbackRef.current(payload);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(topic, stableCallback);
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
}
