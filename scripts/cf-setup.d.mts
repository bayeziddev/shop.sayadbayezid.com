export class SetupError extends Error {}
export interface SetupResult { config: string; siteUrl: string; workersDevUrl: string; domains: string[]; r2: boolean; name: string; account: string }
export function readOptions(env: Record<string, string | undefined>): Record<string, unknown>;
export function renderConfig(opts: unknown, ids: unknown): string;
export function run(
  env: Record<string, string | undefined>,
  options?: { fetchImpl?: typeof fetch; dry?: boolean; log?: (m: string) => void; warn?: (m: string) => void },
): Promise<SetupResult>;
