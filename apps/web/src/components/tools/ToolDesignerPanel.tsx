'use client';

import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import { TOOL_NAME_PATTERN } from '@mcpgen/config-schema';
import type { OperationSummary } from '@mcpgen/control-contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RiskBadge } from './RiskBadge';
import { SchemaPreview } from './SchemaPreview';
import { useProjectQuery } from '@/api-client/queries';
import { en } from '@/i18n/en';

/** BR-002: only ENABLED tools need unique names — a name collision between two disabled tools is harmless. */
function findNameCollision(tools: Readonly<Record<string, ToolConfig>>, operationKey: string, name: string): boolean {
  return Object.entries(tools).some(([key, tool]) => key !== operationKey && tool.enabled && tool.name === name);
}

export function ToolDesignerPanel({
  projectId,
  operation,
  configDraft,
  onChange,
  onClose,
}: {
  projectId: string;
  operation: OperationSummary;
  configDraft: McpProjectConfig;
  onChange: (tool: ToolConfig) => void;
  onClose: () => void;
}) {
  const tool = configDraft.tools[operation.id];
  const detailQuery = useProjectQuery(projectId, ['operationDetail'], operation.id);

  if (!tool) return null;

  const nameValid = TOOL_NAME_PATTERN.test(tool.name);
  const nameCollides = tool.enabled && findNameCollision(configDraft.tools, operation.id, tool.name);

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{en.toolDesignerTitle}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={en.toolDesignerClose}>
          {en.toolDesignerClose}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <span className="font-mono text-xs">{operation.method}</span> <span className="text-sm">{operation.path}</span>
          <div className="mt-1">
            <RiskBadge classification={operation.risk.classification} reasons={operation.risk.reasons} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="tool-enabled"
            type="checkbox"
            checked={tool.enabled}
            onChange={(event) => onChange({ ...tool, enabled: event.target.checked })}
          />
          <Label htmlFor="tool-enabled">{en.toolDesignerEnabledLabel}</Label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tool-name" required>{en.toolDesignerNameLabel}</Label>
          <Input
            id="tool-name"
            value={tool.name}
            aria-invalid={!nameValid || nameCollides}
            onChange={(event) => onChange({ ...tool, name: event.target.value })}
          />
          {!nameValid && <p className="text-xs text-destructive">{en.toolDesignerNameInvalid}</p>}
          {nameValid && nameCollides && <p className="text-xs text-destructive">{en.toolDesignerNameDuplicate(tool.name)}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tool-description" optional>{en.toolDesignerDescriptionLabel}</Label>
          <Textarea id="tool-description" rows={3} value={tool.description} onChange={(event) => onChange({ ...tool, description: event.target.value })} />
        </div>

        <p className="text-xs text-muted-foreground">{en.toolDesignerNoGroupsNote}</p>

        <div>
          <h3 className="mb-1.5 text-sm font-medium">{en.toolDesignerSchemaHeading}</h3>
          <SchemaPreview detail={detailQuery.data?.operationDetail} isLoading={detailQuery.isLoading} />
        </div>
      </CardContent>
    </Card>
  );
}
