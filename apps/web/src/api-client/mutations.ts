import type { CreateProjectRequest, ImportRequest, ImportResult, ProjectSnapshot } from '@mcpgen/control-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from './client';
import { projectQueryKey } from './queries';

export function useImportMutation() {
  return useMutation({
    mutationFn: (request: ImportRequest) => apiPost<ImportResult>('/api/import', request).then((r) => r.data),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProjectRequest) => apiPost<ProjectSnapshot>('/api/projects', request).then((r) => r.data),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(projectQueryKey(snapshot.id), { data: snapshot, diagnostics: [] });
    },
  });
}
