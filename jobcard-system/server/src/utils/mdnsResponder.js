/**
 * Local-network name announcing (Bonjour / multicast-DNS).
 *
 * Answers local-network name lookups for our friendly name (e.g. jobcards.local)
 * with this machine's current LAN address(es), so other computers can reach the
 * app by name — https://jobcards.local — without any router or DNS setup.
 * Windows 10+ and macOS resolve .local names natively.
 *
 * A machine often has SEVERAL network connections (the real office cable/Wi-Fi
 * plus virtual ones from Hyper-V / WSL / VPNs). If we let the library pick one,
 * it can announce on a virtual connection no other computer can hear. So we
 * announce on EACH real office connection explicitly (the virtual ones are
 * filtered out by lanIpv4s), which is what lets a Mac on the office Wi-Fi hear a
 * server on the office cable.
 *
 * Best-effort by design: any failure (multicast blocked, UDP 5353 busy) logs a
 * plain warning and the app still works by its address number. Never fatal.
 */

const logger = require('./logger');
const { lanIpv4s, lanInterfaces } = require('./netHost');

function startMdnsResponder(name) {
  if (!name) return null;
  const target = name.toLowerCase();

  const ifaces = lanInterfaces(); // real office-LAN connections only (virtual ones filtered out)
  const bindTargets = ifaces.length ? ifaces : [{ name: null, address: null }]; // null = let the library choose (fallback)
  const instances = [];

  for (const { name: ifaceName, address: bindIp } of bindTargets) {
    let mdns;
    try {
      mdns = require('multicast-dns')(bindIp ? { interface: bindIp } : undefined);
    } catch (err) {
      logger.warn(
        { err, name, bindIp },
        `Could not announce "${name}" on ${bindIp || 'the default connection'} — other computers can still reach the app by its address number.`
      );
      continue;
    }

    // Answer with this connection's own CURRENT address when we bound to one, else
    // with every current LAN address. Looked up fresh on every query (rather than
    // captured once at startup) so a network change — the office router handing
    // this adapter a new address, or the adapter list itself changing — is picked
    // up immediately instead of the name resolving to wherever it pointed at boot.
    const answersForName = () => {
      if (bindIp) {
        const current = lanInterfaces().find((i) => i.name === ifaceName);
        const ip = (current && current.address) || bindIp;
        return [{ name, type: 'A', ttl: 120, data: ip }];
      }
      return lanIpv4s().map((ip) => ({ name, type: 'A', ttl: 120, data: ip }));
    };

    mdns.on('query', (query) => {
      const asked = (query.questions || []).some(
        (q) => (q.name || '').toLowerCase() === target && (q.type === 'A' || q.type === 'ANY')
      );
      if (!asked) return;
      const answers = answersForName();
      if (answers.length) {
        try { mdns.respond({ answers }); } catch { /* transient socket error — ignore */ }
      }
    });

    // A network hiccup on the multicast socket must never crash the app.
    mdns.on('error', (err) => {
      logger.warn({ err, name, bindIp }, 'Local-name announcing hit a network error (non-fatal)');
    });

    // Announce once at startup so name caches populate promptly.
    try {
      const answers = answersForName();
      if (answers.length) mdns.respond({ answers });
    } catch {
      /* best-effort */
    }

    instances.push(mdns);
  }

  if (instances.length) {
    logger.info({ name, on: ifaces.length ? ifaces.map((i) => i.address) : ['default'] }, 'Announcing the app on the local network by name');
  }

  // A small handle so the caller could stop it; the app never needs to today.
  return { stop: () => instances.forEach((m) => { try { m.destroy(); } catch { /* ignore */ } }) };
}

module.exports = { startMdnsResponder };
