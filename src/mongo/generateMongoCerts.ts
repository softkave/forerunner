import {execSync} from 'child_process';
import {
  getMongoCertCAConfigFilePath,
  getMongoCertConfigFilePath,
} from './generateMongoCertConfigs.js';
import {
  getWorkingMongoRunConfigFilepath,
  MongoRunConfig,
} from './mongoRunConfig.js';

export async function generateMongoCertsMain(params: {
  overwriteConfig?: boolean;
  overwriteCA?: boolean;
  overwriteCerts?: boolean;
  mongoRunConfig: MongoRunConfig;
}) {
  const {overwriteConfig, overwriteCA, mongoRunConfig} = params;

  const workingMongoRunConfigFilepath = getWorkingMongoRunConfigFilepath({
    mongoRunConfig,
  });
  let cmd0 = `npm run mongo:generateMongoCertConfigs -- -c "${workingMongoRunConfigFilepath}"`;
  if (overwriteConfig) {
    cmd0 += ' --overwrite';
  }
  execSync(cmd0, {
    stdio: 'inherit',
    cwd: mongoRunConfig.workingDir,
  });

  const caConfig = getMongoCertCAConfigFilePath(mongoRunConfig);
  let cmd1 = `npm run certs:ca -- -c "${caConfig}"`;
  if (overwriteCA) {
    cmd1 += ' --force';
  }
  if (mongoRunConfig.workingDir) {
    cmd1 += ` -w ${mongoRunConfig.workingDir}`;
  }
  execSync(cmd1, {
    stdio: 'inherit',
    cwd: mongoRunConfig.workingDir,
  });

  const overwriteCerts = params.overwriteCerts || overwriteCA;
  const replicaCount = mongoRunConfig.replicaCount;
  for (let i = 1; i <= replicaCount; i++) {
    const certConfig = getMongoCertConfigFilePath(mongoRunConfig, i);
    let cmd2 = `npm run certs:cert -- -c "${certConfig}"`;
    if (overwriteCerts) {
      cmd2 += ' --force';
    }
    if (mongoRunConfig.workingDir) {
      cmd2 += ` -w ${mongoRunConfig.workingDir}`;
    }
    execSync(cmd2, {
      stdio: 'inherit',
      cwd: mongoRunConfig.workingDir,
    });
  }
}
