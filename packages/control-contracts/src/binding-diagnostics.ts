import type { ValueBinding } from '@mcpgen/config-schema';
import type { OperationDetail } from './project.js';
import type { ProductError } from './product-error.js';

/**
 * A pure, static equivalent of `binding-engine`'s runtime `BND-001` check
 * (`packages/binding-engine/src/build-request.ts`) — that function needs
 * already-*resolved* values (real env/secrets) to run, which don't exist at
 * config-editing time. This one only asks "does every required parameter
 * and request-body property have *any* binding entry at all", which is
 * exactly what the wizard can know live, client-side, before the server is
 * ever asked (TIP §51 Increment 7's "done" criterion). Runs identically
 * server-side too, so both layers agree by construction.
 */
export function computeBindingDiagnostics(detail: OperationDetail, bindings: Readonly<Record<string, ValueBinding>>): ProductError[] {
  const errors: ProductError[] = [];

  for (const param of detail.parameters) {
    if (param.required && !(param.sourceName in bindings)) {
      errors.push({
        code: 'BND-001',
        message: `Required upstream value "${param.sourceName}" has no binding`,
        category: 'BINDING',
        sourcePointer: `#/bindings/${param.sourceName}`,
      });
    }
  }

  if (detail.requestBody) {
    for (const propName of detail.requestBody.requiredProperties) {
      if (!(propName in bindings)) {
        errors.push({
          code: 'BND-001',
          message: `Required upstream value "${propName}" has no binding`,
          category: 'BINDING',
          sourcePointer: `#/bindings/${propName}`,
        });
      }
    }
  }

  return errors;
}
