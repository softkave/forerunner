// This is a modified version of the original code from the run-rs package
// https://github.com/vkarpov15/run-rs/blob/a50bb1162eec4ad7612a003a2e360d8f273f576c/src/download.js
// The original code is licensed under the Apache License 2.0
// https://github.com/vkarpov15/run-rs/blob/a50bb1162eec4ad7612a003a2e360d8f273f576c/LICENSE

import assert from 'assert';
import {execSync} from 'child_process';
import {ensureDir, exists} from 'fs-extra';
import path from 'path';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';

export const kDefaultMongoVersion = '8.0.0';
export const kDefaultMongodBinName = 'mongod';
const kMongoBinDir = 'mongodb-bin';

export function getMongoDownloadDir(mongoRunConfig: MongoRunConfig) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    kMongoBinDir,
    mongoRunConfig.mongoVersion || kDefaultMongoVersion
  );

  return dir;
}

export function getMongodBinFilePath(mongoRunConfig: MongoRunConfig) {
  const dir = path.resolve(
    path.join(getMongoDownloadDir(mongoRunConfig), 'bin', kDefaultMongodBinName)
  );

  return dir;
}

export async function isMongoDownloaded(mongoRunConfig: MongoRunConfig) {
  const filepath = getMongodBinFilePath(mongoRunConfig);
  return await exists(filepath);
}

export async function downloadMongo(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  if (await isMongoDownloaded(mongoRunConfig)) {
    logger.log('Mongo already downloaded');
    return;
  }

  /** NOTE: it downloads both mongod and mongos */
  const version = mongoRunConfig.mongoVersion || '8.0.0';
  const {systemLinux} = mongoRunConfig;

  const versionMatch = version.match(/^(\d)\.(\d)\.(\d+)$/);
  if (!versionMatch) {
    throw new Error('Version must be in x.x.x format');
  }
  const major = parseInt(versionMatch[1]);
  const minor = parseInt(versionMatch[2]);
  // const patch = parseInt(versionMatch[3]);

  let dirname: string;
  let filename: string;
  let os = mongoRunConfig.os || process.platform;
  let base = 'https://downloads.mongodb.org';

  const mainScriptDir = getMongoDownloadDir(mongoRunConfig);
  const isBefore42 = major < 4 || (major === 4 && minor < 2);

  await ensureDir(mainScriptDir);

  switch (os) {
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
      os = 'osx';
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
        os = 'windows';
        filename = `mongodb-windows-x86_64-${version}.zip`;
        dirname = `mongodb-win32-x86_64-windows-${version}`;
      }
      break;
    default:
      throw new Error(`Unrecognized os ${os}`);
  }

  const url = `${base}/${os}/${filename}`;

  if (os.startsWith('win')) {
    execSync(
      'powershell.exe -nologo -noprofile -command "&{' +
        'Add-Type -AssemblyName System.IO.Compression.FileSystem;' +
        `(New-Object Net.WebClient).DownloadFile('${url}', '${filename}');` +
        `[System.IO.Compression.ZipFile]::ExtractToDirectory('${filename}','.');` +
        `mv './${dirname}/bin' '${getMongoDownloadDir(mongoRunConfig)}';` +
        `rd -r './${dirname}';` +
        `rm './${filename}';` +
        '}"'
    );
  } else {
    execSync(`curl -OL ${url}`);
    execSync(`tar -zxvf ${filename}`);
    execSync(`mv ./${dirname}/bin ${getMongoDownloadDir(mongoRunConfig)}`);
    execSync(`rm -rf ./${dirname}`);
    execSync(`rm ./${filename}`);
  }

  return {path: getMongoDownloadDir(mongoRunConfig), url: url};
}
