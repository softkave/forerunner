import {IRunnerOpts} from '../runner/types.js';

export interface IGitRunnerOpts extends Omit<IRunnerOpts, 'runName'> {
  snapshotName: string;
}
