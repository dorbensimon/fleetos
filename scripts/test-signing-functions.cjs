const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', 'supabase/functions');

function harness(name, options = {}) {
  const calls = [];
  const candidate = options.candidate;
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: options.noEmail ? null : 'driver@example.com' } } }) } },
    rpc: async () => ({ data: options.authorized !== false, error: null }),
    from(table) {
      let action = 'read'; let body; const filters = [];
      const query = new Proxy({}, { get(_target, key) {
        if (key === 'then') return (resolve, reject) => {
          calls.push({ table, action, body, filters });
          let data = null;
          if (table === 'signing_templates') data = { id: 'template', title: 'Health', docuseal_template_id: 12 };
          if (table === 'companies') data = { name: 'Company A' };
          if (table === 'profiles') data = filters.some(f => f[0] === 'in') ? [{ id: 'driver', full_name: 'Test Driver', phone: '0500000000' }] : { full_name: 'Manager' };
          if (table === 'driver_details') data = [{ id: 'driver', national_id: options.missingId ? null : '123456789' }];
          if (table === 'signature_requests') {
            data = action === 'read' ? (candidate ? [candidate] : options.existing || null) : { id: 'request' };
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        };
        return (...args) => {
          if (['insert', 'update', 'delete'].includes(key)) { action = key; body = args[0]; }
          else filters.push([key, ...args]);
          return query;
        };
      } });
      return query;
    },
  };
  const role = options.role || 'admin';
  const user = { ok: true, adminClient: admin, callerId: 'manager', userId: 'manager', callerRole: role, profile: { role, company_id: 'company' } };
  let handler;
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const requireLocal = id => {
      if (id.includes('verifyCompanyAccess')) return { verifyCompanyAccess: async () => options.denied ? { ok: false, status: 403, error: 'denied' } : user };
      if (id.includes('verifyUser')) return { verifyUser: async () => user };
      if (id.includes('@supabase/supabase-js')) return { createClient: () => admin };
      if (id.endsWith('/docuseal.ts')) return { docusealFetch: async (url, init = {}) => {
        calls.push({ url, method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
        if (options.remoteFailure || (options.failSubmission && init.method === 'POST') || (options.failCancellation && url.startsWith('/submissions/') && init.method === 'DELETE')) return new Response('{}', { status: 503 });
        const data = url.startsWith('/templates/') ? { submitters: [{ name: 'Driver', uuid: 'signer' }], fields: [{ name: 'driver_national_id', required: true }] }
          : url.startsWith('/submitters?') ? { data: [] }
          : init.method === 'POST' ? [{ id: 2, submission_id: 3, slug: 'link', sent_at: '2026-09-10T12:00:00Z' }]
          : options.remote || {};
        return new Response(JSON.stringify(data), { status: 200 });
      } };
      return load(path.resolve(path.dirname(file), id));
    };
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      Deno: { serve: fn => { handler = fn; }, env: { get: () => 'test-only' } },
      Response, Request, Headers, URLSearchParams, TextEncoder, crypto: require('node:crypto').webcrypto,
      console: { error() {} },
    }, { filename: file })(requireLocal, module, module.exports);
    return module.exports;
  }
  load(path.join(root, name, 'index.ts'));
  return { calls, async run(body) { const response = await handler(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'test' }, body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; } };
}

const send = { companyId: 'company', templateId: 'template', driverIds: ['driver'] };
test('a driver cannot send requests and tenant access denial stops before provider calls', async () => {
  for (const options of [{ role: 'driver' }, { denied: true }]) {
    const h = harness('assign-signing-template', options);
    assert.equal((await h.run(send)).status, 403);
    assert.equal(h.calls.length, 0);
  }
});
test('bulk sending is rejected by the actual handler', async () => {
  const h = harness('assign-signing-template');
  assert.equal((await h.run({ ...send, driverIds: ['a', 'b'] })).status, 400);
  assert.equal(h.calls.length, 0);
});
test('missing email or required profile data prevents creating or emailing a request', async () => {
  for (const options of [{ noEmail: true }, { missingId: true }]) {
    const h = harness('assign-signing-template', options);
    assert.equal((await h.run(send)).body.success, false);
    assert.equal(h.calls.some(c => c.action === 'insert' || c.method === 'POST'), false);
  }
});
test('sending again replaces the existing unsigned request before creating a fresh one', async () => {
  const h = harness('assign-signing-template', { existing: { id: 'request', docuseal_submitter_id: 2, docuseal_submission_id: 3, docuseal_submitter_slug: 'link' } });
  assert.equal((await h.run(send)).body.created, 1);
  assert.ok(h.calls.findIndex(c => c.method === 'DELETE') < h.calls.findIndex(c => c.method === 'POST'));
  assert.ok(h.calls.some(c => c.action === 'update' && c.body?.status === 'cancelled' && c.body?.archived_at));
});
test('a replacement never sends a new request when DocuSeal cannot cancel the old one', async () => {
  const h = harness('assign-signing-template', { existing: { id: 'request', docuseal_submitter_id: 2, docuseal_submission_id: 3, docuseal_submitter_slug: 'link' }, failCancellation: true });
  assert.equal((await h.run(send)).body.created, 0);
  assert.equal(h.calls.some(c => c.method === 'POST'), false);
});
test('successful send fills readonly details and remains available until it is signed or replaced', async () => {
  const h = harness('assign-signing-template');
  const result = await h.run(send);
  assert.equal(result.body.created, 1);
  const remote = h.calls.find(c => c.method === 'POST');
  assert.equal(remote.body.submitters.length, 1);
  assert.equal(remote.body.submitters[0].values.company_name, 'Company A');
  assert.equal(remote.body.submitters[0].fields.find(f => f.name === 'company_name').readonly, true);
  const saved = h.calls.find(c => c.action === 'update' && c.body?.sent_at);
  assert.equal(saved.body.expires_at, null);
  assert.equal(saved.body.sent_at, '2026-09-10T12:00:00.000Z');
  assert.equal('expire_at' in remote.body, false);
  assert.equal(remote.body.send_email, false);
  assert.equal(remote.body.submitters[0].send_email, false);
  const inserted = h.calls.find(c => c.action === 'insert' && c.table === 'signature_requests');
  assert.equal(inserted.body.next_email_reminder_at, null);
});
test('only Owner can rename a template', async () => {
  const h = harness('rename-signing-template', { role: 'admin' });
  assert.equal((await h.run({ templateId: 'template', title: 'Renamed' })).status, 403);
  assert.equal(h.calls.length, 0);
});
test('a transient submission error stays recoverable and is not reported as sent', async () => {
  const h = harness('assign-signing-template', { failSubmission: true });
  const result = await h.run(send);
  assert.equal(result.body.success, false);
  assert.equal(result.body.created, 0);
  assert.equal(h.calls.some(c => c.table === 'notifications' && c.action === 'insert'), false);
  assert.equal(h.calls.some(c => c.action === 'update' && c.body?.status === 'failed'), false);
});
test('an Owner rename updates the provider and template only, never signature requests', async () => {
  const h = harness('rename-signing-template', { role: 'owner' });
  assert.equal((await h.run({ templateId: 'template', title: 'New title' })).body.success, true);
  assert.equal(h.calls.find(c => c.method === 'PUT').body.name, 'New title');
  assert.equal(h.calls.some(c => c.table === 'signature_requests'), false);
});
const candidate = { id: 'request', status: 'pending', expires_at: '2020-01-03T00:00:00Z', docuseal_submission_id: 3 };
test('expiry audit is read-only by default and never silently substitutes archive for deletion', async () => {
  const h = harness('process-signing-expiry', { candidate, remote: { status: 'expired', expire_at: candidate.expires_at } });
  assert.equal((await h.run({})).body.eligible, 1);
  assert.equal(h.calls.some(c => c.action !== 'read' && c.table || c.method === 'DELETE'), false);
  assert.equal((await h.run({ dryRun: false })).status, 409);
});
test('late signature is preserved and never archived by cleanup', async () => {
  const h = harness('process-signing-expiry', { candidate, remote: { status: 'completed', completed_at: '2020-01-02T23:59:59Z' } });
  assert.equal((await h.run({ dryRun: false, remoteDisposition: 'archive' })).body.preserved, 1);
  assert.equal(h.calls.some(c => c.action === 'delete' || c.method === 'DELETE'), false);
});
test('provider failure never deletes local data', async () => {
  const h = harness('process-signing-expiry', { candidate, remoteFailure: true });
  await h.run({ dryRun: false, remoteDisposition: 'archive' });
  assert.equal(h.calls.some(c => c.action === 'delete'), false);
});
test('approved archive mode cancels remotely before local deletion', async () => {
  const h = harness('process-signing-expiry', { candidate, remote: { status: 'expired', expire_at: candidate.expires_at } });
  assert.equal((await h.run({ dryRun: false, remoteDisposition: 'archive' })).body.removed, 1);
  assert.ok(h.calls.findIndex(c => c.method === 'DELETE') < h.calls.findIndex(c => c.action === 'delete'));
});
test('unsigned local send with no remote record can be cleaned after confirmed lookup', async () => {
  const h = harness('process-signing-expiry', { candidate: { ...candidate, docuseal_submission_id: null } });
  assert.equal((await h.run({ dryRun: false, remoteDisposition: 'archive' })).body.removed, 1);
  assert.equal(h.calls.some(c => c.method === 'DELETE'), false);
});
test('an invalid scheduler credential stops before any database rows or remote API are read', async () => {
  const h = harness('process-signing-expiry', { authorized: false });
  assert.equal((await h.run({})).status, 401);
  assert.equal(h.calls.length, 0);
});
