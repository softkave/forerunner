import {execSync} from 'child_process';
import {Command} from 'commander';
import {
  getMongoCertCAConfigFilePath,
  getMongoCertConfigFilePath,
} from './generateMongoCertConfigs.js';
import {
  getMongoRunConfig,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const program = new Command();
  program
    .requiredOption('-c, --config <path>', 'Path to mongoRunConfig file')
    .option('-o, --overwriteConfig', 'Overwrite existing config', false)
    .option('-o, --overwriteCA', 'Overwrite existing CA', false)
    .option('-o, --overwriteCerts', 'Overwrite existing certs', false)
    .parse(process.argv);
  const options = program.opts();
  const overwriteConfig = options.overwriteConfig;
  const overwriteCA = options.overwriteCA;
  const overwriteCerts = options.overwriteCerts;
  const mongoRunConfig = await getMongoRunConfig({
    mongoRunConfigFilepath: options.config,
    checkExisting: false,
  });
  await generateMongoCertsMain({
    overwriteConfig,
    overwriteCA,
    overwriteCerts,
    mongoRunConfig,
  });
}
