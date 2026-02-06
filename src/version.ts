import fs from 'fs-extra';
import {readFile, writeFile} from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionTxtPath = path.join(__dirname, '..', 'version.txt');

async function getVersionFromPackageJson(
  defaultVersion: string
): Promise<string> {
  try {
    const packageJson = await fs.readJson('package.json');
    return packageJson.version;
  } catch (error) {
    return defaultVersion;
  }
}

async function writeVersionFile(): Promise<void> {
  const version = await getVersionFromPackageJson('unknown');
  await writeFile(versionTxtPath, version);
}

export async function getVersion(defaultVersion: string): Promise<string> {
  try {
    const version = await readFile(versionTxtPath);
    return version.toString() || defaultVersion;
  } catch (error) {
    const version = await getVersionFromPackageJson(defaultVersion);
    return version || defaultVersion;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeVersionFile();
}
