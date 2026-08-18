import type { Diagnostic } from '@mcpgen/domain';
import type { ProductError } from './product-error.js';

/** Every route's success shape: `2xx -> ApiOk<T>`, `4xx/5xx -> ApiFail`. */
export interface ApiOk<T> {
  readonly data: T;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ApiFail {
  readonly errors: readonly ProductError[];
}
