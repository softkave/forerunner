import fetch, {Response} from 'node-fetch';
import {kDummyServerConstants} from './constants.js';

export class DummyServerRequestError extends Error {
  name = 'DummyServerRequestError';
  result: Response;

  constructor(props: {message?: string; result: Response}) {
    super(props.message || 'DummyServerRequestError');
    this.result = props.result;
  }
}

function handleFailedResponse(
  response: Response,
  message = `${response.url} failed`
) {
  if (!response.ok) {
    throw new DummyServerRequestError({message, result: response});
  }
}

export class DummyServerSdk {
  port: string | number;

  constructor(props: {port: string | number}) {
    this.port = props.port;
  }

  async postEcho(props: {message: string}) {
    const {message} = props;
    const result = await fetch(
      `http://localhost:${this.port}${kDummyServerConstants.paths.echo}`,
      {
        method: 'post',
        body: JSON.stringify({message}),
        headers: {'Content-Type': 'application/json'},
      }
    );

    handleFailedResponse(result, 'postEcho error');
    return ((await result.json()) as {message?: string})?.message;
  }

  async getPid() {
    const result = await fetch(
      `http://localhost:${this.port}${kDummyServerConstants.paths.pid}`,
      {method: 'get'}
    );

    handleFailedResponse(result, 'getPid error');
    return (await result.json()) as {pid: string};
  }

  async postExit() {
    const result = await fetch(
      `http://localhost:${this.port}${kDummyServerConstants.paths.exit}`,
      {method: 'post'}
    );

    handleFailedResponse(result, 'postExit error');
  }

  async postFail() {
    const result = await fetch(
      `http://localhost:${this.port}${kDummyServerConstants.paths.fail}`,
      {method: 'post'}
    );

    handleFailedResponse(result, 'postFail error');
  }

  async postLog(props: {message: string}) {
    const {message} = props;
    const result = await fetch(
      `http://localhost:${this.port}${kDummyServerConstants.paths.log}`,
      {
        method: 'post',
        body: JSON.stringify({message}),
        headers: {'Content-Type': 'application/json'},
      }
    );

    handleFailedResponse(result, 'postLog error');
  }
}
