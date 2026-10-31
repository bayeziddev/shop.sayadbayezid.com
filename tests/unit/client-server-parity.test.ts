// The browser configurator imports the BUILT bundle (dist/assets/js/pricing.js);
// the Worker imports shared/pricing.ts. This test proves both produce identical totals.
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import * as server from '../../shared/pricing';

let client: typeof server;
beforeAll(async () => {
  const r = await build({ entryPoints: ['shared/pricing.ts'], bundle: true, format: 'esm', write: false, minify: true });
  client = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
});

describe('client configurator vs server checkout', () => {
  it('matches for 500 random configurations', () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let i = 0; i < 500; i++) {
      const pkg: server.PricingPackage = {
        id: 1, categoryId: 2, basePrice: 1000 * (1 + rnd(40)),
        addons: Array.from({ length: 1 + rnd(5) }, (_, k) => ({ id: k + 1, priceDelta: 250 * rnd(30), maxQuantity: 1 + rnd(5) })),
        offers: rnd(2) ? [{ id: 1, scope: 'package', discountType: rnd(2) ? 'percent' : 'flat', discountValue: 1 + rnd(50), startsAt: null, endsAt: '2099-01-01T00:00:00Z', isActive: true }] : [],
      };
      const sel = { packageId: 1, addons: pkg.addons.filter(() => rnd(2)).map((a) => ({ addonId: a.id, quantity: 1 + rnd(a.maxQuantity) })) };
      const now = Date.now();
      const c = client.priceLine(pkg, sel, now);
      const s = server.priceCart(new Map([[1, pkg]]), [sel], null, null, now);
      expect(s.total).toBe(c.total);
      expect(s.lines[0]).toEqual(c);
    }
  });
});
