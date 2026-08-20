import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { jobIdFromRun, newJobId } from '../src/index.js';

const allowedOrigin = 'https://oliver19802.github.io';
const jobId = 'kajak-20260820-105500-a1b2c3';

function r2(objects = {}) {
  return {
    async head(key) {
      const value = objects[key];
      return value === undefined ? null : { size: value.byteLength ?? value.length };
    },
    async get(key, options) {
      const value = objects[key];
      if (value === undefined) return null;
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
      let offset = 0;
      let length = bytes.length;
      if (options?.range) {
        const match = options.range.get('Range')?.match(/^bytes=(\d+)-(\d+)$/);
        offset = Number(match[1]);
        length = Number(match[2]) - offset + 1;
      }
      const chunk = bytes.slice(offset, offset + length);
      return {
        size: bytes.length,
        range: options?.range ? { offset, length: chunk.length } : undefined,
        httpEtag: '"test-etag"',
        body: new Blob([chunk]).stream(),
        text: async () => new TextDecoder().decode(chunk)
      };
    }
  };
}

function env(overrides = {}) {
  return {
    GITHUB_TOKEN: 'github-secret-for-test',
    BUILD_ACCESS_TOKEN: 'access-secret-for-test',
    GITHUB_OWNER: 'Oliver19802',
    GITHUB_REPO: 'KajakTracker',
    GITHUB_WORKFLOW: 'build-offline-map.yml',
    GITHUB_BRANCH: 'main',
    GITHUB_API_BASE: 'https://api.github.test',
    ALLOWED_ORIGIN: allowedOrigin,
    ALLOW_LOCALHOST: 'false',
    OFFLINE_MAPS: r2(),
    BUILD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

function request(path, options = {}) {
  return new Request(`https://worker.test${path}`, {
    ...options,
    headers: {
      Authorization: 'Bearer access-secret-for-test',
      Origin: allowedOrigin,
      ...(options.headers || {})
    }
  });
}

test('job IDs and run titles are unambiguous', () => {
  assert.match(newJobId(new Date('2026-08-20T10:55:00Z')), /^kajak-20260820-105500-[a-f0-9]{6}$/);
  assert.equal(jobIdFromRun({ display_title: `Offline map • ${jobId}` }), jobId);
  assert.equal(jobIdFromRun({ display_title: 'unrelated' }), null);
});

test('rejects invalid coordinates before GitHub is called', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('GitHub must not be called');
  try {
    const response = await worker.fetch(request('/offline-map/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 90, longitude: 14 })
    }), env());
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects oversized JSON even without Content-Length', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('GitHub must not be called');
  try {
    const response = await worker.fetch(request('/offline-map/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 51, longitude: 14, padding: 'x'.repeat(1100) })
    }), env());
    assert.equal(response.status, 413);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dispatches only the configured workflow and returns 202', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/runs?')) return Response.json({ workflow_runs: [] });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await worker.fetch(request('/offline-map/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 51.835, longitude: 14.149 })
    }), env());
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.match(result.jobId, /^kajak-/);
    const dispatch = calls.find(call => call.init.method === 'POST');
    assert.match(dispatch.url, /Oliver19802\/KajakTracker\/actions\/workflows\/build-offline-map\.yml\/dispatches$/);
    assert.equal(JSON.parse(dispatch.init.body).inputs.map_name, result.jobId);
    assert.ok(!JSON.stringify(result).includes('github-secret-for-test'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('matches status by exact run title and reports R2 readiness', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ workflow_runs: [
    { display_title: 'Offline map • kajak-20260820-105500-ffffff', status: 'completed', conclusion: 'success' },
    { display_title: `Offline map • ${jobId}`, status: 'completed', conclusion: 'success' }
  ] });
  try {
    const objects = { [`offline-maps/${jobId}/offline-map.json`]: '{}' };
    const response = await worker.fetch(request(`/offline-map/status/${jobId}`), env({ OFFLINE_MAPS: r2(objects) }));
    assert.deepEqual(await response.json(), { jobId, status: 'completed', conclusion: 'success', artifactReady: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns a generic workflow failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ workflow_runs: [
    { display_title: `Offline map • ${jobId}`, status: 'completed', conclusion: 'failure' }
  ] });
  try {
    const response = await worker.fetch(request(`/offline-map/status/${jobId}`), env());
    const result = await response.json();
    assert.equal(result.conclusion, 'failure');
    assert.match(result.message, /konnte.*nicht erzeugt/);
    assert.ok(!JSON.stringify(result).includes('github-secret-for-test'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('serves metadata and PMTiles byte ranges from R2', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ workflow_runs: [
    { display_title: `Offline map • ${jobId}`, status: 'completed', conclusion: 'success' }
  ] });
  const metadata = JSON.stringify({ radiusKm: 30, minZoom: 10, maxZoom: 15, pmtilesBytes: 8, poiCount: 42 });
  const objects = {
    [`offline-maps/${jobId}/offline-map.json`]: metadata,
    [`offline-maps/${jobId}/offline-map.pmtiles`]: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
  };
  try {
    const metaResponse = await worker.fetch(request(`/offline-map/meta/${jobId}`), env({ OFFLINE_MAPS: r2(objects) }));
    assert.equal((await metaResponse.json()).poiCount, 42);
    const file = await worker.fetch(request(`/offline-map/file/${jobId}/offline-map.pmtiles`, {
      headers: { Range: 'bytes=2-5' }
    }), env({ OFFLINE_MAPS: r2(objects) }));
    assert.equal(file.status, 206);
    assert.equal(file.headers.get('Content-Range'), 'bytes 2-5/8');
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [2, 3, 4, 5]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforces authentication and exact CORS origin', async () => {
  const unauthorized = await worker.fetch(new Request('https://worker.test/offline-map/status/' + jobId, {
    headers: { Origin: allowedOrigin }
  }), env());
  assert.equal(unauthorized.status, 401);
  const forbidden = await worker.fetch(new Request('https://worker.test/offline-map/status/' + jobId, {
    headers: { Origin: 'https://evil.example', Authorization: 'Bearer access-secret-for-test' }
  }), env());
  assert.equal(forbidden.status, 403);
  const preflight = await worker.fetch(new Request('https://worker.test/offline-map/build', {
    method: 'OPTIONS', headers: { Origin: allowedOrigin }
  }), env());
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
});
