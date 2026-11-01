import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('worker/migrations');
  return {
    test: {
      projects: [
        { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './worker/wrangler.local.toml' },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  ADMIN_SETUP_TOKEN: 'test-setup-token',
                  SESSION_SECRET: 'test-session-secret-0123456789',
                  DATA_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
                  // Storefront copy on GitHub Pages; this Worker is the backend (CORS + canonical URLs).
                  PUBLIC_SITE_URL: 'https://shop.example.com',
                  APP_ENV: 'test', // maintenance is exercised explicitly in its own test
                },
              },
            }),
          ],
          test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles: ['tests/integration/apply-migrations.ts'] },
        },
      ],
    },
  };
});
