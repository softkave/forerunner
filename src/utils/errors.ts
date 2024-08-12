import {Result} from 'execa';

export class ForerunnerExecaError extends Error {
  name = 'ForerunnerExecaError';
  execaResult: Result;

  constructor(props: {message?: string; execaResult: Result}) {
    super(props.message || 'ForerunnerExecaError');
    this.execaResult = props.execaResult;
  }
}

export class ForerunnerProcessError extends Error {
  name = 'ForerunnerProcessError';
  stdout: unknown;
  stderr: unknown;
  code: unknown;

  constructor(props: {
    message?: string;
    stdout: unknown;
    stderr: unknown;
    code: unknown;
  }) {
    super(props.message || 'ForerunnerProcessError');
    this.stdout = props.stdout;
    this.stderr = props.stderr;
    this.code = props.code;
  }
}
