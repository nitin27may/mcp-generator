import type { ReactNode } from 'react';

export const metadata = {
  title: 'mcpgen',
  description: 'Import an OpenAPI spec, configure it, generate a governed MCP server.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
