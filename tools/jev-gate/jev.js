'use strict';

// Thin client for TypeSafe's Jev model, reached through OpenRouter.
// Reads-only: a decision call has no side effects, so retrying is safe.

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, 'jobcard-system', 'server', '.env');
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const MODEL = '~typesafe/jev-latest';

let envLoaded = false;

function apiKey() {
  if (!envLoaded) {
    try {
      process.loadEnvFile(ENV_FILE);
    } catch {
      // No local .env — fall through to whatever the shell already exported.
    }
    envLoaded = true;
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      'No OPENROUTER_API_KEY found.\n' +
      `Expected it in ${ENV_FILE} as a line reading OPENROUTER_API_KEY=sk-or-...`
    );
  }
  return key.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Running total for the whole process, so the report can print what it cost.
const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, failures: 0 };

async function ask(state, questions, { retries = 2, timeoutMs = 30000 } = {}) {
  const body = JSON.stringify({ model: MODEL, state, questions });
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: controller.signal
      });
      const text = await res.text();

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Jev returned ${res.status}: ${text.slice(0, 200)}`);
        await sleep(400 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Jev rejected the request (${res.status}): ${text.slice(0, 400)}`);
      }

      const parsed = JSON.parse(text);
      if (parsed.usage) {
        usage.calls += 1;
        usage.inputTokens += parsed.usage.input_tokens || 0;
        usage.outputTokens += parsed.usage.output_tokens || 0;
        usage.cost += parsed.usage.cost || 0;
      }
      return parsed.answers || {};
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') lastError = new Error('Jev timed out');
      if (attempt < retries) await sleep(400 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  usage.failures += 1;
  throw lastError || new Error('Jev call failed');
}

// Run a list of () => Promise jobs with a fixed ceiling on parallel requests.
async function pool(jobs, concurrency = 6) {
  const results = new Array(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next;
      next += 1;
      try {
        results[i] = { ok: true, value: await jobs[i]() };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

module.exports = { ask, pool, usage, ENV_FILE, MODEL };
