import {waitTimeout} from 'softkave-js-utils';
import {DummyServerSdk} from './sdk.js';

export async function waitForDummyServer(
  sdk: DummyServerSdk,
  opts?: {timeoutMs?: number; intervalMs?: number}
) {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const intervalMs = opts?.intervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;

  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await sdk.getPid();
      return;
    } catch (err) {
      lastError = err;
      await waitTimeout(intervalMs);
    }
  }

  throw new Error(
    `Dummy server did not become ready within ${timeoutMs}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

export async function stopDummyServer(sdk: DummyServerSdk) {
  try {
    await sdk.postExit();
  } catch {
    // Server may already be gone.
  }
}
