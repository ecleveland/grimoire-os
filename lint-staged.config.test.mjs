import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import so the RED test fails with a clear "module not found" error
const configPath = new URL('./lint-staged.config.mjs', import.meta.url).pathname;

describe('lint-staged config', () => {
  it('exports a backend ESLint rule that remaps paths and runs eslint --fix', async () => {
    const config = (await import(configPath)).default;

    // Find the key matching backend ts files
    const backendKey = Object.keys(config).find(k => k.includes('backend') && k.includes('ts'));
    assert.ok(backendKey, 'Expected a glob pattern matching backend .ts files');

    const handler = config[backendKey];
    assert.equal(typeof handler, 'function', 'Backend handler should be a function (for path remapping)');

    // Simulate lint-staged passing root-relative paths
    const result = handler(['backend/src/app.module.ts', 'backend/src/main.ts']);
    assert.ok(result.includes('eslint'), 'Command should invoke eslint');
    assert.ok(result.includes('--fix'), 'Command should use --fix flag');
    // Paths should be remapped to be relative to backend/
    assert.ok(result.includes('src/app.module.ts'), 'Paths should be remapped relative to backend/');
    assert.ok(!result.includes('backend/src/app.module.ts'), 'Paths should NOT contain backend/ prefix');
  });

  it('exports a frontend ESLint rule that remaps paths and runs eslint --fix', async () => {
    const config = (await import(configPath)).default;

    const frontendKey = Object.keys(config).find(k => k.includes('frontend') && k.includes('ts'));
    assert.ok(frontendKey, 'Expected a glob pattern matching frontend .ts/.tsx files');

    const handler = config[frontendKey];
    assert.equal(typeof handler, 'function', 'Frontend handler should be a function (for path remapping)');

    const result = handler(['frontend/src/app/page.tsx', 'frontend/src/lib/api.ts']);
    assert.ok(result.includes('eslint'), 'Command should invoke eslint');
    assert.ok(result.includes('--fix'), 'Command should use --fix flag');
    assert.ok(result.includes('src/app/page.tsx'), 'Paths should be remapped relative to frontend/');
    assert.ok(!result.includes('frontend/src/app/page.tsx'), 'Paths should NOT contain frontend/ prefix');
  });
});
