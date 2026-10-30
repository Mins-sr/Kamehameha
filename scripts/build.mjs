import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(projectRoot, 'src');
const outputDir = path.join(projectRoot, 'dist');
const manifest = JSON.parse(await readFile(path.join(projectRoot, 'vendor-manifest.json'), 'utf8'));
// An explicit cache is useful for offline development. Cached bytes must pass
// exactly the same size and SHA-256 checks as downloaded bytes.
const args = process.argv.slice(2), cacheIndex = args.indexOf('--vendor-cache');
if (cacheIndex >= 0 && !args[cacheIndex + 1]) throw new Error('--vendor-cache requires a directory');
const cacheRoot = cacheIndex >= 0 ? path.resolve(args[cacheIndex + 1]) : null;
if (cacheRoot && (cacheRoot === outputDir || cacheRoot.startsWith(outputDir + path.sep))) {
  throw new Error('Vendor cache must be outside dist, which is rebuilt');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });
await writeFile(path.join(outputDir, '.nojekyll'), '');

const vendorRoot = path.join(outputDir, 'vendor');
await Promise.all(manifest.map(async (entry) => {
  const target = path.resolve(vendorRoot, entry.path);
  if (!target.startsWith(`${vendorRoot}${path.sep}`)) throw new Error(`Invalid vendor path: ${entry.path}`);
  let bytes;
  if (cacheRoot) {
    bytes = await readFile(path.join(cacheRoot, entry.path));
  } else {
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Download failed for ${entry.path}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== entry.bytes || sha256 !== entry.sha256) {
    throw new Error(`Pinned asset verification failed: ${entry.path}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  process.stdout.write(`verified ${entry.path}\n`);
}));

process.stdout.write(`Built Pages site in dist/ with ${manifest.length} verified vendor assets.\n`);
