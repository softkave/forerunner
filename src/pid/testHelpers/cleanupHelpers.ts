/**
 * Helper function to clean up a child process
 */
export async function cleanupProcess(process: any): Promise<void> {
  try {
    if (process.pid && !process.killed) {
      console.log('Killing process', process.pid);
      process.kill('SIGTERM');
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));
      // Force kill if still running
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    }
  } catch (error) {
    console.error('Error killing process', process.pid, error);
  }
}
