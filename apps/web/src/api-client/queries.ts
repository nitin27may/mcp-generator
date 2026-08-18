import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';

type ProjectInclude = 'operations' | 'analysis' | 'operationDetail';

export function projectQueryKey(id: string, include: readonly ProjectInclude[] = [], operationId?: string) {
  return ['project', id, ...include, ...(operationId !== undefined ? [operationId] : [])] as const;
}

export function useProjectQuery(id: string | null, include: readonly ProjectInclude[] = [], operationId?: string) {
  const params = new URLSearchParams();
  if (include.length > 0) params.set('include', include.join(','));
  if (operationId !== undefined) params.set('operationId', operationId);
  const query = params.size > 0 ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: id ? projectQueryKey(id, include, operationId) : ['project', 'none'],
    queryFn: () => apiGet<ProjectSnapshot>(`/api/projects/${id}${query}`),
    enabled: id !== null && (!include.includes('operationDetail') || operationId !== undefined),
    select: (response) => response.data,
  });
}
