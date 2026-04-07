import { useMemo } from "react";

/**
 * Lazily resolves an imperative value on first read and keeps it until the
 * owning component invalidates it. Child hooks can depend on LazyRefHandle when
 * they should read the value without controlling the cache policy.
 */
export type LazyRefHandle<T> = {
  get: () => T;
};

export type LazyRef<T> = LazyRefHandle<T> & {
  readonly current: T | null;
  invalidate: () => void;
};

export function useLazyRef<T>(resolve: () => T): LazyRef<T> {
  return useMemo(() => createLazyRef({ current: null }, resolve), [resolve]);
}

function createLazyRef<T>(ref: { current: T | null }, resolve: () => T): LazyRef<T> {
  return {
    get current() {
      return ref.current;
    },
    get() {
      const cachedValue = ref.current;

      if (cachedValue !== null) {
        return cachedValue;
      }

      const next = resolve();

      ref.current = next;

      return next;
    },
    invalidate() {
      ref.current = null;
    },
  };
}
