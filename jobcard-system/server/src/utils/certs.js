/**
 * Local certificate authority + leaf certificate management.
 *
 * The app serves HTTPS on the LAN so browsers on other PCs get a "secure
 * context" (required for the in-app camera and downloads). Rather than depend
 * on a public CA, the server mints its own small certificate authority (CA) on
 * first boot and signs a leaf certificate for itself. Each PC installs the CA
 * once (Phases 2/3) and then trusts every leaf the server signs.
 *
 * Everything here is pure JS (node-forge), so there is no native build step.
 *
 *   ensureCertificates(dataDir) -> { key, cert, caPem }
 *
 * Files under dataDir (same folder as config.json; data/ is gitignored):
 *   ca.crt / ca.key       – the CA certificate + its PRIVATE key (never served)
 *   server.crt / server.key – the leaf used by the HTTPS listener
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const forge = require('node-forge');
const logger = require('./logger');

// The CA is long-lived because installing it on every PC is manual; the leaf is
// short-lived and cheap to re-mint (it never needs re-installing — trust lives
// with the CA that signed it).
const CA_VALIDITY_YEARS = 10;
const LEAF_VALIDITY_YEARS = 2;

const CA_SUBJECT = [
  { name: 'commonName', value: 'DH Engineering Job Cards Local CA' },
  { name: 'organizationName', value: 'DH Engineering' }
];

/**
 * A positive, non-negative serial number as a hex string. The leading "00"
 * keeps the high bit clear so the value is never interpreted as negative.
 */
function makeSerial() {
  return '00' + forge.util.bytesToHex(forge.random.getBytesSync(16));
}

/**
 * The host names / IPs the leaf certificate must vouch for: localhost, the
 * loopback IP, every non-internal IPv4 the machine currently has, and the
 * machine's hostname. These are what a browser types into the address bar.
 */
function collectSanHosts() {
  const dns = new Set(['localhost']);
  const ips = new Set(['127.0.0.1']);

  try {
    const host = os.hostname();
    if (host) dns.add(host);
  } catch {
    /* hostname unavailable — SAN just omits it */
  }

  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      const isV4 = iface.family === 'IPv4' || iface.family === 4;
      if (isV4 && !iface.internal && iface.address) {
        ips.add(iface.address);
      }
    }
  }

  return { dns: [...dns], ips: [...ips] };
}

// node-forge subjectAltName type codes: 2 = DNS name, 7 = IP address.
function buildAltNames({ dns, ips }) {
  return [
    ...dns.map((value) => ({ type: 2, value })),
    ...ips.map((ip) => ({ type: 7, ip }))
  ];
}

function setValidity(cert, years) {
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000); // backdate a day for clock skew
  cert.validity.notAfter = new Date(now);
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + years);
}

function generateCa() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = makeSerial();
  setValidity(cert, CA_VALIDITY_YEARS);
  cert.setSubject(CA_SUBJECT);
  cert.setIssuer(CA_SUBJECT); // self-signed
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    cert,
    key: keys.privateKey,
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey)
  };
}

function generateLeaf(caCert, caKey, san) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = makeSerial();
  setValidity(cert, LEAF_VALIDITY_YEARS);
  cert.setSubject([
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'DH Engineering' }
  ]);
  cert.setIssuer(caCert.subject.attributes); // signed BY the CA
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: buildAltNames(san) }
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey)
  };
}

/**
 * True only if the leaf's SAN already lists every desired IPv4. If the machine
 * gained a new LAN address, this returns false and the leaf is re-minted.
 */
function leafSanCoversIps(cert, ips) {
  const ext = cert.getExtension('subjectAltName');
  if (!ext || !ext.altNames) return false;
  const present = new Set(ext.altNames.filter((a) => a.type === 7).map((a) => a.ip));
  return ips.every((ip) => present.has(ip));
}

// True only if the leaf already vouches for every extra DNS name (e.g. the
// friendly jobcards.local name). Adding a new name returns false → re-mint the
// leaf. The CA is untouched, so trust installed on clients keeps holding.
function leafSanCoversNames(cert, names) {
  if (!names || !names.length) return true;
  const ext = cert.getExtension('subjectAltName');
  if (!ext || !ext.altNames) return false;
  const present = new Set(
    ext.altNames.filter((a) => a.type === 2).map((a) => (a.value || '').toLowerCase())
  );
  return names.every((n) => present.has(n.toLowerCase()));
}

// Private keys are written owner-only. On Windows the POSIX mode is largely
// cosmetic, so this is best-effort and never fatal.
function writeSecret(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* best-effort on platforms without POSIX modes */
  }
}

/**
 * Ensure a usable CA + leaf exist on disk and return the PEM strings the HTTPS
 * listener needs. Reuses existing files; only re-mints the leaf when the LAN
 * IPs drifted (or the leaf is missing/unreadable). Never re-mints the CA once
 * it exists — installed trust must keep holding.
 */
function ensureCertificates(dataDir, options = {}) {
  try {
    const extraDns = (options.extraDns || []).filter(Boolean);
    const caCrtPath = path.join(dataDir, 'ca.crt');
    const caKeyPath = path.join(dataDir, 'ca.key');
    const serverCrtPath = path.join(dataDir, 'server.crt');
    const serverKeyPath = path.join(dataDir, 'server.key');

    fs.mkdirSync(dataDir, { recursive: true });

    // --- CA: generate once, then reuse forever ---
    let caCert;
    let caKey;
    let caPem;
    const freshCa = !(fs.existsSync(caCrtPath) && fs.existsSync(caKeyPath));
    if (freshCa) {
      const ca = generateCa();
      caCert = ca.cert;
      caKey = ca.key;
      caPem = ca.certPem;
      writeSecret(caKeyPath, ca.keyPem);
      fs.writeFileSync(caCrtPath, ca.certPem);
      logger.info({ caCrtPath }, 'Generated new local certificate authority');
    } else {
      caPem = fs.readFileSync(caCrtPath, 'utf-8');
      caCert = forge.pki.certificateFromPem(caPem);
      caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf-8'));
    }

    // --- Leaf: (re)mint when missing, unreadable, IP-drifted, name added, or CA is new ---
    const san = collectSanHosts();
    // Fold in any extra friendly names (e.g. jobcards.local) so the padlock is
    // valid when a browser uses the name instead of the number.
    for (const name of extraDns) {
      if (!san.dns.some((d) => d.toLowerCase() === name.toLowerCase())) san.dns.push(name);
    }
    let needLeaf = freshCa || !(fs.existsSync(serverCrtPath) && fs.existsSync(serverKeyPath));
    let leafPem;
    let leafKeyPem;

    if (!needLeaf) {
      try {
        leafPem = fs.readFileSync(serverCrtPath, 'utf-8');
        leafKeyPem = fs.readFileSync(serverKeyPath, 'utf-8');
        const leafCert = forge.pki.certificateFromPem(leafPem);
        if (!leafSanCoversIps(leafCert, san.ips)) needLeaf = true;
        if (!leafSanCoversNames(leafCert, extraDns)) needLeaf = true;
      } catch {
        needLeaf = true;
      }
    }

    if (needLeaf) {
      const leaf = generateLeaf(caCert, caKey, san);
      leafPem = leaf.certPem;
      leafKeyPem = leaf.keyPem;
      writeSecret(serverKeyPath, leafKeyPem);
      fs.writeFileSync(serverCrtPath, leafPem);
      logger.info({ serverCrtPath, dns: san.dns, ips: san.ips }, 'Minted leaf certificate');
    }

    return { key: leafKeyPem, cert: leafPem, caPem };
  } catch (err) {
    throw new Error(`Failed to prepare HTTPS certificates: ${err.message}`);
  }
}

module.exports = { ensureCertificates };
