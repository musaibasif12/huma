// Development-only checks. All fixtures stay in memory, outside browser storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
let checks = 0;
function test(name, callback) {
  callback();
  checks += 1;
  console.log(`PASS ${name}`);
}

function environment(roles) {
  const data = new Map();
  const redirects = [];
  let writes = 0;
  const localStorage = {
    get length() { return data.size; },
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { writes += 1; data.set(key, value); },
    removeItem: (key) => { writes += 1; data.delete(key); },
  };
  const document = { documentElement: { dataset: roles ? { roles, auth: 'pending' } : {} } };
  const window = { localStorage, location: { replace: (url) => redirects.push(url) } };
  const context = vm.createContext({ window, document });
  vm.runInContext(source('js/storage.js'), context);
  return {
    data, redirects, window, document, localStorage,
    get writes() { return writes; },
    auth: () => vm.runInContext(source('js/auth.js'), context),
  };
}

const company = { name: 'Test fixture', startTime: '09:00', graceMinutes: 15, leaveQuota: 20 };
const admin = { id: 'test-admin', name: 'Test Admin', email: 'admin@example.test', password: 'in-memory-only', role: 'admin', department: '', salary: 0 };
const employee = { ...admin, id: 'test-employee', role: 'employee' };
function withSession(role, allowedRoles) {
  const env = environment(allowedRoles);
  env.window.HCMStorage.setCompany(company);
  env.window.HCMStorage.setUsers([admin, employee]);
  env.window.HCMStorage.setSession({ currentUserId: role === 'admin' ? admin.id : employee.id, role });
  env.auth();
  return env;
}

test('Root index and six protected HTML pages have valid local assets and links', () => {
  const pagesRoot = path.join(root, 'pages');
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.html')), ['index.html']);
  const pages = fs.readdirSync(pagesRoot).filter((name) => name.endsWith('.html')).sort();
  assert.deepEqual(pages, ['admin.html', 'employee.html', 'employees.html', 'leaves.html', 'payslip.html', 'settings.html']);
  for (const page of ['index.html', ...pages.map((name) => `pages/${name}`)]) {
    const html = source(page);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<main\b/);
    assert.doesNotMatch(html, /\son\w+=/);
    for (const [, target] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(page), target)), `${page}: ${target} exists`);
    }
    if (page !== 'index.html') {
      assert.match(html, /data-auth="pending"/);
      assert.match(html, /data-roles="(?:admin|employee|admin,employee)"/);
      assert.ok(html.indexOf('src="../js/auth.js"') < html.indexOf('<body>'));
    }
  }
});

test('All application JavaScript parses', () => {
  for (const file of fs.readdirSync(path.join(root, 'js'))) new vm.Script(source(`js/${file}`));
});
test('Page URLs route correctly between the root entry and pages directory', () => {
  const env = environment(); env.auth();
  const auth = env.window.HCMAuth;
  assert.equal(auth.getHomePage('admin'), 'pages/admin.html');
  assert.equal(auth.getHomePage('employee'), 'pages/employee.html');
  assert.equal(auth.pageUrl('index.html?view=companies'), 'index.html?view=companies');
  assert.equal(auth.pageUrl('settings.html'), 'pages/settings.html');
  env.document.documentElement.dataset.roles = 'employee';
  env.document.documentElement.dataset.page = 'employee.html';
  assert.equal(auth.getHomePage('employee'), 'employee.html');
  assert.equal(auth.pageUrl('index.html?view=employee'), '../index.html?view=employee');
  assert.equal(auth.pageUrl('payslip.html?month=2026-10'), 'payslip.html?month=2026-10');
  assert.equal(auth.pageUrl('employee.html#leave-balance'), 'employee.html#leave-balance');
});

test('Missing storage returns safe defaults without writing or seeding', () => {
  const env = environment();
  const store = env.window.HCMStorage;
  assert.equal(store.getCompany(), null);
  assert.equal(store.getSession(), null);
  for (const records of [store.getUsers(), store.getAttendance(), store.getLeaves()]) assert.equal(records.length, 0);
  assert.equal(store.isAvailable(), true);
  env.auth();
  assert.equal(env.window.HCMAuth.getCurrentUser(), null);
  assert.equal(env.data.size, 0);
  assert.equal(env.writes, 0);
});

test('Malformed JSON and invalid shapes fail closed and preserve stored bytes', () => {
  const env = environment('admin');
  for (const key of Object.values(env.window.HCMStorage.keys)) env.data.set(key, '{broken');
  assert.equal(env.window.HCMStorage.getUsers().length, 0);
  assert.equal(env.window.HCMStorage.getAttendance().length, 0);
  assert.equal(env.window.HCMStorage.getLeaves().length, 0);
  assert.equal(env.window.HCMStorage.getCompany(), null);
  env.auth();
  assert.deepEqual(env.redirects, ['../index.html']);
  assert.equal(env.writes, 0);
  assert.ok([...env.data.values()].every((value) => value === '{broken'));
  env.data.set('hcm_users', JSON.stringify([null]));
  env.data.set('hcm_company', '[]');
  assert.equal(env.window.HCMStorage.getUsers().length, 0);
  assert.equal(env.window.HCMStorage.getCompany(), null);
});

test('Unavailable storage reads safely; failed writes surface actionable errors', () => {
  const env = environment('employee');
  Object.defineProperty(env.window, 'localStorage', { get() { throw new Error('Blocked'); } });
  assert.equal(env.window.HCMStorage.isAvailable(), false);
  assert.equal(env.window.HCMStorage.getCompany(), null);
  assert.equal(env.window.HCMStorage.getUsers().length, 0);
  assert.throws(() => env.window.HCMStorage.setCompany(company), /Could not save/);
  assert.throws(() => env.window.HCMStorage.clearSession(), /Could not remove/);
  env.auth();
  assert.deepEqual(env.redirects, ['../index.html']);
});

test('Invalid writes and unknown keys are rejected', () => {
  const env = environment();
  assert.throws(() => env.window.HCMStorage.setUsers([{}]), /Invalid/);
  assert.throws(() => env.window.HCMStorage.setCompany({ ...company, startTime: '29:00' }), /Invalid/);
  assert.throws(() => env.window.HCMStorage.setSession({ currentUserId: admin.id, role: 'owner' }), /Invalid/);
  assert.throws(() => env.window.HCMStorage.writeJSON('unrelated', []), /Unknown/);
  assert.equal(env.writes, 0);
});

test('Valid data round-trips through the five centralized accessors', () => {
  const env = environment();
  const store = env.window.HCMStorage;
  store.setCompany(company);
  store.setUsers([admin]);
  store.setAttendance([{ employeeId: employee.id, date: '2026-10-23', checkIn: null, checkOut: null, status: 'absent' }]);
  store.setLeaves([{ id: 'test-leave', employeeId: employee.id, type: 'paid', from: '2026-10-23', to: '2026-10-23', days: 1, reason: '', status: 'pending', comment: '' }]);
  store.setSession({ currentUserId: admin.id, role: 'admin' });
  assert.equal(store.getCompany().name, company.name);
  assert.equal(store.getUsers()[0].id, admin.id);
  assert.equal(store.getAttendance()[0].employeeId, employee.id);
  assert.equal(store.getLeaves()[0].status, 'pending');
  assert.equal(store.getSession().role, 'admin');
  assert.equal(env.data.size, 5);
});

test('All protected pages redirect when there is no valid session', () => {
  for (const roles of ['admin', 'employee', 'admin,employee']) {
    const env = environment(roles);
    env.auth();
    assert.deepEqual(env.redirects, ['../index.html']);
    assert.equal(env.document.documentElement.dataset.auth, 'pending');
    assert.equal(env.writes, 0);
  }
});

test('Role guards allow the correct home and shared payslip pages', () => {
  for (const role of ['admin', 'employee']) {
    for (const roles of [role, 'admin,employee']) {
      const env = withSession(role, roles);
      assert.equal(env.document.documentElement.dataset.auth, 'ready');
      assert.equal(env.redirects.length, 0);
    }
  }
});

test('Cross-role navigation redirects to the authenticated user home', () => {
  assert.deepEqual(withSession('employee', 'admin').redirects, ['employee.html']);
  assert.deepEqual(withSession('admin', 'employee').redirects, ['admin.html']);
});

test('Forged role, deleted user, duplicate ID, and missing company invalidate sessions', () => {
  for (const mutation of [
    (env) => env.data.set('hcm_session', JSON.stringify({ currentUserId: employee.id, role: 'admin' })),
    (env) => env.window.HCMStorage.setUsers([]),
    (env) => env.window.HCMStorage.setUsers([admin, admin]),
    (env) => env.data.delete('hcm_company'),
  ]) {
    const env = withSession('admin', 'admin');
    mutation(env);
    assert.equal(env.window.HCMAuth.getCurrentUser(), null);
    assert.equal(env.window.HCMAuth.guardPage('admin'), false);
    assert.deepEqual(env.redirects, ['../index.html']);
  }
});

test('Signing out removes only the session', () => {
  const env = withSession('admin', 'admin');
  env.window.HCMAuth.signOut();
  assert.equal(env.window.HCMStorage.getSession(), null);
  assert.equal(env.window.HCMStorage.getCompany().name, company.name);
  assert.equal(env.window.HCMStorage.getUsers().length, 2);
  assert.deepEqual(env.redirects, ['../index.html']);
});

console.log(`\n${checks} foundation checks passed. No browser data was created.`);
