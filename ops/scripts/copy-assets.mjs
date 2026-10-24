// Copies non-TypeScript runtime assets (SQL migrations) from src/ to dist/ after `tsc`.
// Usage: node copy-assets.mjs <srcDir> <distDir>
import { cp } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import process from 'node:process';

const [source = 'src', target = 'dist'] = process.argv.slice(2);
await cp(source, target, {
  recursive: true,
  filter: (path) =>
    !/\.[cm]?ts$/.test(path) && !relative(source, path).split(sep).includes('tests'),
});
