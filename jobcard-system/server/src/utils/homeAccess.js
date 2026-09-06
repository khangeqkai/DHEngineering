/**
 * Home access = a Cloudflare Tunnel (cloudflared) running on this machine as a
 * Windows service, forwarding https://<the customer's domain> to
 * https://localhost (see HOME-ACCESS.md). The app only needs to tell a tunnel
 * visitor apart from an office one, so it can demand the home access code.
 */

// Only a request forwarded by a proxy on this machine carries trusted
// forwarded addresses (index.js sets `trust proxy` to loopback), and the only
// such proxy is the tunnel — so "has forwarded addresses" == "came via tunnel".
function isViaTunnel(req) {
  return req.ips.length > 0;
}

// The address to key the login throttle on. Cloudflare APPENDS the real
// visitor to any X-Forwarded-For the visitor sent, and Express's req.ip takes
// the LEFTMOST untrusted entry — i.e. whatever the visitor typed — so a tunnel
// visitor could dodge the throttle by faking a new header each try. The
// rightmost untrusted entry is the one the proxy itself added.
function clientIp(req) {
  return req.ips.length ? req.ips[req.ips.length - 1] : req.ip;
}

module.exports = { isViaTunnel, clientIp };
