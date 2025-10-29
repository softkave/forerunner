import express, {RequestHandler} from 'express';
import http from 'http';
import {isObject} from 'lodash-es';
import {kDummyServerConstants} from './constants.js';

const handleEchoRequest: RequestHandler = (req, res) => {
  res.status(200).send(req.body);
};

const handleGetProcessIdRequest: RequestHandler = (req, res) => {
  res.status(200).send({pid: process.pid});
};

const handleExitServerRequest: RequestHandler = (req, res) => {
  res.status(200).end();
  setTimeout(() => {
    // eslint-disable-next-line no-process-exit
    process.exit();
  });
};

const handleFailServerRequest: RequestHandler = (req, res) => {
  res.status(200).end();
  setTimeout(() => {
    throw new Error('Fail server!');
  });
};

const handleLogServerRequest: RequestHandler = (req, res) => {
  const strBody = isObject(req.body) ? JSON.stringify(req.body) : req.body;
  console.log(strBody);
  res.status(200).end();
};

const handleLogErrorServerRequest: RequestHandler = (req, res) => {
  const strBody = isObject(req.body) ? JSON.stringify(req.body) : req.body;
  console.error(strBody);
  res.status(200).end();
};

export async function newDummyServer(props: {port: number}) {
  const {port} = props;
  const {app: expressApp, server} = await new Promise<{
    app: Express.Application;
    server: http.Server;
  }>((resolve, reject) => {
    const app = express();

    app.use(express.json());

    app.post(kDummyServerConstants.paths.echo, handleEchoRequest);
    app.get(kDummyServerConstants.paths.pid, handleGetProcessIdRequest);
    app.post(kDummyServerConstants.paths.exit, handleExitServerRequest);
    app.post(kDummyServerConstants.paths.fail, handleFailServerRequest);
    app.post(kDummyServerConstants.paths.log, handleLogServerRequest);
    app.post(kDummyServerConstants.paths.logError, handleLogErrorServerRequest);

    const server = http.createServer(app).listen(port, () => {
      resolve({app, server});
    });

    server.on('error', error => {
      reject(error);
    });
  });

  return {app: expressApp, server};
}

// process.on('exit', () => {
//   console.log('exiting');
// });
