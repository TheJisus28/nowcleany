import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONFIG = './tests/architecture/dependency-cruiser.cjs';
const FIXTURES = 'tests/architecture/fixtures/src';

async function violationsIn(target: string): Promise<string[]> {
  const options = await extractDepcruiseOptions(CONFIG);
  const tsConfig = extractTSConfig(resolve('apps/api/tsconfig.json'));
  const { output } = await cruise([target], options, {}, { tsConfig });
  const result = output as ICruiseResult;
  return result.summary.violations
    .map((violation) => `${violation.rule.name}: ${violation.from.replace(`${FIXTURES}/`, '')}`)
    .sort();
}

describe('architecture rules', () => {
  it('apps/api/src has no violations', async () => {
    expect(await violationsIn('apps/api/src')).toEqual([]);
  });

  it('every rule catches its fixture violation and nothing else', async () => {
    expect(await violationsIn(FIXTURES)).toEqual(
      [
        'controller-not-to-repository: modules/alpha/stock/alpha.controller.ts',
        'domain-is-pure: modules/alpha/domain/impure.ts',
        'module-public-api-only: modules/beta/orders/reach-in.ts',
        // A cycle is reported once, from the file where the cruise enters it.
        'no-circular: modules/beta/orders/cycle-a.ts',
        'no-dev-deps-in-production-code: modules/beta/orders/dev-dep.ts',
        'not-to-unresolvable: modules/beta/orders/broken.ts',
        'platform-not-to-modules: platform/registry.ts',
        'shared-kernel-is-pure: shared-kernel/leaky.ts',
      ].sort(),
    );
  });
});
