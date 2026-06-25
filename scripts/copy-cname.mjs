import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePath = resolve(rootDir, 'CNAME');
const outputDir = resolve(rootDir, 'docs');
const outputPath = resolve(outputDir, 'CNAME');

await mkdir(outputDir, { recursive: true });
await copyFile(sourcePath, outputPath);
