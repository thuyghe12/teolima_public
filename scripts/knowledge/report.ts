/**
 * Reports a failed knowledge script. In GitHub Actions the message also
 * becomes an error annotation, so it shows on the pull request without
 * opening the job log.
 */
export function fail(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (process.env.GITHUB_ACTIONS) {
    const escaped = message.slice(0, 4000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Knowledge snapshot::${escaped}`);
  }
  process.exit(1);
}

/** In GitHub Actions, a notice annotation; elsewhere, a log line. */
export function notice(title: string, message: string): void {
  if (process.env.GITHUB_ACTIONS) {
    const escaped = message.slice(0, 4000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::notice title=${title}::${escaped}`);
  } else console.log(`${title}\n${message}`);
}
