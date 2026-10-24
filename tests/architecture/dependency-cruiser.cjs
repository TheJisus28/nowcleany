// Architecture rules for apps/api (see CLAUDE.md, "Reglas de arquitectura").
// Paths are matched relative to the repo root. Patterns start at "src/" (not "apps/api/src/") so the
// fixtures in tests/architecture/fixtures can prove that every rule fires.
// The `comment` of each rule is what developers see when it fails, so it is written in Spanish.

const { join } = require('node:path');

// Absolute, because dependency-cruiser resolves the tsconfig "extends" against the cwd otherwise.
const API_TSCONFIG = join(__dirname, '../../apps/api/tsconfig.json');
const SRC = '(?:^|/)src/';
const MODULE = `${SRC}modules/([^/]+)/`;
const TEST_FILES = [`${SRC}.*\\.test\\.ts$`, `${SRC}.*/tests/`];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Dependencia circular: rompe el ciclo extrayendo una abstracción.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Import que no se puede resolver.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-undeclared-packages',
      comment: 'Paquete no declarado en package.json (o declarado en la raíz en vez de en la app).',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-dev-deps-in-production-code',
      comment: 'El código de producción no puede importar devDependencies.',
      severity: 'error',
      from: { path: SRC, pathNot: TEST_FILES },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'module-public-api-only',
      comment: 'Un módulo solo puede importar el index.ts de otro módulo (su API pública).',
      severity: 'error',
      from: { path: MODULE },
      to: {
        path: `${SRC}modules/[^/]+/`,
        pathNot: [`${SRC}modules/$1/`, `${SRC}modules/[^/]+/index\\.ts$`],
      },
    },
    {
      name: 'domain-is-pure',
      comment:
        'domain/ solo depende de su propio domain/ y de shared-kernel/: nada de Nest, Kysely ni otras capas.',
      severity: 'error',
      from: { path: `${MODULE}domain/` },
      to: { pathNot: [`${SRC}modules/$1/domain/`, `${SRC}shared-kernel/`] },
    },
    {
      name: 'shared-kernel-is-pure',
      comment: 'shared-kernel/ no depende de plataforma, módulos ni paquetes externos.',
      severity: 'error',
      from: { path: `${SRC}shared-kernel/` },
      to: { pathNot: [`${SRC}shared-kernel/`] },
    },
    {
      name: 'platform-not-to-modules',
      comment: 'La plataforma no conoce a los módulos; los módulos se registran en ella.',
      severity: 'error',
      from: { path: `${SRC}platform/` },
      to: { path: `${SRC}modules/` },
    },
    {
      name: 'controller-not-to-repository',
      comment: 'Flujo controller -> service -> repository: el controlador no toca repositorios.',
      severity: 'error',
      from: { path: '\\.controller\\.ts$' },
      to: { path: 'repository\\.ts$' },
    },
    {
      name: 'database-access-only-in-repositories',
      comment:
        'Kysely y pg solo se usan en kysely-*.repository.ts, *.tables.ts, platform/ y migrate.ts.',
      severity: 'error',
      from: {
        path: SRC,
        pathNot: [
          'kysely-[^/]+\\.repository\\.ts$',
          '\\.tables\\.ts$',
          `${SRC}platform/`,
          `${SRC}migrate\\.ts$`,
          ...TEST_FILES,
        ],
      },
      to: { path: 'node_modules/(?:kysely|pg|pg-[^/]+|@nestjs-cls/transactional-adapter-kysely)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: API_TSCONFIG },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
