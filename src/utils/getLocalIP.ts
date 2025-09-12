import {networkInterfaces} from 'os';

export interface LocalIPAddresses {
  ipv4: string[];
  ipv6: string[];
}

export function getLocalIP(): LocalIPAddresses {
  const interfaces = networkInterfaces();
  const ipv4Addresses: string[] = [];
  const ipv6Addresses: string[] = [];

  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) continue;

    for (const connection of networkInterface) {
      // Skip internal/loopback addresses
      if (connection.internal) continue;

      if (connection.family === 'IPv4') {
        ipv4Addresses.push(connection.address);
      } else if (connection.family === 'IPv6') {
        ipv6Addresses.push(connection.address);
      }
    }
  }

  return {
    ipv4: ipv4Addresses,
    ipv6: ipv6Addresses,
  };
}
