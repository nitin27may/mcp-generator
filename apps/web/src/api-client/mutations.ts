import type { AnalyzeRequest, CreateProjectRequest, DryRunRequest, DryRunResult, ImportRequest, ImportResult, ProjectAnalysis, ProjectSnapshot } from '@mcpgen/control-contracts';
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

export function useAnalyzeMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AnalyzeRequest = {}) => apiPost<ProjectAnalysis>(`/api/projects/${projectId}/analyze`, request).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useDryRunMutation(projectId: string) {
  return useMutation({
    mutationFn: (request: DryRunRequest) => apiPost<DryRunResult>(`/api/projects/${projectId}/playground/dry-run`, request).then((r) => r.data),
  });
}
