'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportRequest, ImportResult } from '@mcpgen/control-contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DiagnosticList } from '@/components/diagnostics/DiagnosticList';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { ApiRequestError } from '@/api-client/client';
import { useCreateProjectMutation, useImportMutation } from '@/api-client/mutations';
import { en } from '@/i18n/en';

type ImportTab = ImportRequest['kind'];

export default function ImportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<ImportTab>('paste');
  const [pasteText, setPasteText] = useState('');
  const [url, setUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const importMutation = useImportMutation();
  const createProjectMutation = useCreateProjectMutation();

  async function handleFileChange(file: File) {
    const text = await file.text();
    submitImport({ kind: 'upload', text, fileName: file.name });
  }

  function submitImport(request: ImportRequest) {
    setImportResult(null);
    importMutation.mutate(request, { onSuccess: setImportResult });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (tab === 'paste') submitImport({ kind: 'paste', text: pasteText });
    else if (tab === 'url') submitImport({ kind: 'url', url });
  }

  function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    if (importResult === null) return;
    createProjectMutation.mutate(
      { importId: importResult.importId, ...(projectName.trim() ? { name: projectName.trim() } : {}) },
      { onSuccess: (snapshot) => router.push(`/projects/${snapshot.id}/validation`) },
    );
  }

  const importErrors = importMutation.error instanceof ApiRequestError ? importMutation.error.errors : [];
  const createErrors = createProjectMutation.error instanceof ApiRequestError ? createProjectMutation.error.errors : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="font-heading text-xl font-medium">{en.importTitle}</h1>
        <p className="text-sm text-muted-foreground">{en.importSubtitle}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{en.appName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Tabs value={tab} onValueChange={(value) => setTab(value as ImportTab)}>
              <TabsList>
                <TabsTrigger value="paste">{en.importTabPaste}</TabsTrigger>
                <TabsTrigger value="upload">{en.importTabUpload}</TabsTrigger>
                <TabsTrigger value="url">{en.importTabUrl}</TabsTrigger>
              </TabsList>
              <TabsContent value="paste">
                <Label htmlFor="import-paste">{en.importPasteLabel}</Label>
                <Textarea
                  id="import-paste"
                  rows={12}
                  placeholder={en.importPastePlaceholder}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
              </TabsContent>
              <TabsContent value="upload">
                <Label htmlFor="import-upload">{en.importUploadLabel}</Label>
                <Input
                  id="import-upload"
                  type="file"
                  accept=".json,.yaml,.yml"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFileChange(file);
                  }}
                />
              </TabsContent>
              <TabsContent value="url">
                <Label htmlFor="import-url">{en.importUrlLabel}</Label>
                <Input
                  id="import-url"
                  type="url"
                  placeholder={en.importUrlPlaceholder}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </TabsContent>
            </Tabs>

            {tab !== 'upload' && (
              <Button type="submit" disabled={importMutation.isPending}>
                {importMutation.isPending ? en.importSubmitting : en.importSubmit}
              </Button>
            )}
          </form>

          <ProductErrorPanel errors={importErrors} />
        </CardContent>
      </Card>

      {importResult !== null && (
        <Card>
          <CardHeader>
            <CardTitle>{en.importSuccessHeading}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {importResult.info.title} — {importResult.format.toUpperCase()} · {importResult.sourceVersion} ·{' '}
              {en.importSuccessOperationCount(importResult.operationCount)}
            </p>
            <DiagnosticList diagnostics={importResult.diagnostics} />
            <form onSubmit={handleCreateProject} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="project-name">{en.importProjectNameLabel}</Label>
                <Input
                  id="project-name"
                  placeholder={importResult.info.title || en.importProjectNamePlaceholder}
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={createProjectMutation.isPending}>
                {createProjectMutation.isPending ? en.importCreateSubmitting : en.importCreateSubmit}
              </Button>
              <ProductErrorPanel errors={createErrors} />
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
