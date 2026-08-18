'use client';

import type { ApiKeyAuth, UpstreamAuthentication, ValueBinding } from '@mcpgen/config-schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ValueBindingField, type BindableValue } from '@/components/config/ValueBindingField';
import { SecretBindingField } from '@/components/config/SecretBindingField';
import { SaveIndicator } from '@/components/wizard/SaveIndicator';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

type AuthTypeOrNone = UpstreamAuthentication['type'] | 'none';

const AUTH_TYPE_LABELS: Record<AuthTypeOrNone, string> = {
  none: en.authTypeNone,
  apiKey: en.authTypeApiKey,
  bearer: en.authTypeBearer,
  basic: en.authTypeBasic,
  oauth2ClientCredentials: en.authTypeOAuth2,
};

/**
 * `ApiKeyAuth.value`/`BasicAuth.username`/`OAuth2ClientCredentialsAuth.clientId` are typed as the
 * full `ValueBinding` (including `tool-input`) at the schema level, but this wizard never offers
 * `tool-input` for a global auth field (see `ValueBindingField`'s doc comment) and the seeder never
 * produces one either — so a `tool-input` value here only happens via an out-of-band hand-edit to
 * `config.json`. Falls back to an empty secret binding rather than crashing on that edge case.
 */
function toBindable(value: ValueBinding): BindableValue {
  return value.source === 'tool-input' ? { source: 'secret', name: '' } : value;
}

function defaultForType(type: AuthTypeOrNone): UpstreamAuthentication | undefined {
  switch (type) {
    case 'none':
      return undefined;
    case 'apiKey':
      return { type: 'apiKey', in: 'header', name: '', value: { source: 'secret', name: '' } };
    case 'bearer':
      return { type: 'bearer', token: { source: 'secret', name: '' } };
    case 'basic':
      return { type: 'basic', username: { source: 'environment', name: '' }, password: { source: 'secret', name: '' } };
    case 'oauth2ClientCredentials':
      return { type: 'oauth2ClientCredentials', tokenUrl: '', clientId: { source: 'environment', name: '' }, clientSecret: { source: 'secret', name: '' } };
  }
}

export function AuthView({ projectId }: { projectId: string }) {
  const { configDraft, saveStatus } = useWizardState();
  const dispatch = useWizardDispatch();

  if (!configDraft) return null;
  const auth = configDraft.upstreamAuthentication;

  function updateAuth(next: UpstreamAuthentication | undefined) {
    if (!configDraft) return;
    const { project, api, tools, generation } = configDraft;
    const base = { schemaVersion: configDraft.schemaVersion, project, api, tools, generation };
    dispatch({ type: 'CONFIG_DRAFT_CHANGED', config: next !== undefined ? { ...base, upstreamAuthentication: next } : base });
  }

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{en.authTitle}</CardTitle>
          <SaveIndicator status={saveStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{en.authSubtitle}</p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-type">{en.authTypeLabel}</Label>
            <Select value={auth?.type ?? 'none'} onValueChange={(type) => updateAuth(defaultForType(type as AuthTypeOrNone))}>
              <SelectTrigger id="auth-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AUTH_TYPE_LABELS) as AuthTypeOrNone[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {AUTH_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {auth?.type === 'apiKey' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="auth-apikey-in">{en.authApiKeyLocationLabel}</Label>
                <Select value={auth.in} onValueChange={(loc) => updateAuth({ ...auth, in: loc as ApiKeyAuth['in'] })}>
                  <SelectTrigger id="auth-apikey-in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">{en.authApiKeyLocationHeader}</SelectItem>
                    <SelectItem value="query">{en.authApiKeyLocationQuery}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="auth-apikey-name">{en.authApiKeyNameLabel}</Label>
                <Input id="auth-apikey-name" value={auth.name} onChange={(event) => updateAuth({ ...auth, name: event.target.value })} />
              </div>
              <ValueBindingField
                label={en.authApiKeyValueLabel}
                value={toBindable(auth.value)}
                onChange={(next: BindableValue) => updateAuth({ ...auth, value: next })}
                allowedKinds={['secret', 'environment', 'static']}
                idPrefix="auth-apikey-value"
              />
            </>
          )}

          {auth?.type === 'bearer' && (
            <ValueBindingField
              label={en.authBearerTokenLabel}
              value={toBindable(auth.token)}
              onChange={(next: BindableValue) => updateAuth({ ...auth, token: next })}
              allowedKinds={['secret', 'environment', 'static']}
              idPrefix="auth-bearer-token"
            />
          )}

          {auth?.type === 'basic' && (
            <>
              <ValueBindingField
                label={en.authBasicUsernameLabel}
                value={toBindable(auth.username)}
                onChange={(next: BindableValue) => updateAuth({ ...auth, username: next })}
                allowedKinds={['environment', 'static', 'secret']}
                idPrefix="auth-basic-username"
              />
              <SecretBindingField
                label={en.authBasicPasswordLabel}
                value={auth.password}
                onChange={(next) => updateAuth({ ...auth, password: next })}
                idPrefix="auth-basic-password"
              />
            </>
          )}

          {auth?.type === 'oauth2ClientCredentials' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="auth-oauth2-tokenurl">{en.authOAuth2TokenUrlLabel}</Label>
                <Input
                  id="auth-oauth2-tokenurl"
                  value={auth.tokenUrl}
                  placeholder="https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token"
                  onChange={(event) => updateAuth({ ...auth, tokenUrl: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">{en.authOAuth2TokenUrlHelp}</p>
              </div>
              <ValueBindingField
                label={en.authOAuth2ClientIdLabel}
                value={toBindable(auth.clientId)}
                onChange={(next: BindableValue) => updateAuth({ ...auth, clientId: next })}
                allowedKinds={['environment', 'secret', 'static']}
                idPrefix="auth-oauth2-clientid"
              />
              <SecretBindingField
                label={en.authOAuth2ClientSecretLabel}
                value={auth.clientSecret}
                onChange={(next) => updateAuth({ ...auth, clientSecret: next })}
                idPrefix="auth-oauth2-clientsecret"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="auth-oauth2-scopes">{en.authOAuth2ScopesLabel}</Label>
                <Input
                  id="auth-oauth2-scopes"
                  value={(auth.scopes ?? []).join(', ')}
                  placeholder="api://<application-id-uri>/.default"
                  onChange={(event) => {
                    const scopes = event.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0);
                    const { scopes: _currentScopes, ...authWithoutScopes } = auth;
                    updateAuth(scopes.length > 0 ? { ...authWithoutScopes, scopes } : authWithoutScopes);
                  }}
                />
                <p className="text-xs text-muted-foreground">{en.authOAuth2ScopesHelp}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <StepFooter backHref={`/projects/${projectId}/api`} continueHref={`/projects/${projectId}/tools`} continueLabel={en.authContinue} />
    </div>
  );
}
