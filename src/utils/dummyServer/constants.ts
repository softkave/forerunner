export const kDummyServerConstants = {
  paths: {
    echo: '/echo',
    pid: '/pid',
    exit: '/exit',
    fail: '/fail',
    log: '/log',
    logError: '/log-error',
  },
  port: {
    min: 1,
    max: 65_535,
  },
};
