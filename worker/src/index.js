const JOB_ID_PATTERN = /^kajak-\d{8}-\d{6}-[a-f0-9]{6}$/;
const RUN_TITLE_PREFIX = 'Offline map • ';
const FILES = new Map([
  ['offline-map.pmtiles', 'application/vnd.pmtiles'],
  ['offline-pois.json', 'application/json; charset=utf-8'],
  ['offline-map.json', 'application/json; charset=utf-8']
]);

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === env.ALLOWED_ORIGIN) return origin;
  if (env.ALLOW_LOCALHOST === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return false;
}

function responseHeaders(request, env, extra = {}) {
  const origin = corsOrigin(request, env);
  return {
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    } : {}),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
}

function json(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, env, { 'Content-Type': 'application/json; charset=utf-8', ...extra })
  });
}

function authorized(request, env) {
  const expected = env.BUILD_ACCESS_TOKEN;
  return Boolean(expected && request.headers.get('Authorization') === `Bearer ${expected}`);
}

function validNumber(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function githubConfig(env) {
  return {
    owner: env.GITHUB_OWNER || 'Oliver19802',
    repo: env.GITHUB_REPO || 'KajakTracker',
    workflow: env.GITHUB_WORKFLOW || 'build-offline-map.yml',
    branch: env.GITHUB_BRANCH || 'main',
    api: env.GITHUB_API_BASE || 'https://api.github.com'
  };
}

async function github(request, env, path, init = {}) {
  const config = githubConfig(env);
  const response = await fetch(`${config.api}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'KajakTracker-offline-map-worker',
      ...(init.headers || {})
    }
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`GitHub API request failed with status ${response.status}`);
  }
  return response;
}

function newJobId(now = new Date()) {
  const compact = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const suffix = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `kajak-${compact}-${suffix}`;
}

function jobIdFromRun(run) {
  const title = run.display_title || run.name || '';
  return title.startsWith(RUN_TITLE_PREFIX) ? title.slice(RUN_TITLE_PREFIX.length) : null;
}

async function workflowRuns(request, env) {
  const config = githubConfig(env);
  const query = new URLSearchParams({ event: 'workflow_dispatch', branch: config.branch, per_page: '50' });
  const response = await github(request, env,
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflow)}/runs?${query}`);
  return (await response.json()).workflow_runs || [];
}

async function findRun(request, env, jobId) {
  return (await workflowRuns(request, env)).find(run => jobIdFromRun(run) === jobId) || null;
}

async function startBuild(request, env) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 1024) return json(request, env, { message: 'Anfrage ist zu groß.' }, 413);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json(request, env, { message: 'Content-Type application/json ist erforderlich.' }, 415);
  }
  let input;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 1024) {
      return json(request, env, { message: 'Anfrage ist zu groß.' }, 413);
    }
    input = JSON.parse(body);
  } catch {
    return json(request, env, { message: 'Ungültiges JSON.' }, 400);
  }
  if (!validNumber(input.latitude, -85, 85) || !validNumber(input.longitude, -180, 180)) {
    return json(request, env, { message: 'Latitude oder Longitude ist ungültig.' }, 400);
  }
  if (env.BUILD_RATE_LIMITER) {
    const result = await env.BUILD_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!result.success) return json(request, env, { message: 'Bitte vor einem weiteren Build warten.' }, 429);
  }
  const active = (await workflowRuns(request, env)).find(run => ['queued', 'in_progress', 'waiting', 'pending'].includes(run.status));
  if (active) {
    const activeJobId = jobIdFromRun(active);
    return json(request, env, {
      jobId: activeJobId,
      status: active.status,
      message: 'Es wird bereits eine Offline-Karte erzeugt.'
    }, 409);
  }
  const jobId = newJobId();
  const config = githubConfig(env);
  await github(request, env,
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: config.branch,
        inputs: { latitude: String(input.latitude), longitude: String(input.longitude), map_name: jobId }
      })
    });
  return json(request, env, { jobId, status: 'queued' }, 202);
}

async function statusResponse(request, env, jobId) {
  const run = await findRun(request, env, jobId);
  if (!run) return json(request, env, { jobId, status: 'queued' });
  if (run.status !== 'completed') return json(request, env, { jobId, status: run.status });
  if (run.conclusion !== 'success') {
    return json(request, env, {
      jobId,
      status: 'completed',
      conclusion: run.conclusion || 'failure',
      message: 'Offline-Karte konnte für diesen Bereich nicht erzeugt werden.'
    });
  }
  const artifactReady = Boolean(await env.OFFLINE_MAPS.head(`offline-maps/${jobId}/offline-map.json`));
  return json(request, env, { jobId, status: 'completed', conclusion: 'success', artifactReady });
}

async function metadataResponse(request, env, jobId) {
  const run = await findRun(request, env, jobId);
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
    return json(request, env, { message: 'Offline-Karte ist noch nicht bereit.' }, 409);
  }
  const object = await env.OFFLINE_MAPS.get(`offline-maps/${jobId}/offline-map.json`);
  if (!object) return json(request, env, { message: 'Metadaten sind noch nicht verfügbar.' }, 404);
  try {
    return json(request, env, JSON.parse(await object.text()));
  } catch {
    return json(request, env, { message: 'Metadaten sind ungültig.' }, 502);
  }
}

async function fileResponse(request, env, jobId, filename) {
  if (!FILES.has(filename)) return json(request, env, { message: 'Datei nicht gefunden.' }, 404);
  const key = `offline-maps/${jobId}/${filename}`;
  if (request.method === 'HEAD') {
    const object = await env.OFFLINE_MAPS.head(key);
    if (!object) return json(request, env, { message: 'Datei nicht gefunden.' }, 404);
    return new Response(null, { headers: responseHeaders(request, env, {
      'Content-Type': FILES.get(filename), 'Content-Length': String(object.size), 'Accept-Ranges': 'bytes'
    }) });
  }
  const rangeHeader = request.headers.get('Range');
  const object = await env.OFFLINE_MAPS.get(key, rangeHeader ? { range: request.headers } : undefined);
  if (!object) return json(request, env, { message: 'Datei nicht gefunden.' }, 404);
  const headers = responseHeaders(request, env, {
    'Content-Type': FILES.get(filename),
    'Accept-Ranges': 'bytes',
    ETag: object.httpEtag
  });
  let status = 200;
  if (rangeHeader && object.range) {
    status = 206;
    headers['Content-Length'] = String(object.range.length);
    headers['Content-Range'] = `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`;
  } else {
    headers['Content-Length'] = String(object.size);
  }
  return new Response(object.body, { status, headers });
}

async function handle(request, env) {
  const cors = corsOrigin(request, env);
  if (cors === false) return json(request, env, { message: 'Origin nicht erlaubt.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  if (!authorized(request, env)) return json(request, env, { message: 'Nicht autorisiert.' }, 401);
  const url = new URL(request.url);
  if (url.pathname === '/offline-map/build') {
    if (request.method !== 'POST') return json(request, env, { message: 'Methode nicht erlaubt.' }, 405, { Allow: 'POST' });
    return startBuild(request, env);
  }
  const match = url.pathname.match(/^\/offline-map\/(status|meta)\/([^/]+)$/);
  if (match) {
    if (request.method !== 'GET') return json(request, env, { message: 'Methode nicht erlaubt.' }, 405, { Allow: 'GET' });
    if (!JOB_ID_PATTERN.test(match[2])) return json(request, env, { message: 'Ungültige jobId.' }, 400);
    return match[1] === 'status' ? statusResponse(request, env, match[2]) : metadataResponse(request, env, match[2]);
  }
  const fileMatch = url.pathname.match(/^\/offline-map\/file\/([^/]+)\/([^/]+)$/);
  if (fileMatch) {
    if (!['GET', 'HEAD'].includes(request.method)) return json(request, env, { message: 'Methode nicht erlaubt.' }, 405);
    if (!JOB_ID_PATTERN.test(fileMatch[1])) return json(request, env, { message: 'Ungültige jobId.' }, 400);
    return fileResponse(request, env, fileMatch[1], fileMatch[2]);
  }
  return json(request, env, { message: 'Endpoint nicht gefunden.' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      if (!env.GITHUB_TOKEN || !env.BUILD_ACCESS_TOKEN || !env.OFFLINE_MAPS) {
        return json(request, env, { message: 'Worker ist nicht vollständig konfiguriert.' }, 503);
      }
      return await handle(request, env);
    } catch (error) {
      console.error('Offline map worker request failed', { name: error?.name, message: error?.message });
      return json(request, env, { message: 'Offline-Karten-Dienst ist vorübergehend nicht verfügbar.' }, 502);
    }
  }
};

export { handle, newJobId, jobIdFromRun };
