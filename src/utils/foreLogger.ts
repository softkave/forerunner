export interface IForeLogger {
  log: (message: unknown, ...args: unknown[]) => void;
  error: (message: unknown, ...args: unknown[]) => void;
}

export class ForeLogger implements IForeLogger {
  private silent: boolean;

  constructor(params: {silent?: boolean}) {
    this.silent = params.silent ?? false;
  }

  log: (message: unknown, ...args: unknown[]) => void = (message, ...args) => {
    if (this.silent) {
      return;
    }
    console.log(message, ...args);
  };

  error: (message: unknown, ...args: unknown[]) => void = (
    message,
    ...args
  ) => {
    if (this.silent) {
      return;
    }
    console.error(message, ...args);
  };
}
