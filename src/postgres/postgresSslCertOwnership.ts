import {runDockerOneOffAsRoot} from '../utils/docker.js';

const DEFAULT_CERT_MOUNT_PATH = '/certs';

/** Files referenced from postgresql.conf inside the container (not ca.key.pem). */
const POSTGRES_SSL_MOUNT_FILES = [
  'server.key.pem',
  'server.crt.pem',
  'ca.crt.pem',
] as const;

function buildPostgresSslCertOwnershipShell(mountPath: string): string {
  const chownSteps = POSTGRES_SSL_MOUNT_FILES.map(
    f =>
      `[ -f "${mountPath}/${f}" ] && chown postgres:postgres "${mountPath}/${f}"`
  ).join('; ');
  const chmodStep = `[ -f "${mountPath}/server.key.pem" ] && chmod 600 "${mountPath}/server.key.pem"`;
  return `${chownSteps}; ${chmodStep}`;
}

/**
 * Sets ownership on host cert files bind-mounted into the official `postgres`
 * image. Only server/CA cert material used at runtime — not `ca.key.pem` (CA
 * signing key stays host-owned for regeneration).
 */
export async function setBindMountOwnershipForPostgresSslCerts(params: {
  hostCertDir: string;
  postgresVersion: string;
  containerMountPath?: string;
}): Promise<void> {
  const mountPath = params.containerMountPath ?? DEFAULT_CERT_MOUNT_PATH;
  const image = `postgres:${params.postgresVersion}`;
  await runDockerOneOffAsRoot({
    image,
    hostBindPath: params.hostCertDir,
    containerMountPath: mountPath,
    shellCommand: buildPostgresSslCertOwnershipShell(mountPath),
  });
}
