// A job's Files window, end to end, on a real server and a throwaway database.
//
// A clean-up once dropped a name the file list still used. Uploads kept saving, but the
// list crashed straight after on every job, so every upload looked lost and retries
// piled up copies. No test asked for the list. This one boots the real server on an
// empty data folder, makes a customer and a job with a part, and walks the Files
// window's own steps: list an empty folder, upload to the whole job and to a part, list
// again, move a file onto the part and back, list again. It covers both folders.
//
// The database library on the owner's WSL machine is a Windows build (node_modules is
// shared with Windows), so under WSL this file re-runs itself with Windows Node rather
// than rebuild anything. It never touches the real data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const serverDir = path.resolve(__dirname, '..');
const dbBinary = path.join(serverDir, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');

function needsWindowsNode() {
  if (process.platform !== 'linux' || !fs.existsSync(dbBinary)) return false;
  const head = Buffer.alloc(4);
  const fd = fs.openSync(dbBinary, 'r');
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  return head.toString('latin1') !== '\x7fELF';
}

if (needsWindowsNode()) {
  const hasWindowsNode = spawnSync('node.exe', ['-v']).status === 0;
  test('Files window: list, upload and move files (run with Windows Node)', { skip: !hasWindowsNode && 'the database library is a Windows build and Windows Node is not reachable from here' }, () => {
    const winFile = execFileSync('wslpath', ['-w', __filename], { encoding: 'utf8' }).trim();
    const run = spawnSync('node.exe', ['--test', winFile], { encoding: 'utf8', timeout: 120000 });
    assert.equal(run.status, 0, `Windows run failed:\n${run.stdout}\n${run.stderr}`);
  });
} else {
  filesWindowTests();
}

function filesWindowTests() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jobfiles-test-'));
  const dataDir = path.join(work, 'data');
  const foldersDir = path.join(work, 'job-folders');
  fs.mkdirSync(dataDir);
  fs.mkdirSync(foldersDir);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  let server;
  let serverLog = '';
  let token;
  let jobId;
  let partId;

  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'error' };
  delete env.NODE_ENV;
  delete env.CLIENT_BUILD_PATH;

  async function call(method, route, body) {
    const res = await fetch(`${base}/api${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  const ok = (res, status, what) => {
    assert.equal(res.status, status, `${what}: got ${res.status} ${JSON.stringify(res.body)}\n--- server log ---\n${serverLog}`);
    return res.body;
  };
  const filesUrl = (cat) => `/jobcards/${encodeURIComponent(jobId)}/files/${cat}`;
  const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n').toString('base64');
  const png = () => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  test.before(async () => {
    server = spawn(process.execPath, ['index.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => { serverLog += d; });
    server.stderr.on('data', (d) => { serverLog += d; });
    const deadline = Date.now() + 30000;
    for (;;) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        // not listening yet
      }
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`server did not start:\n${serverLog}`);
      await new Promise((r) => setTimeout(r, 250));
    }

    token = ok(await call('POST', '/auth/login', { username: 'admin', password: '1234' }), 200, 'sign in').token;
    // A fresh install has no job folders location and no job numbering yet.
    ok(await call('PUT', '/settings', { jobFoldersBase: foldersDir, jobNumberPrefix: 'T-', jobNumberNext: '1' }), 200, 'set up job folders and numbering');
    const company = ok(await call('POST', '/companies', { name: 'Test Customer' }), 201, 'create a customer');
    // A part must answer each of these from its option list; take the first option.
    const firstOption = async (category, fallback) => {
      const tags = ok(await call('GET', `/tags?category=${category}`), 200, `read the ${category} options`);
      return (Array.isArray(tags) ? tags : []).map((t) => t.value || t.name).find(Boolean) || fallback;
    };
    const created = ok(await call('POST', '/jobcards', {
      companyId: company.id,
      description: 'Files window test',
      items: [{
        description: 'Shaft',
        qty: '1',
        jobType: await firstOption('job_type', 'Machining'),
        drawingsType: await firstOption('drawings', 'N/A'),
        customerProperty: await firstOption('customer_property', 'N/A')
      }]
    }), 201, 'create a job');
    jobId = created.id;
    const job = ok(await call('GET', `/jobcards/${encodeURIComponent(jobId)}`), 200, 'read the job');
    partId = job.items[0].id;
    assert.match(partId, /^item:/);
  });

  test.after(async () => {
    // Wait for the server to let go of the database before removing the folder;
    // Windows refuses to delete a file that is still open.
    if (server && server.exitCode === null) {
      const exited = new Promise((r) => server.once('exit', r));
      server.kill();
      await exited;
    }
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  for (const cat of ['job-files', 'customer-property-files']) {
    test(`${cat}: an empty folder lists as empty`, async () => {
      assert.deepEqual(ok(await call('GET', filesUrl(cat)), 200, 'list an empty folder'), []);
    });

    test(`${cat}: an upload shows up in the list, for the whole job and for a part`, async () => {
      const whole = ok(await call('POST', `${filesUrl(cat)}/upload`, { filename: 'Drawing A.pdf', fileData: pdf() }), 201, 'upload to the whole job');
      const forPart = ok(await call('POST', `${filesUrl(cat)}/upload`, { filename: 'Photo.png', fileData: png(), itemId: partId }), 201, 'upload to a part');

      const list = ok(await call('GET', filesUrl(cat)), 200, 'list after uploading');
      const byName = new Map(list.map((f) => [f.name, f]));
      assert.equal(list.length, 2);
      assert.equal(byName.get(whole.name).displayName, 'Drawing A.pdf');
      assert.equal(byName.get(whole.name).itemId, null);
      assert.equal(byName.get(forPart.name).displayName, 'Photo.png');
      assert.equal(byName.get(forPart.name).itemId, partId);
      assert.equal(byName.get(forPart.name).itemNumber, 1);
    });

    test(`${cat}: a file moves onto a part and back to the whole job`, async () => {
      const list = ok(await call('GET', filesUrl(cat)), 200, 'list before moving');
      const file = list.find((f) => f.displayName === 'Drawing A.pdf');

      const moved = ok(await call('POST', `${filesUrl(cat)}/${encodeURIComponent(file.name)}/assign`, { itemId: partId }), 200, 'move onto the part');
      assert.equal(moved.itemId, partId);
      let after = ok(await call('GET', filesUrl(cat)), 200, 'list after moving onto the part');
      assert.equal(after.find((f) => f.displayName === 'Drawing A.pdf').itemId, partId);

      ok(await call('POST', `${filesUrl(cat)}/${encodeURIComponent(moved.name)}/assign`, { itemId: null }), 200, 'move back to the whole job');
      after = ok(await call('GET', filesUrl(cat)), 200, 'list after moving back');
      assert.equal(after.find((f) => f.displayName === 'Drawing A.pdf').itemId, null);
      assert.equal(after.length, 2);
    });
  }
}
