export interface IForeLogger {
  log: (message: unknown, ...args: unknown[]) => void;
  error: (message: unknown, ...args: unknown[]) => void;
  table: (tabularData: unknown, properties?: readonly string[]) => void;
  onSilentFail: (message: unknown) => void;
}
