import {endProcess} from './endInstance.js';
import {copyFileOrFolder} from './files.js';
import {getProcessIds} from './getProcessIds.js';
import {prestartInstance, prestartInstanceList} from './prestartInstance.js';
import {startInstance} from './startInstance.js';
import {IProcessIdItem, IRunnerOpts} from './types.js';
import {writeProcessIds} from './writeProcessIds.js';

export async function runner(opts: IRunnerOpts) {
  for (const f of opts.files || []) {
    await copyFileOrFolder(f, opts);
  }

  const {pids, pidsByName} = await getProcessIds(opts);
  const newPidList: IProcessIdItem[] = [];

  await prestartInstanceList(opts);
  for (const instance of opts.instances) {
    const pid = pidsByName[instance.name];
    if (pid) {
      await endProcess(pid.pid, opts);
    }

    await prestartInstance(instance, opts);
    const {pid: newPid} = await startInstance(instance, opts);
    newPidList.push({name: instance.name, pid: newPid});
  }

  await Promise.all(pids.map(pid => endProcess(pid.pid, opts)));
  await writeProcessIds(newPidList, opts);
}
