import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A real, minimal implementation of the customer-oas31 fixture's contract
 * (fixtures/openapi-3.1/customer.json): GET /customers/{id}, GET /customers,
 * POST /customers. Bearer-auth gated, matching the fixture's security scheme.
 */
export interface FixtureApiHandle {
  readonly baseUrl: string;
  readonly requests: FixtureApiRequestLog[];
  stop(): Promise<void>;
}

export interface FixtureApiRequestLog {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body?: unknown;
}

export interface FixtureApiOptions {
  /** The exact bearer token the fixture accepts. Requests with any other value get 401. */
  readonly expectedToken: string;
  /**
   * Overrides the exact-match check. Needed once the credential is minted at run time
   * rather than configured — an exchanged RFC 8693 token is a fresh JWT the test cannot
   * know in advance, so the fixture has to judge it by shape instead of by equality.
   */
  readonly acceptToken?: (token: string) => boolean;
}

interface Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : undefined;
}

export async function startFixtureApi(options: FixtureApiOptions): Promise<FixtureApiHandle> {
  const customers = new Map<string, Customer>([['c-42', { id: 'c-42', name: 'Ada Lovelace', email: 'ada@example.com' }]]);
  const requests: FixtureApiRequestLog[] = [];
  let nextId = 1;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fixture-api.local');
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, ...(body !== undefined ? { body } : {}) });

      const presented = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      const authorized = options.acceptToken
        ? presented !== undefined && options.acceptToken(presented)
        : req.headers.authorization === `Bearer ${options.expectedToken}`;
      if (!authorized) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }

      const customerMatch = /^\/customers\/([^/]+)$/.exec(url.pathname);

      if (req.method === 'GET' && customerMatch) {
        const customer = customers.get(decodeURIComponent(customerMatch[1]!));
        if (!customer) return send(res, 404, { error: 'not found' });
        return send(res, 200, customer);
      }

      if (req.method === 'GET' && url.pathname === '/customers') {
        return send(res, 200, { items: [...customers.values()], nextPage: null });
      }

      if (req.method === 'POST' && url.pathname === '/customers') {
        const input = body as { name?: string; email?: string } | undefined;
        if (!input?.name || !input.email) return send(res, 400, { error: 'name and email are required' });
        const customer: Customer = { id: `c-${nextId++}`, name: input.name, email: input.email };
        customers.set(customer.id, customer);
        return send(res, 201, customer);
      }

      send(res, 404, { error: 'no route' });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
