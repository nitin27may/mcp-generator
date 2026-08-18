'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { ApiRequestError, apiPut } from '@/api-client/client';
import { useWizardDispatch, useWizardState } from './useWizard';

const DEBOUNCE_MS = 600;

/**
 * Debounces `PUT /api/projects/:id/config` 600ms after the last edit, and
 * flushes immediately on step/route change (this hook lives in the
 * project layout, which persists across step navigation — only the
 * `pathname` dependency changes, so the effect below fires exactly on
 * navigation, after the user has stopped editing the page they're leaving)
 * and on tab hide (`visibilitychange`/`pagehide`, using `fetch`'s
 * `keepalive` rather than `navigator.sendBeacon` — Beacon is POST-only and
 * this route is a `PUT`).
 */
export function useConfigAutosave(): void {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    async (init?: RequestInit) => {
      const current = stateRef.current;
      if (!current.projectId || !current.configDraft || !current.dirty) return;

      dispatch({ type: 'SAVE_STARTED' });
      try {
        const response = await apiPut<ProjectSnapshot>(
          `/api/projects/${current.projectId}/config`,
          { expectedRevision: current.snapshot?.configRevision ?? 0, config: current.configDraft },
          init,
        );
        dispatch({ type: 'SAVE_SUCCEEDED', snapshot: response.data });
        void queryClient.invalidateQueries({ queryKey: ['project', current.projectId] });
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 409 && error.serverRevision !== undefined) {
          dispatch({ type: 'SAVE_CONFLICTED', serverRevision: error.serverRevision });
        } else if (error instanceof ApiRequestError) {
          dispatch({ type: 'SAVE_FAILED', errors: error.errors });
        } else {
          dispatch({ type: 'SAVE_FAILED', errors: [{ code: 'CFG-001', message: 'Save failed unexpectedly', category: 'VALIDATION' }] });
        }
      }
    },
    [dispatch, queryClient],
  );

  useEffect(() => {
    if (!state.dirty) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.dirty, state.configDraft, flush]);

  // Step/route change flush: fires when `pathname` changes, using whatever draft was
  // left dirty on the page just navigated away from (state persists in this layout-level hook).
  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      void flush();
    }
  }, [pathname, flush]);

  // Leaving the project entirely, or hiding the tab — best-effort, `keepalive` survives navigation.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') void flush({ keepalive: true });
    }
    function handlePageHide() {
      void flush({ keepalive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void flush();
    };
  }, [flush]);
}
