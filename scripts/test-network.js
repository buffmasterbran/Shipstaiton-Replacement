/**
 * Quick network test: can we reach Supabase DB ports from this machine?
 * Run: node scripts/test-network.js
 *
 * If "DB ports" fail but "HTTPS" works → network (e.g. plane WiFi) is likely blocking 5432/6543.
 */

const net = require('net');

const host = 'aws-0-us-west-2.pooler.supabase.com';
const dbPorts = [5432, 6543];
const httpsPort = 443;
const timeout = 8000;

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true, ms: Date.now() - start });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });
    socket.connect(port, host);
  });
}

async function main() {
  console.log('Network test from this machine\n');
  console.log('Target:', host);
  console.log('');

  for (const port of dbPorts) {
    const r = await tryConnect(host, port);
    const icon = r.ok ? '✅' : '❌';
    const msg = r.ok ? `connected (${r.ms}ms)` : r.error;
    console.log(`  Port ${port} (DB): ${icon} ${msg}`);
  }

  const rHttps = await tryConnect(host, httpsPort);
  const iconHttps = rHttps.ok ? '✅' : '❌';
  const msgHttps = rHttps.ok ? `connected (${rHttps.ms}ms)` : rHttps.error;
  console.log(`  Port ${httpsPort} (HTTPS): ${iconHttps} ${msgHttps}`);

  console.log('');
  const dbOk = (await Promise.all(dbPorts.map((p) => tryConnect(host, p)))).some((r) => r.ok);
  if (!dbOk && rHttps.ok) {
    console.log('→ DB ports (5432, 6543) are unreachable but HTTPS (443) works.');
    console.log('  This usually means the network (e.g. plane WiFi) is blocking database ports.');
  } else if (dbOk) {
    console.log('→ DB ports are reachable. If the app still fails, check .env.local and restart dev.');
  } else {
    console.log('→ Nothing reachable. Check general internet / firewall.');
  }
}

main().catch(console.error);
