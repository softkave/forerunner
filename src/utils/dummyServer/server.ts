import express, {RequestHandler} from 'express';
import http from 'http';
import {isObject} from 'lodash-es';
import {kDummyServerConstants} from './constants.js';

const handleEchoRequest: RequestHandler = (req, res) => {
  res.status(200).send(req.body);
};

const handleGetProcessIdRequest: RequestHandler = (req, res) => {
  res.status(200).send(process.pid);
};

const handleExitServerRequest: RequestHandler = (req, res) => {
  res.status(200).send('');
  setTimeout(() => {
    // eslint-disable-next-line no-process-exit
    process.exit();
  });
};

const handleFailServerRequest: RequestHandler = (req, res) => {
  res.status(200).send('');
  setTimeout(() => {
    throw new Error('fail server!');
  });
};

const handleLogServerRequest: RequestHandler = (req, res) => {
  const strBody = isObject(req.body) ? JSON.stringify(req.body) : req.body;
  console.log(strBody);
  res.status(200).send('');
};

export function newDummyServer(props: {port: number}) {
  const {port} = props;
  return new Promise<Express.Application>(resolve => {
    const app = express();
    const httpServer = http.createServer(app);
    httpServer.listen(port, () => {
      resolve(app);
    });

    app.post(kDummyServerConstants.paths.echo, handleEchoRequest);
    app.get(kDummyServerConstants.paths.pid, handleGetProcessIdRequest);
    app.post(kDummyServerConstants.paths.exit, handleExitServerRequest);
    app.post(kDummyServerConstants.paths.fail, handleFailServerRequest);
    app.post(kDummyServerConstants.paths.log, handleLogServerRequest);
  });
}
