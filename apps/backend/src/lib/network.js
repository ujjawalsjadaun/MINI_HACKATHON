import os from 'node:os';

// Adapters that phones on the campus Wi-Fi can never reach: virtual machines, WSL, Docker and VPN tunnels.
const VIRTUAL = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|tailscale|zerotier|vpn/i;

// This computer's IPv4 addresses that other devices on the same network can open, best guess first.
export function lanAddresses(interfaces = os.networkInterfaces()) {
  const found = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets ?? []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal || net.address.startsWith('169.254.')) continue; // loopback and "no DHCP" addresses
      found.push({ name, address: net.address, virtual: VIRTUAL.test(name) });
    }
  }
  // Real adapters (Wi-Fi, Ethernet) first; virtual ones are still listed, last, in case they are what is wanted.
  return found.sort((a, b) => a.virtual - b.virtual).map(({ name, address }) => ({ name, address }));
}
