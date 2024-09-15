#!/usr/bin/env node

import {Command, Option} from 'commander';
import {IFimidaraCmdDef} from './types.js';
import {fimidaraStartProcessCmdDef} from './startProcess.js';
import {fimidaraStopProcessCmdDef} from './stopProcess.js';

const program = new Command();
program.name('forerunner').description('forerunner CLI').version('0.1.0');

function addCmdToProgram(cmd: IFimidaraCmdDef) {
  const pCmd = program
    .command(cmd.cmd)
    .description(cmd.description)
    .action(cmd.action);

  cmd.options.forEach(opt => {
    const flags =
      (opt.shortName ? `${opt.shortName}, ` : '') +
      (opt.longName ? `${opt.longName} ` : '') +
      (opt.isRequired ? `<${opt.type}>` : `[${opt.type}]`);
    const commandOpts = new Option(flags, opt.description);

    if (opt.choices) {
      commandOpts.choices(opt.choices || []);
    }

    if (opt.defaultValue) {
      commandOpts.default(opt.defaultValue);
    }

    pCmd.addOption(commandOpts);
  });
}

addCmdToProgram(fimidaraStopProcessCmdDef as IFimidaraCmdDef);
addCmdToProgram(fimidaraStartProcessCmdDef as IFimidaraCmdDef);
program.parse();
