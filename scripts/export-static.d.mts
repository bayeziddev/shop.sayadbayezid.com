export function rewriteHtml(html: string, workerUrl: string): string;
export function fileFor(path: string): string;
export function pathsFromSitemap(xml: string): string[];
export function exportSite(o: { workerUrl: string; pagesDomain: string; outDir?: string; fetchImpl?: typeof fetch; log?: (m: string) => void }): Promise<{ ok: number; failed: string[]; paths: string[] }>;
export function keepAsset(src: string): boolean;
