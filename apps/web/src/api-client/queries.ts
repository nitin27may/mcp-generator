import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';

type ProjectInclude = 'operations' | 'analysis' | 'operationDetail';

export function projectQueryKey(id: string, include: readonly ProjectInclude[] = []) {
  return ['project', id, ...include] as const;
}

export function useProjectQuery(id: string | null, include: readonly ProjectInclude[] = []) {
  const query = include.length > 0 ? `?include=${include.join(',')}` : '';
  return useQuery({
    queryKey: id ? projectQueryKey(id, include) : ['project', 'none'],
    queryFn: () => apiGet<ProjectSnapshot>(`/api/projects/${id}${query}`),
    enabled: id !== null,
    select: (response) => response.data,
  });
}
