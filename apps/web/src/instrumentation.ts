const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** TIP §51/D2: TTL sweep on boot + every 15 min. `node:fs` needs the Node.js runtime, not Edge. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { sweepExpired } = await import('./server/project-store');
  await sweepExpired();
  setInterval(() => {
    void sweepExpired();
  }, FIFTEEN_MINUTES_MS).unref();
}
