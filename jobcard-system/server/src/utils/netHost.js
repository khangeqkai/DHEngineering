/**
 * Host-header helpers shared by the HTTPS app and the plain-HTTP listeners.
 */

const os = require('os');

// Interface-name fragments that mark a virtual / non-physical adapter (VM
// host-only networks, Hyper-V / WSL switches, Docker, VPN tunnels, etc). These
// hand out a 192.168.x / 10.x / 172.x address that LOOKS like a real office
// address but no other office computer can reach it, so we keep them OUT of the
// "type this address" hint. The certificate still vouches for every address the
// machine holds (see collectSanHosts in certs.js), so nothing breaks if one is
// used directly — we just don't advertise it.
const VIRTUAL_IFACE_PATTERNS = [
  'vethernet', 'virtualbox', 'vmware', 'hyper-v', 'hyperv', 'default switch',
  'loopback', 'docker', 'wsl', 'vpn', 'tap-windows', 'tailscale', 'zerotier',
  'hamachi', 'bluetooth', 'npcap', 'teredo', 'isatap'
];

function isVirtualIface(name) {
  const lower = (name || '').toLowerCase();
  return VIRTUAL_IFACE_PATTERNS.some((p) => lower.includes(p));
}

// The machine's own network addresses that OTHER computers can reach it at —
// every non-internal IPv4 (skips the 127.x loopback and any down interface),
// with obvious virtual adapters filtered out so the admin sees only the real
// office address(es). If the filter would leave nothing (an unusual setup where
// the only address rides a virtual-looking adapter), fall back to showing all
// so the hint is never empty.
function lanIpv4s() {
  const real = [];
  const all = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      const isV4 = iface.family === 'IPv4' || iface.family === 4;
      if (!isV4 || iface.internal || !iface.address) continue;
      all.push(iface.address);
      if (!isVirtualIface(name)) real.push(iface.address);
    }
  }
  return real.length ? real : all;
}

// A Host header is caller-controlled. Before we bake it into content that gets
// downloaded and run (the self-elevating setup helper, the desktop shortcut) or
// shown back on the setup page, make sure it is only a plain hostname or IP with
// an optional :port — nothing that could break out of a quoted command or inject
// markup. Anything unexpected falls back to localhost. (A normal browser can't
// put anything unsafe here, so this is defence-in-depth against crafted requests.)
function safeHost(hostHeader) {
  const host = (hostHeader || '').trim();
  const plain = /^[A-Za-z0-9.-]+(:\d{1,5})?$/; // hostname / IPv4 + optional port
  const ipv6 = /^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/; // [::1] + optional port
  return plain.test(host) || ipv6.test(host) ? host : 'localhost';
}

// Strip any :port from a Host header, preserving bracketed IPv6 literals, so an
// old plain link like http://192.168.1.5:3000/foo forwards to https://192.168.1.5/foo
// (HTTPS on the default 443 needs no port in the address).
function hostWithoutPort(hostHeader) {
  const host = hostHeader || 'localhost';
  if (host.startsWith('[')) {
    // IPv6 literal: [::1] or [::1]:3000 — keep through the closing bracket
    return host.slice(0, host.indexOf(']') + 1) || host;
  }
  return host.split(':')[0];
}

module.exports = { hostWithoutPort, safeHost, lanIpv4s };
