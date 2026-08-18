'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: ReactNode }) {
  // Created once per component instance (not module scope) — a module-scope
  // singleton would leak state across requests during SSR.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
