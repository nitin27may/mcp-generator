import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';

export function projectQueryKey(id: string) {
  return ['project', id] as const;
}

export function useProjectQuery(id: string | null) {
  return useQuery({
    queryKey: id ? projectQueryKey(id) : ['project', 'none'],
    queryFn: () => apiGet<ProjectSnapshot>(`/api/projects/${id}`),
    enabled: id !== null,
    select: (response) => response.data,
  });
}
