// This is a modified version of the original code from the run-rs package
// https://github.com/vkarpov15/run-rs/blob/a50bb1162eec4ad7612a003a2e360d8f273f576c/src/download.js
// The original code is licensed under the Apache License 2.0
// https://github.com/vkarpov15/run-rs/blob/a50bb1162eec4ad7612a003a2e360d8f273f576c/LICENSE

import assert from 'assert';
import {spawn} from 'child_process';
import {ensureDir, exists} from 'fs-extra';
import path from 'path';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';

export const kDefaultMongoVersion = '8.2.3';
export const kDefaultMongodBinName = 'mongod';
const kMongoBinDir = 'mongodb-bin';

function spawnShellInherit(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', d => (stdout += String(d)));
    child.stderr?.on('data', d => (stderr += String(d)));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Command failed (${code}): ${command}\n${stderr}`));
    });
  });
}

async function spawnShellInheritNoCapture(command: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {shell: true, stdio: 'inherit'});
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

export function getMongoDownloadDir(params: {
  workingDir: string;
  mongoVersion?: string;
}) {
  const {workingDir, mongoVersion = kDefaultMongoVersion} = params;
  return resolvePathUnderWorkingDir(
    workingDir,
    path.join(kMongoBinDir, mongoVersion)
  );
}

export function getMongodBinFilePath(params: {
  workingDir: string;
  mongoVersion?: string;
}) {
  const dir = resolvePathUnderWorkingDir(
    params.workingDir,
    path.join(getMongoDownloadDir(params), 'bin', kDefaultMongodBinName)
  );
  return dir;
}

export async function isMongoDownloaded(params: {
  workingDir: string;
  mongoVersion?: string;
}) {
  const filepath = getMongodBinFilePath(params);
  return await exists(filepath);
}

export async function downloadMongo(params: {
  workingDir: string;
  mongoVersion?: string;
  systemLinux?: string;
  os?: string;
  logger?: IForeLogger;
}) {
  const {
    workingDir,
    mongoVersion = kDefaultMongoVersion,
    systemLinux,
    os = process.platform,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  if (await isMongoDownloaded({workingDir, mongoVersion})) {
    logger.log('Mongo already downloaded');
    return;
  }

  /** NOTE: it downloads both mongod and mongos */
  const version = mongoVersion;

  const versionMatch = version.match(/^(\d)\.(\d)\.(\d+)$/);
  if (!versionMatch) {
    throw new Error('Version must be in x.x.x format');
  }
  const major = parseInt(versionMatch[1]);
  const minor = parseInt(versionMatch[2]);
  // const patch = parseInt(versionMatch[3]);

  let dirname: string;
  let filename: string;
  let detectedOs = os;
  let base = 'https://downloads.mongodb.org';

  const mainScriptDir = getMongoDownloadDir({workingDir, mongoVersion});
  const isBefore42 = major < 4 || (major === 4 && minor < 2);

  await ensureDir(mainScriptDir);

  switch (detectedOs) {
    case 'linux':
      if (isBefore42) {
        filename = `mongodb-linux-x86_64-${version}.tgz`;
        dirname = `mongodb-linux-x86_64-${version}`;
      } else {
        assert.ok(
          systemLinux,
          'systemLinux is required for version 4.2 and above'
        );
        filename = `mongodb-linux-x86_64-${systemLinux}-${version}.tgz`;
        dirname = `mongodb-linux-x86_64-${systemLinux}-${version}`;
      }
      break;
    case 'darwin':
      detectedOs = 'osx';
      if (isBefore42) {
        filename = `mongodb-osx-ssl-x86_64-${version}.tgz`;
        dirname = `mongodb-osx-x86_64-${version}`;
      } else {
        base = 'https://fastdl.mongodb.org';
        filename = `mongodb-macos-x86_64-${version}.tgz`;
        dirname = `mongodb-macos-x86_64-${version}`;
      }
      break;
    case 'win32':
      if (major < 3) {
        filename = `mongodb-win32-x86_64-2008plus-${version}.zip`;
        dirname = `mongodb-win32-x86_64-2008plus-${version}`;
      } else if (major <= 4 && minor < 2) {
        filename = `mongodb-win32-x86_64-2008plus-ssl-${version}.zip`;
        dirname = `mongodb-win32-x86_64-2008plus-ssl-${version}`;
      } else if (major <= 4 && minor < 4) {
        filename = `mongodb-win32-x86_64-2012plus-${version}.zip`;
        dirname = `mongodb-win32-x86_64-2012plus-${version}`;
      } else {
        detectedOs = 'windows';
        filename = `mongodb-windows-x86_64-${version}.zip`;
        dirname = `mongodb-win32-x86_64-windows-${version}`;
      }
      break;
    default:
      throw new Error(`Unrecognized os ${detectedOs}`);
  }

  const url = `${base}/${detectedOs}/${filename}`;

  if (detectedOs.startsWith('win')) {
    // Create a temporary extraction directory
    const tempExtractDir = `temp-mongo-extract-${Date.now()}`;

    await spawnShellInheritNoCapture(
      'powershell.exe -nologo -noprofile -command "&{' +
        'Add-Type -AssemblyName System.IO.Compression.FileSystem;' +
        `(New-Object Net.WebClient).DownloadFile('${url}', '${filename}');` +
        `New-Item -ItemType Directory -Path '${tempExtractDir}' -Force;` +
        `[System.IO.Compression.ZipFile]::ExtractToDirectory('${filename}','${tempExtractDir}');` +
        `$extractedDir = Get-ChildItem '${tempExtractDir}' | Select-Object -First 1 | Select-Object -ExpandProperty Name;` +
        `Move-Item '${tempExtractDir}/$extractedDir/bin' '${getMongoDownloadDir(
          {workingDir, mongoVersion}
        )}';` +
        `Remove-Item -Recurse -Force '${tempExtractDir}';` +
        `Remove-Item '${filename}';` +
        '}"'
    );
  } else {
    await spawnShellInheritNoCapture(`curl -OL ${url}`);

    // Create a temporary extraction directory
    const tempExtractDir = `temp-mongo-extract-${Date.now()}`;
    await spawnShellInheritNoCapture(`mkdir -p ${tempExtractDir}`);

    // Extract to the temporary directory
    await spawnShellInheritNoCapture(
      `tar -zxf ${filename} -C ${tempExtractDir}`
    );

    // Find the extracted directory (should be the only subdirectory)
    const extractedDir = (
      await spawnShellInherit(`ls ${tempExtractDir}`)
    ).trim();
    const extractedDirPath = `${tempExtractDir}/${extractedDir}`;

    // Move the bin directory to the final location
    await spawnShellInheritNoCapture(
      `mv ${extractedDirPath}/bin ${getMongoDownloadDir({
        workingDir,
        mongoVersion,
      })}`
    );

    // Clean up
    await spawnShellInheritNoCapture(`rm -rf ${tempExtractDir}`);
    await spawnShellInheritNoCapture(`rm ./${filename}`);
  }

  return {
    path: getMongoDownloadDir({workingDir, mongoVersion}),
    url: url,
  };
}
