"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

// Allow undefined in nested structures because application state often contains it.
// When serialized with JSON.stringify, undefined values are omitted which is acceptable for UI state.
export type LooseJson =
  | string
  | number
  | boolean
  | null
  | undefined
  | LooseJson[]
  | { [key: string]: LooseJson };

type StoredValue<T> = {
  v: number;
  data: T;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getLocalStorage(): Storage | null {
  return isBrowser() ? window.localStorage : null;
}

export function createNamespacedStorage(namespace: string) {
  const storage = getLocalStorage();
  const prefix = `ai-platform:${namespace}:`;

  function fullKey(key: string): string {
    return `${prefix}${key}`;
  }

  return {
    get<T extends LooseJson>(key: string, fallback: T | null = null): T | null {
      try {
        const s = storage?.getItem(fullKey(key));
        if (!s) return fallback;
        return JSON.parse(s) as T;
      } catch {
        return fallback;
      }
    },
    set<T extends LooseJson>(key: string, value: T): void {
      try {
        storage?.setItem(fullKey(key), JSON.stringify(value));
      } catch {
        // ignore quota errors
      }
    },
    remove(key: string): void {
      try {
        storage?.removeItem(fullKey(key));
      } catch {
        // ignore
      }
    },
    clear(): void {
      if (!storage) return;
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) storage.removeItem(k);
    },
  };
}

export function usePersistentState<T extends LooseJson>(
  key: string,
  initialValue: T,
  options?: { namespace?: string; version?: number; debounceMs?: number }
): [T, Dispatch<SetStateAction<T>>, { clear: () => void }] {
  const namespace = options?.namespace ?? 'default';
  const version = options?.version ?? 1;
  const debounceMs = options?.debounceMs ?? 150;
  const store = createNamespacedStorage(namespace);
  const [state, setState] = useState<T>(() => {
    const raw = store.get<StoredValue<T>>(key, null);
    if (raw && typeof raw === 'object' && raw !== null && 'v' in raw && (raw as StoredValue<T>).v === version) {
      return (raw as StoredValue<T>).data;
    }
    return initialValue;
  });

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isBrowser()) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const wrapped: StoredValue<T> = { v: version, data: state };
      store.set(key, wrapped as unknown as LooseJson);
    }, debounceMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state, key, version, debounceMs]);

  function clear() {
    store.remove(key);
    setState(initialValue);
  }

  return [state, setState, { clear }];
}


