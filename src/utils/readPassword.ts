import {createInterface} from 'readline';

/**
 * Prompts for a password without echoing to the terminal.
 * When stdin is a TTY, input is hidden. When not (e.g. piped input), falls back to normal line reading.
 */
export function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(prompt, answer => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    process.stdout.write(prompt);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (chunk: string | Buffer) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        const code = c.charCodeAt(0);
        if (c === '\n' || c === '\r' || code === 4) {
          cleanup();
          process.stdout.write('\n');
          resolve(input);
          return;
        }
        if (code === 8 || code === 127) {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += c;
        }
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
    };

    stdin.on('data', onData);
  });
}
