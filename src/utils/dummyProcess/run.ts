import {$} from 'zx';

export interface IRunDummyProcessOpts {
  args: string[];
}

export function getDummyProcessCmd(props: IRunDummyProcessOpts) {
  const {args} = props;
  const cmd = `npx tsx -y ${__dirname}/exec.ts -- ${args.join(' ')}`;
  return {cmd};
}

export function runDummyProcess(props: IRunDummyProcessOpts) {
  const {cmd} = getDummyProcessCmd(props);
  const p = $`${cmd}`;
  return {p};
}
