const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const files = ['utils', 'storage', 'auth', 'employees', 'settings', 'leaves', 'attendance', 'payroll', 'payroll-export', 'admin', 'helper', 'employee-dashboard'];
let passed = 0;
async function test(name, callback) {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
}
function environment(initialBytes = new Map()) {
  const bytes = initialBytes;
  let writes = 0;
  let failKey = null;
  const window = {
    crypto,
    location: { replace() {} },
    localStorage: {
      get length() { return bytes.size; },
      getItem(key) { return bytes.get(key) ?? null; },
      setItem(key, value) { if (key === failKey) throw new Error('Quota exceeded'); writes++; bytes.set(key, value); },
      removeItem(key) { writes++; bytes.delete(key); },
    },
  };
  const context = vm.createContext({ window, document: { documentElement: { dataset: {} } }, Date, console });
  for (const file of files) vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../js/${file}.js`), 'utf8'), context, { filename: file });
  return { window, bytes, get writes() { return writes; }, failOn: (key) => { failKey = key; }, reloadAuth: (roles) => {
    context.document.documentElement.dataset = { roles, auth: 'pending' };
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/auth.js'), 'utf8'), context);
  } };
}
async function workspace() {
  const env = environment();
  const w = env.window;
  const admin = await w.HCMAuth.setup({ companyName: 'Memory test company', name: 'Admin', email: 'Admin@example.test', password: 'Example42', confirmPassword: 'Example42' });
  const employee = await w.HCMEmployees.save({ name: 'Employee One', email: 'one@example.test', password: 'Example42', department: 'Operations', salary: '22000' });
  const other = await w.HCMEmployees.save({ name: 'Employee Two', email: 'two@example.test', password: 'Example42', department: 'Design', salary: '44000' });
  return { ...env, w, admin, employee, other, as: (user) => w.HCMStorage.setSession({ currentUserId: user.id, role: user.role }) };
}
const record = (id, date, start, end, late = false) => ({ employeeId: id, date, checkIn: new Date(`${date}T${start}:00`).toISOString(), checkOut: end ? new Date(`${date}T${end}:00`).toISOString() : null, status: end && Number(end.slice(0, 2)) - Number(start.slice(0, 2)) < 5 ? 'half-day' : late ? 'late' : 'present', wasLate: late });
const leave = (id, employeeId, from, to, status = 'approved') => ({ id, employeeId, from, to, type: 'annual', days: 1, reason: 'Test', status, comment: '' });

(async () => {
  await test('All domain modules load with zero initial storage writes', () => {
    const env = environment();
    assert.equal(env.bytes.size, 0);
    assert.equal(env.writes, 0);
  });
  await test('Setup creates only company, admin and session; refuses a second setup', async () => {
    const env = environment();
    const w = env.window;
    const input = { companyName: ' Test ', name: ' Admin ', email: 'A@Example.test', password: 'Example42', confirmPassword: 'Wrong' };
    await assert.rejects(w.HCMAuth.setup(input), /match/);
    assert.equal(env.bytes.size, 0);
    const user = await w.HCMAuth.setup({ ...input, confirmPassword: 'Example42' });
    assert.equal(user.email, 'a@example.test');
    assert.equal(w.HCMStorage.getCompany().name, 'Test');
    assert.equal(env.bytes.size, 3);
    assert.equal(w.HCMStorage.getAttendance().length, 0);
    await assert.rejects(w.HCMAuth.setup({ ...input, confirmPassword: 'Example42' }), /replace existing/);
  });
  await test('Transactional setup rolls back after storage quota failure', async () => {
    const env = environment();
    env.failOn('hcm_users');
    await assert.rejects(env.window.HCMAuth.setup({ companyName: 'Test', name: 'Admin', email: 'a@example.test', password: 'Example42', confirmPassword: 'Example42' }), /rolled back/);
    assert.equal(env.bytes.size, 0);
  });
  await test('Login normalizes email, rejects bad credentials and repairs malformed session', async () => {
    const { w, admin, employee, bytes } = await workspace();
    w.HCMAuth.signOut();
    assert.equal(w.HCMAuth.getCurrentUser(), null);
    await assert.rejects(w.HCMAuth.login({ email: admin.email, password: 'wrong' }), /incorrect/);
    bytes.set('hcm_session', '{invalid');
    await w.HCMAuth.login({ email: ` ${employee.email.toUpperCase()} `, password: employee.password });
    assert.equal(w.HCMAuth.getCurrentUser().id, employee.id);
    assert.equal(w.HCMAuth.hasRole('admin'), false);
  });
  await test('Explicit role login rejects mismatches; switching accounts preserves workspace records', async () => {
    const { w, employee, admin } = await workspace();
    const before = JSON.stringify(w.HCMStorage.getSession());
    await assert.rejects(w.HCMAuth.login({ email: employee.email, password: employee.password, role: 'admin' }), /Employee login/);
    assert.equal(JSON.stringify(w.HCMStorage.getSession()), before);
    await w.HCMAuth.login({ email: employee.email, password: employee.password, role: 'employee' });
    assert.equal(w.HCMAuth.getCurrentUser().id, employee.id);
    await assert.rejects(w.HCMAuth.login({ email: admin.email, password: admin.password, role: 'employee' }), /Admin login/);
    let destination;
    w.location.replace = (url) => { destination = url; };
    w.HCMAuth.switchAccount('admin');
    assert.equal(destination, 'index.html?view=admin');
    assert.equal(w.HCMStorage.getSession(), null);
    assert.equal(w.HCMStorage.getUsers().length, 3);
    assert.ok(w.HCMStorage.getCompany());
    assert.throws(() => w.HCMAuth.switchAccount('owner'), /Choose/);
    w.HCMAuth.switchAccount('employee');
    assert.equal(destination, 'index.html?view=employee');
  });
  await test('Employee add/edit/search/filter validation and role boundaries', async () => {
    const { w, employee, as } = await workspace();
    await assert.rejects(w.HCMEmployees.save({ ...employee, email: 'ONE@EXAMPLE.TEST' }), /already in use/);
    await assert.rejects(w.HCMEmployees.save({ ...employee, email: 'new@example.test', salary: 0 }), /greater than zero/);
    const changed = await w.HCMEmployees.save({ ...employee, name: 'Renamed Employee', password: '', salary: 30000 }, employee.id);
    assert.equal(changed.password, employee.password);
    assert.equal(w.HCMEmployees.list('renamed', 'Operations').length, 1);
    assert.equal(w.HCMEmployees.list('missing').length, 0);
    as(employee);
    await assert.rejects(w.HCMEmployees.save(employee), /session/);
    assert.throws(() => w.HCMEmployees.list(), /session/);
  });
  await test('Settings persist without changing user records; invalid values rejected', async () => {
    const { w } = await workspace();
    const before = JSON.stringify(w.HCMStorage.getUsers());
    await w.HCMSettings.save({ name: 'Changed', startTime: '10:00', graceMinutes: '5', leaveQuota: '12' });
    assert.equal(w.HCMStorage.getCompany().startTime, '10:00');
    assert.equal(JSON.stringify(w.HCMStorage.getUsers()), before);
    await assert.rejects(w.HCMSettings.save({ name: 'Changed', startTime: '25:00', graceMinutes: 5, leaveQuota: 12 }), /start time/);
    await assert.rejects(w.HCMSettings.save({ name: 'Changed', startTime: '09:00', graceMinutes: -1, leaveQuota: 12 }), /Grace/);
  });
  await test('Local dates, leap years, weekend exclusion and invalid calendar ranges', () => {
    const { HCMUtils: U } = environment().window;
    assert.equal(U.countWorkingDays('2026-10-23', '2026-10-26'), 2);
    assert.equal(U.getWorkingDaysInMonth(2024, 2), 21);
    assert.equal(U.localDate(new Date(2026, 0, 1, 0, 1)), '2026-01-01');
    assert.equal(U.isWorkingDay('2026-10-24'), false);
    assert.throws(() => U.parseDate('2026-02-29'), /valid calendar/);
    assert.throws(() => U.countWorkingDays('2026-11-02', '2026-10-30'), /end date/);
    assert.throws(() => U.parseMonth('2026-13'), /valid month/);
  });
  await test('Attendance precision at grace cutoff; exact five-hour rule and missing checkout', () => {
    const U = environment().window.HCMUtils;
    const company = { startTime: '09:00', graceMinutes: 15 };
    assert.equal(U.calculateAttendanceStatus('2026-10-26T09:15:00', null, company).status, 'present');
    assert.equal(U.calculateAttendanceStatus('2026-10-26T09:15:01', null, company).status, 'late');
    assert.equal(U.calculateAttendanceStatus('2026-10-26T09:20:00', '2026-10-26T14:20:00', company).status, 'late');
    assert.equal(U.calculateAttendanceStatus('2026-10-26T09:00:00', '2026-10-26T13:59:59', company).status, 'half-day');
    assert.equal(U.calculateWorkedHours('2026-10-26T09:00:00', null), null);
    assert.throws(() => U.calculateWorkedHours('2026-10-26T10:00:00', '2026-10-26T09:00:00'), /invalid/);
  });
  await test('Check-in/out persists; duplicate operations, weekend and missing check-in are blocked', async () => {
    const { w, employee, as } = await workspace();
    as(employee);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 24, 9)), /Monday/);
    await assert.rejects(w.HCMAttendance.checkOut(new Date(2026, 9, 26, 15)), /Check in/);
    const start = await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9, 20));
    assert.equal(start.status, 'late');
    const duplicates = await Promise.allSettled([w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9, 21)), w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9, 22))]);
    assert.ok(duplicates.every((result) => result.status === 'rejected'));
    const end = await w.HCMAttendance.checkOut(new Date(2026, 9, 26, 13, 20));
    assert.equal(end.status, 'half-day');
    assert.equal(end.wasLate, true);
    assert.equal(w.HCMStorage.getAttendance().length, 1);
    await assert.rejects(w.HCMAttendance.checkOut(new Date(2026, 9, 26, 15)), /already/);
  });
  await test('Saved office policy is used for new check-ins and preserved after changes', async () => {
    const { w, employee, admin, as } = await workspace();
    await w.HCMSettings.save({ name: 'Test', startTime: '10:00', graceMinutes: 0, leaveQuota: 20 });
    as(employee);
    await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 10));
    as(admin);
    await w.HCMSettings.save({ name: 'Test', startTime: '08:00', graceMinutes: 0, leaveQuota: 20 });
    as(employee);
    const result = await w.HCMAttendance.checkOut(new Date(2026, 9, 26, 15, 30));
    assert.equal(result.status, 'present');
  });
  await test('Leave application, overlap, pending quota, approval, comment and duplicate decision', async () => {
    const { w, employee, admin, as } = await workspace();
    as(employee);
    const request = await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-01', to: '2027-01-04', reason: 'Annual break' });
    assert.equal(request.days, 2);
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).remaining, 20);
    await assert.rejects(w.HCMLeaves.apply({ type: 'annual', from: '2027-01-04', to: '2027-01-05', reason: 'Overlap' }), /overlap/);
    await assert.rejects(w.HCMLeaves.apply({ type: 'annual', from: '2027-01-02', to: '2027-01-03', reason: 'Weekend' }), /working day/);
    as(admin);
    await w.HCMLeaves.decide(request.id, 'approved', ' Enjoy your break ');
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).remaining, 18);
    assert.equal(w.HCMLeaves.list()[0].comment, 'Enjoy your break');
    await assert.rejects(w.HCMLeaves.decide(request.id, 'rejected'), /already/);
    as(employee);
    await assert.rejects(w.HCMLeaves.apply({ type: 'annual', from: '2027-02-01', to: '2027-03-15', reason: 'Too long' }), /Not enough/);
  });
  await test('Rejected leave restores request capacity without reducing approved balance', async () => {
    const { w, employee, admin, as } = await workspace();
    as(employee);
    const request = await w.HCMLeaves.apply({ type: 'personal', from: '2027-02-01', to: '2027-02-01', reason: 'Personal' });
    as(admin);
    await w.HCMLeaves.decide(request.id, 'rejected', 'Please choose a different date.');
    as(employee);
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).remaining, 20);
    await w.HCMLeaves.apply({ type: 'annual', from: '2027-02-01', to: '2027-02-01', reason: 'Reapply' });
    assert.equal(w.HCMLeaves.list().length, 2);
  });
  await test('Cross-year leave quota splits correctly and duplicate approved dates count once', () => {
    const { HCMLeaves: L } = environment().window;
    const leaves = [leave('a', 'one', '2026-12-31', '2027-01-04'), leave('b', 'one', '2027-01-01', '2027-01-04')];
    assert.equal(L.calculateLeaveBalance('one', 2026, leaves, 20).used, 1);
    assert.equal(L.calculateLeaveBalance('one', 2027, leaves, 20).used, 2);
  });
  await test('Pending requests reserve quota and lowered quota is revalidated at approval', async () => {
    const { w, employee, admin, as } = await workspace();
    await w.HCMSettings.save({ name: 'Test', startTime: '09:00', graceMinutes: 15, leaveQuota: 2 });
    as(employee);
    const pending = await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-04', to: '2027-01-05', reason: 'Two days' });
    await assert.rejects(w.HCMLeaves.apply({ type: 'annual', from: '2027-01-06', to: '2027-01-06', reason: 'Reserved' }), /Not enough/);
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).remaining, 2);
    as(admin);
    await w.HCMSettings.save({ name: 'Test', startTime: '09:00', graceMinutes: 15, leaveQuota: 1 });
    await assert.rejects(w.HCMLeaves.decide(pending.id, 'approved'), /Not enough/);
  });
  await test('Approved leave blocks attendance; attendance blocks conflicting leave approval', async () => {
    const { w, employee, as } = await workspace();
    w.HCMStorage.setLeaves([leave('paid', employee.id, '2026-10-26', '2026-10-26')]);
    as(employee);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9)), /approved paid leave/);
    assert.throws(() => w.HCMLeaves.validateRequest(leave('new', employee.id, '2026-10-27', '2026-10-27'), [], w.HCMStorage.getCompany(), [record(employee.id, '2026-10-27', '09:00', '15:00')]), /recorded attendance/);
  });
  await test('Past-month payroll: exact deductions, late + half day, approved leave and duplicates', () => {
    const w = environment().window;
    const employee = { id: 'one', salary: 22000, createdOn: '2026-10-01' };
    const attendance = [record('one', '2026-10-01', '09:00', '15:00'), record('one', '2026-10-02', '09:30', '13:30', true), record('one', '2026-10-02', '10:00', '13:00', true)];
    const leaves = [leave('paid', 'one', '2026-10-05', '2026-10-05'), leave('overlap', 'one', '2026-10-02', '2026-10-05')];
    const slip = w.HCMPayroll.calculate(employee, 2026, 10, { attendance, leaves, today: '2026-11-02' });
    assert.equal(slip.workingDays, 22);
    assert.equal(slip.presentDays, 2);
    assert.equal(slip.lateDays, 1);
    assert.equal(slip.halfDays, 1);
    assert.equal(slip.approvedLeaveDays, 1);
    assert.equal(slip.absentDays, 19);
    assert.equal(slip.dailyRate, 1000);
    assert.equal(slip.deduction, 19500);
    assert.equal(slip.netSalary, 2500);
  });
  await test('Current/future months never mark today or future dates absent', () => {
    const w = environment().window;
    const employee = { id: 'one', salary: 22000, createdOn: '2026-10-01' };
    const data = { attendance: [], leaves: [], today: '2026-10-05' };
    assert.equal(w.HCMPayroll.calculate(employee, 2026, 10, data).absentDays, 2);
    assert.equal(w.HCMPayroll.calculate(employee, 2026, 11, data).absentDays, 0);
    assert.equal(w.HCMPayroll.calculate(employee, 2026, 11, data).eligible, false);
    assert.equal(w.HCMPayroll.calculate({ ...employee, createdOn: '2026-10-05' }, 2026, 10, data).absentDays, 0);
    assert.equal(w.HCMPayroll.calculate({ ...employee, createdOn: '2026-11-01' }, 2026, 10, data).eligible, false);
  });
  await test('An open check-in is attended, not an automatic half day; no extra late deduction', () => {
    const w = environment().window;
    const slip = w.HCMPayroll.calculate({ id: 'one', salary: 22000, createdOn: '2026-10-01' }, 2026, 10, { today: '2026-10-01', attendance: [record('one', '2026-10-01', '09:30', null, true)], leaves: [] });
    assert.equal(slip.halfDays, 0);
    assert.equal(slip.lateDays, 1);
    assert.equal(slip.deduction, 0);
  });
  await test('All employee data queries enforce ownership; helper never looks up another person', async () => {
    const { w, employee, other, as } = await workspace();
    as(employee);
    assert.throws(() => w.HCMPayroll.calculatePayslip(other.id, 2026, 10), /own payslip/);
    assert.throws(() => w.HCMAttendance.records(other.id), /own attendance/);
    assert.throws(() => w.HCMLeaves.balance(other.id), /own leave/);
    assert.match(w.HCMHelper.answer('What is my salary?'), /22,000/);
    assert.doesNotMatch(w.HCMHelper.answer('What is my salary?'), /44,000/);
    assert.match(w.HCMHelper.answer('What is Employee Two salary?'), /only answer/);
    assert.match(w.HCMHelper.answer('What is Morgan’s salary?'), /only answer/);
    assert.match(w.HCMHelper.answer('How many leaves are remaining?'), /20/);
    assert.match(w.HCMHelper.answer('What is my attendance today?'), /Today:/);
    assert.match(w.HCMHelper.answer('What is my leave request status?'), /no leave requests/);
    assert.match(w.HCMHelper.answer('Show my payslip information'), /base/);
    assert.match(w.HCMHelper.answer('Unknown zebra'), /Ask about/);
  });
  await test('Admin helper reads live employee and pending leave counts', async () => {
    const { w, employee, admin, as } = await workspace();
    assert.match(w.HCMHelper.answer('How many employees are there?'), /2 active/);
    as(employee);
    await w.HCMLeaves.apply({ type: 'annual', from: '2027-05-03', to: '2027-05-03', reason: 'Test' });
    as(admin);
    assert.match(w.HCMHelper.answer('How many leave requests are pending?'), /1 leave/);
    assert.match(w.HCMHelper.answer('What is the office start time?'), /09:00/);
    assert.match(w.HCMHelper.answer('What is the company name?'), /Memory test company/);
  });
  await test('Deleting an employee cascades attendance and leave without deleting other records', async () => {
    const { w, employee, other } = await workspace();
    w.HCMStorage.setAttendance([record(employee.id, '2026-10-01', '09:00', '15:00'), record(other.id, '2026-10-01', '09:00', '15:00')]);
    w.HCMStorage.setLeaves([leave('one', employee.id, '2026-10-05', '2026-10-05'), leave('two', other.id, '2026-10-06', '2026-10-06')]);
    await w.HCMEmployees.remove(employee.id);
    assert.equal(w.HCMStorage.findById('users', employee.id), null);
    assert.equal(w.HCMStorage.getAttendance().length, 1);
    assert.equal(w.HCMStorage.getLeaves()[0].employeeId, other.id);
    assert.equal(w.HCMStorage.getUsers().length, 2);
  });
  await test('Malformed stored business data blocks writes and preserves original bytes', async () => {
    const { w, bytes } = await workspace();
    bytes.set('hcm_leaves', '{broken');
    await assert.rejects(w.HCMSettings.save({ name: 'Test', startTime: '09:00', graceMinutes: 15, leaveQuota: 20 }), /unreadable/);
    assert.equal(bytes.get('hcm_leaves'), '{broken');
  });
  await test('Calendar dates can be added, edited and removed without policy saves discarding them', async () => {
    const { w, employee, as } = await workspace();
    assert.equal(w.HCMStorage.getCompany().calendarExceptions, undefined);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: ' Company day off ' });
    assert.equal(w.HCMStorage.getCompany().calendarExceptions[0].name, 'Company day off');
    await w.HCMSettings.save({ name: 'Updated', startTime: '09:00', graceMinutes: 10, leaveQuota: 20 });
    assert.equal(w.HCMStorage.getCompany().calendarExceptions.length, 1);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-05', dayType: 'working', title: 'Shift day' }, '2027-01-04');
    assert.equal(w.HCMStorage.getCompany().calendarExceptions[0].date, '2027-01-05');
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-05', dayType: 'holiday', title: 'Duplicate' }), /already exists/);
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: '2027-02-30', dayType: 'holiday', title: 'Invalid' }), /valid calendar/);
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-06', dayType: 'other', title: 'Invalid' }), /Choose Holiday/);
    await w.HCMSettings.removeCalendarDay('2027-01-05');
    assert.equal(w.HCMStorage.getCompany().calendarExceptions.length, 0);
    as(employee);
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: 'Not allowed' }), /session/);
    await assert.rejects(w.HCMSettings.removeCalendarDay('2027-01-04'), /session/);
  });
  await test('Calendar overrides include weekend shifts and exclude weekday holidays in date counts', () => {
    const U = environment().window.HCMUtils;
    const holiday = { date: '2026-10-23', type: 'holiday', name: 'Holiday' };
    const extra = { date: '2026-10-24', type: 'working', name: 'Saturday shift' };
    assert.equal(U.isWorkingDay(holiday.date, [holiday]), false);
    assert.equal(U.isWorkingDay(extra.date, [extra]), true);
    assert.equal(U.calendarDay(holiday.date, [holiday]).name, 'Holiday');
    assert.equal(U.getWorkingDaysInMonth(2026, 10, [holiday]), 21);
    assert.equal(U.getWorkingDaysInMonth(2026, 10, [extra]), 23);
    assert.equal(U.countWorkingDays('2026-10-23', '2026-10-26', [holiday, extra]), 2);
  });
  await test('Company calendar controls check-in, absence and payroll for weekend shifts', async () => {
    const { w, employee, as } = await workspace();
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-02', dayType: 'working', title: 'Saturday shift' });
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: 'Company holiday' });
    const calendar = w.HCMStorage.getCompany().calendarExceptions;
    as(employee);
    await w.HCMAttendance.checkIn(new Date(2027, 0, 2, 9));
    await w.HCMAttendance.checkOut(new Date(2027, 0, 2, 15));
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2027, 0, 4, 9)), /holiday/);
    assert.equal(w.HCMAttendance.dayState(employee, '2027-01-04', [], [], '2027-01-05', calendar).status, 'holiday');
    assert.equal(w.HCMAttendance.dayState(employee, '2027-01-02', [], [], '2027-01-05', calendar).status, 'absent');
    const data = { today: '2027-01-05', calendar, attendance: w.HCMStorage.getAttendance(), leaves: [] };
    const slip = w.HCMPayroll.calculate(employee, 2027, 1, data);
    assert.equal(slip.presentDays, 1);
    assert.equal(slip.absentDays, 1);
    assert.equal(slip.halfDays, 0);
    assert.equal(slip.workingDays, w.HCMUtils.getWorkingDaysInMonth(2027, 1));
  });
  await test('Calendar edits recalculate approved leave days and balances in the same transaction', async () => {
    const { w, employee, admin, as } = await workspace();
    as(employee);
    const request = await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-01', to: '2027-01-04', reason: 'Calendar test' });
    as(admin);
    await w.HCMLeaves.decide(request.id, 'approved');
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-02', dayType: 'working', title: 'Saturday shift' });
    assert.equal(w.HCMStorage.getLeaves()[0].days, 3);
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).used, 3);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: 'Company holiday' });
    assert.equal(w.HCMStorage.getLeaves()[0].days, 2);
    assert.equal(w.HCMLeaves.balance(employee.id, 2027).used, 2);
    await w.HCMSettings.removeCalendarDay('2027-01-04');
    assert.equal(w.HCMStorage.getLeaves()[0].days, 3);
    as(employee);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2027, 0, 2, 9)), /approved paid leave/);
  });
  await test('New leave requests use holidays and extra working days rather than fixed weekdays', async () => {
    const { w, employee, as } = await workspace();
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-02', dayType: 'working', title: 'Saturday shift' });
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: 'Holiday' });
    as(employee);
    const request = await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-02', to: '2027-01-04', reason: 'Weekend workday off' });
    assert.equal(request.days, 1);
    await assert.rejects(w.HCMLeaves.apply({ type: 'annual', from: '2027-01-04', to: '2027-01-04', reason: 'Holiday only' }), /working day/);
  });
  await test('Calendar changes cannot introduce overlapping active requests or increase over-quota leave', async () => {
    const { w, employee, admin, as } = await workspace();
    as(employee);
    await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-01', to: '2027-01-02', reason: 'First request' });
    await w.HCMLeaves.apply({ type: 'annual', from: '2027-01-02', to: '2027-01-04', reason: 'Second request' });
    as(admin);
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-02', dayType: 'working', title: 'Conflict' }), /overlap/);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions, undefined);
    const second = await workspace();
    await second.w.HCMSettings.save({ name: 'Test', startTime: '09:00', graceMinutes: 15, leaveQuota: 2 });
    second.as(second.employee);
    await second.w.HCMLeaves.apply({ type: 'annual', from: '2027-01-01', to: '2027-01-04', reason: 'Two-day request' });
    second.as(second.admin);
    await assert.rejects(second.w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-02', dayType: 'working', title: 'Over quota' }), /allowance/);
    assert.equal(second.w.HCMStorage.getLeaves()[0].days, 2);
  });
  await test('Historical holiday changes preserve attendance and allow checkout without a holiday deduction', async () => {
    const { w, employee, admin, as } = await workspace();
    as(employee);
    await w.HCMAttendance.checkIn(new Date(2027, 0, 4, 9));
    as(admin);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-01-04', dayType: 'holiday', title: 'Holiday' });
    as(employee);
    await w.HCMAttendance.checkOut(new Date(2027, 0, 4, 10));
    const attendance = w.HCMStorage.getAttendance();
    const calendar = w.HCMStorage.getCompany().calendarExceptions;
    assert.equal(attendance[0].status, 'half-day');
    assert.equal(w.HCMAttendance.dayState(employee, '2027-01-04', attendance, [], '2027-01-04', calendar).record.checkOut, attendance[0].checkOut);
    const slip = w.HCMPayroll.calculate(employee, 2027, 1, { attendance, leaves: [], calendar, today: '2027-01-04' });
    assert.equal(slip.halfDays, 0);
    assert.equal(slip.presentDays, 0);
    assert.equal(slip.absentDays, 1);
  });
  await test('A month with all weekdays marked as holidays has a safe zero daily rate', () => {
    const w = environment().window;
    const calendar = w.HCMUtils.workingDates('2026-10-01', '2026-10-31').map((date) => ({ date, type: 'holiday', name: 'Shutdown' }));
    const slip = w.HCMPayroll.calculate({ id: 'one', salary: 22000 }, 2026, 10, { attendance: [], leaves: [], calendar, today: '2026-11-01' });
    assert.equal(slip.workingDays, 0);
    assert.equal(slip.dailyRate, 0);
    assert.equal(slip.deduction, 0);
    assert.equal(slip.netSalary, 22000);
  });
  await test('Calendar persistence rejects malformed and duplicate dates and rolls back failed updates', async () => {
    const env = await workspace();
    const { w } = env;
    const company = w.HCMStorage.getCompany();
    const day = { date: '2027-01-04', type: 'holiday', name: 'Holiday' };
    assert.throws(() => w.HCMStorage.setCompany({ ...company, calendarExceptions: [day, day] }), /Invalid company/);
    assert.throws(() => w.HCMStorage.setCompany({ ...company, calendarExceptions: [{ ...day, date: '2027-02-30' }] }), /Invalid company/);
    env.failOn('hcm_leaves');
    await assert.rejects(w.HCMSettings.saveCalendarDay({ calendarDate: day.date, dayType: day.type, title: day.name }), /Could not save/);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions, undefined);
  });
  const companyInput = (companyName, email = 'shared-admin@example.test') => ({ companyName, name: 'Company Admin', email, password: 'Company42', confirmPassword: 'Company42' });
  await test('Creating a second company preserves the first company and starts an isolated workspace', async () => {
    const { w, employee } = await workspace();
    const firstId = w.HCMStorage.getActiveCompanyId();
    w.HCMStorage.setAttendance([record(employee.id, '2026-10-23', '09:00', '15:00')]);
    w.HCMStorage.setLeaves([leave('first-leave', employee.id, '2027-01-04', '2027-01-04')]);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-02-01', dayType: 'holiday', title: 'First company holiday' });
    const first = JSON.stringify(w.HCMStorage.getWorkspace(firstId));
    const secondAdmin = await w.HCMAuth.createCompany(companyInput('Second company'));
    assert.equal(w.HCMStorage.listCompanies().length, 2);
    assert.notEqual(w.HCMStorage.getActiveCompanyId(), firstId);
    assert.equal(w.HCMStorage.getUsers().length, 1);
    assert.equal(w.HCMStorage.getUsers()[0].id, secondAdmin.id);
    assert.equal(w.HCMStorage.getAttendance().length, 0);
    assert.equal(w.HCMStorage.getLeaves().length, 0);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions, undefined);
    assert.equal(JSON.stringify(w.HCMStorage.getWorkspace(firstId)), first);
    await assert.rejects(w.HCMAuth.createCompany(companyInput(' second COMPANY ')), /already exists/);
  });
  await test('Company-specific login validates credentials before switching and never mixes duplicate emails', async () => {
    const { w, employee, admin } = await workspace();
    const firstId = w.HCMStorage.getActiveCompanyId();
    const secondAdmin = await w.HCMAuth.createCompany(companyInput('Second company', admin.email));
    const secondId = w.HCMStorage.getActiveCompanyId();
    const secondEmployee = await w.HCMEmployees.save({ ...employee, salary: 55000, password: 'OtherPassword' });
    await assert.rejects(w.HCMAuth.login({ companyId: secondId, email: employee.email, password: employee.password, role: 'employee' }), /selected company/);
    assert.equal(w.HCMStorage.getActiveCompanyId(), secondId);
    assert.equal(w.HCMAuth.getCurrentUser().id, secondAdmin.id);
    await w.HCMAuth.login({ companyId: firstId, email: employee.email, password: employee.password, role: 'employee' });
    assert.equal(w.HCMAuth.getCurrentUser().id, employee.id);
    assert.equal(w.HCMStorage.getCompany().name, 'Memory test company');
    await assert.rejects(w.HCMAuth.login({ companyId: secondId, email: admin.email, password: admin.password, role: 'admin' }), /selected company/);
    assert.equal(w.HCMStorage.getActiveCompanyId(), firstId);
    await w.HCMAuth.login({ companyId: secondId, email: secondEmployee.email, password: secondEmployee.password, role: 'employee' });
    assert.equal(w.HCMAuth.getCurrentUser().salary, 55000);
    assert.match(w.HCMHelper.answer('What is my salary?'), /55,000/);
    assert.throws(() => w.HCMPayroll.calculatePayslip(employee.id, 2026, 10), /own payslip/);
    assert.throws(() => w.HCMAttendance.records(employee.id), /own attendance/);
  });
  await test('Company snapshots stay current across employee, calendar, policy and rename changes', async () => {
    const env = await workspace();
    const { w, employee, admin } = env;
    const firstId = w.HCMStorage.getActiveCompanyId();
    await w.HCMAuth.createCompany(companyInput('Second company'));
    const secondId = w.HCMStorage.getActiveCompanyId();
    const newEmployee = await w.HCMEmployees.save({ ...employee, salary: 61000 });
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2027-02-01', dayType: 'holiday', title: 'Second holiday' });
    await w.HCMAuth.renameCompany('Renamed second', secondId);
    assert.equal(w.HCMStorage.listCompanies().find((entry) => entry.id === secondId).name, 'Renamed second');
    await assert.rejects(w.HCMSettings.save({ name: 'Memory test company', startTime: '09:00', graceMinutes: 15, leaveQuota: 20 }), /already exists/);
    await w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password, role: 'admin' });
    assert.equal(w.HCMEmployees.list().length, 2);
    assert.equal(w.HCMStorage.findById('users', newEmployee.id), null);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions, undefined);
    await w.HCMAuth.login({ companyId: secondId, email: 'shared-admin@example.test', password: 'Company42', role: 'admin' });
    assert.equal(w.HCMEmployees.list().length, 1);
    assert.equal(w.HCMEmployees.list()[0].salary, 61000);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions[0].name, 'Second holiday');
    const restored = environment(env.bytes).window;
    assert.equal(restored.HCMStorage.listCompanies().length, 2);
    assert.equal(restored.HCMAuth.getCurrentUser().role, 'admin');
    assert.equal(restored.HCMStorage.getCompany().name, 'Renamed second');
  });
  await test('Legacy company records migrate only when another company is created, preserving IDs and history', async () => {
    const env = environment();
    const w = env.window;
    const legacyAdmin = { id: 'old-admin', name: 'Old Admin', email: 'old@example.test', password: 'Example42', role: 'admin', department: '', salary: 0 };
    const oldCompany = { name: 'Existing legacy company', startTime: '08:00', graceMinutes: 5, leaveQuota: 17, calendarExceptions: [{ date: '2027-02-01', type: 'holiday', name: 'Legacy holiday' }] };
    w.HCMStorage.setCompany(oldCompany);
    w.HCMStorage.setUsers([legacyAdmin]);
    w.HCMStorage.setAttendance([record('legacy-employee', '2026-10-23', '08:00', '15:00')]);
    w.HCMStorage.setLeaves([leave('legacy-leave', 'legacy-employee', '2027-01-04', '2027-01-04')]);
    w.HCMStorage.setSession({ currentUserId: legacyAdmin.id, role: 'admin' });
    const writes = env.writes;
    assert.equal(w.HCMStorage.listCompanies()[0].id, 'legacy-company');
    assert.equal(env.writes, writes);
    assert.equal(w.HCMStorage.readJSON(w.HCMStorage.keys.companies), null);
    await w.HCMAuth.createCompany(companyInput('New company'));
    await w.HCMAuth.login({ companyId: 'legacy-company', email: legacyAdmin.email, password: legacyAdmin.password });
    assert.equal(w.HCMAuth.getCurrentUser().id, 'old-admin');
    assert.equal(w.HCMStorage.getCompany().leaveQuota, 17);
    assert.equal(w.HCMStorage.getCompany().calendarExceptions[0].name, 'Legacy holiday');
    assert.equal(w.HCMStorage.getAttendance()[0].employeeId, 'legacy-employee');
    assert.equal(w.HCMStorage.getLeaves()[0].id, 'legacy-leave');
  });
  await test('Only the active company admin can rename or delete it; deletion preserves other workspaces', async () => {
    const { w, admin } = await workspace();
    const firstId = w.HCMStorage.getActiveCompanyId();
    const first = JSON.stringify(w.HCMStorage.getWorkspace(firstId));
    await w.HCMAuth.createCompany(companyInput('Second company'));
    const secondId = w.HCMStorage.getActiveCompanyId();
    const worker = await w.HCMEmployees.save({ name: 'Second worker', email: 'worker@example.test', password: 'Example42', department: 'Design', salary: 40000 });
    await assert.rejects(w.HCMAuth.renameCompany('Wrong target', firstId), /active company changed/);
    await assert.rejects(w.HCMAuth.deleteCompany('Memory test company', firstId), /active company changed/);
    await assert.rejects(w.HCMAuth.deleteCompany('wrong name', secondId), /exactly/);
    await w.HCMAuth.login({ companyId: secondId, email: worker.email, password: worker.password });
    await assert.rejects(w.HCMAuth.renameCompany('No permission', secondId), /session/);
    await assert.rejects(w.HCMAuth.deleteCompany('Second company', secondId), /session/);
    await w.HCMAuth.login({ companyId: secondId, email: 'shared-admin@example.test', password: 'Company42' });
    await w.HCMAuth.deleteCompany('Second company', secondId);
    assert.equal(w.HCMStorage.listCompanies().length, 1);
    assert.equal(w.HCMStorage.getWorkspace(secondId), null);
    assert.equal(w.HCMStorage.getSession(), null);
    assert.equal(JSON.stringify(w.HCMStorage.getWorkspace(firstId)), first);
    await w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password });
    assert.equal(w.HCMEmployees.list().length, 2);
    await w.HCMAuth.deleteCompany('Memory test company', firstId);
    assert.equal(w.HCMStorage.listCompanies().length, 0);
    assert.equal(w.HCMStorage.getCompany(), null);
    assert.equal(w.HCMStorage.getUsers().length, 0);
    await w.HCMAuth.createCompany(companyInput('A fresh company'));
    assert.equal(w.HCMStorage.listCompanies().length, 1);
    assert.equal(w.HCMStorage.getCompany().name, 'A fresh company');
  });
  await test('Failed multi-company creation and switching restore the prior workspace without data loss', async () => {
    const env = await workspace();
    const { w, admin } = env;
    const firstId = w.HCMStorage.getActiveCompanyId();
    const before = JSON.stringify([...env.bytes.entries()].sort());
    env.failOn('hcm_users');
    await assert.rejects(w.HCMAuth.createCompany(companyInput('Should fail')), /Could not save/);
    assert.equal(JSON.stringify([...env.bytes.entries()].sort()), before);
    env.failOn(null);
    await w.HCMAuth.createCompany(companyInput('Second company'));
    const secondId = w.HCMStorage.getActiveCompanyId();
    const secondBefore = JSON.stringify([...env.bytes.entries()].sort());
    env.failOn('hcm_leaves');
    await assert.rejects(w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password }), /Could not save/);
    assert.equal(JSON.stringify([...env.bytes.entries()].sort()), secondBefore);
    assert.equal(w.HCMStorage.getActiveCompanyId(), secondId);
    env.failOn(null);
  });
  await test('Malformed company registry blocks mutations and is never silently overwritten', async () => {
    const { w, bytes } = await workspace();
    await w.HCMAuth.createCompany(companyInput('Second company'));
    bytes.set('hcm_companies', '{broken registry');
    const before = bytes.get('hcm_company');
    await assert.rejects(w.HCMAuth.createCompany(companyInput('Another company')), /unreadable/);
    assert.equal(bytes.get('hcm_companies'), '{broken registry');
    assert.equal(bytes.get('hcm_company'), before);
  });
  await test('Company-bound sessions and stale protected pages cannot operate in a switched workspace', async () => {
    const env = await workspace();
    const { w, admin } = env;
    const firstId = w.HCMStorage.getActiveCompanyId();
    await w.HCMAuth.createCompany(companyInput('Second company'));
    const secondId = w.HCMStorage.getActiveCompanyId();
    await w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password });
    env.reloadAuth('admin');
    await w.HCMAuth.login({ companyId: secondId, email: 'shared-admin@example.test', password: 'Company42' });
    assert.throws(() => w.HCMAuth.requireRole('admin'), /active company or account changed/);
    const session = w.HCMStorage.getSession();
    w.HCMStorage.setSession({ ...session, companyId: firstId });
    assert.equal(w.HCMAuth.getCurrentUser(), null);
  });
  await test('Employee calendar follows Monday-first layout and includes every leap-year date', () => {
    const w = environment().window;
    const employee = { id: 'one', name: 'Employee', salary: 22000 };
    const model = w.HCMEmployeeDashboard.buildMonth(employee, 2024, 2, { attendance: [], leaves: [], calendar: [] }, new Date(2024, 1, 15, 10));
    assert.equal(model.cells.slice(0, 3).every((cell) => cell === null), true);
    assert.equal(model.days.length, 29);
    assert.equal(model.days.at(-1).date, '2024-02-29');
    assert.equal(model.cells.length % 7, 0);
    assert.equal(model.days.find((day) => day.date === '2024-02-16').status, 'scheduled');
    assert.equal(model.days.find((day) => day.date === '2024-02-17').status, 'non-working');
    assert.equal(model.days.find((day) => day.date === '2024-02-15').status, 'not-started');
    assert.equal(model.days.find((day) => day.date === '2024-02-14').status, 'absent');
  });
  await test('Calendar indicators and details respect attendance, future paid leave and company exceptions', () => {
    const w = environment().window;
    const employee = { id: 'one', salary: 22000, createdOn: '2026-10-20' };
    const calendar = [{ date: '2026-10-24', type: 'working', name: 'Saturday shift' }, { date: '2026-10-26', type: 'holiday', name: 'Company holiday' }];
    const model = w.HCMEmployeeDashboard.buildMonth(employee, 2026, 10, { calendar,
      attendance: [record('one', '2026-10-22', '09:30', '15:30', true), record('one', '2026-10-23', '09:00', '13:00')],
      leaves: [leave('paid', 'one', '2026-10-26', '2026-10-27')] }, new Date(2026, 9, 23, 16));
    const day = (date) => model.days.find((entry) => entry.date === date);
    assert.equal(day('2026-10-19').status, 'not-employed');
    assert.equal(day('2026-10-22').status, 'late');
    assert.equal(day('2026-10-22').workedHours, 6);
    assert.equal(day('2026-10-23').status, 'half-day');
    assert.equal(day('2026-10-24').status, 'scheduled');
    assert.equal(day('2026-10-24').calendarName, 'Saturday shift');
    assert.equal(day('2026-10-26').status, 'holiday');
    assert.equal(day('2026-10-27').status, 'leave');
    assert.equal(day('2026-10-27').leave.id, 'paid');
    assert.equal(model.summary.presentDays, 2);
    assert.equal(model.summary.lateDays, 1);
    assert.equal(model.summary.halfDays, 1);
    assert.equal(model.summary.absentDays, 2);
    assert.equal(w.HCMEmployeeDashboard.totalWorkedHours(model), 10);
  });
  await test('Calendar ignores other employees and deduplicates same-day attendance consistently with payroll', () => {
    const w = environment().window;
    const model = w.HCMEmployeeDashboard.buildMonth({ id: 'one', salary: 22000 }, 2026, 10, {
      attendance: [record('one', '2026-10-01', '09:00', '15:00'), record('one', '2026-10-01', '10:00', '13:00'), record('two', '2026-10-01', '08:00', '17:00')],
      leaves: [leave('private', 'two', '2026-10-02', '2026-10-02')] }, new Date(2026, 9, 2, 16));
    assert.equal(model.summary.presentDays, 1);
    assert.equal(w.HCMEmployeeDashboard.totalWorkedHours(model), 6);
    assert.equal(model.days.find((day) => day.date === '2026-10-01').record.checkIn, new Date('2026-10-01T09:00:00').toISOString());
    assert.equal(model.days.some((day) => day.leave), false);
    assert.equal(model.days.some((day) => day.record?.employeeId === 'two'), false);
  });
  await test('Live duration survives reload, advances from the saved timestamp and stops at checkout', () => {
    const w = environment().window;
    const M = w.HCMEmployeeDashboard;
    const checkIn = new Date(2026, 9, 26, 9, 0, 0).toISOString();
    const now = new Date(2026, 9, 26, 10, 1, 1);
    assert.equal(M.formatDuration(M.elapsedSeconds(checkIn, null, now)), '01:01:01');
    const attendance = [{ employeeId: 'one', date: '2026-10-26', checkIn, checkOut: null, status: 'present' }];
    const first = M.buildMonth({ id: 'one', salary: 22000 }, 2026, 10, { attendance, leaves: [] }, now);
    const reloaded = M.buildMonth({ id: 'one', salary: 22000 }, 2026, 10, { attendance: JSON.parse(JSON.stringify(attendance)), leaves: [] }, now);
    assert.equal(M.totalWorkedHours(first, now), M.totalWorkedHours(reloaded, now));
    assert.equal(M.totalWorkedHours(first, new Date(2026, 9, 26, 11)), 2);
    assert.equal(first.summary.halfDays, 0);
    attendance[0].checkOut = new Date(2026, 9, 26, 10).toISOString();
    attendance[0].status = 'half-day';
    const checkedOut = M.buildMonth({ id: 'one', salary: 22000 }, 2026, 10, { attendance, leaves: [] }, new Date(2026, 9, 26, 12));
    assert.equal(checkedOut.activeCheckIn, null);
    assert.equal(M.totalWorkedHours(checkedOut, new Date(2026, 9, 26, 17)), 1);
    assert.equal(checkedOut.summary.halfDays, 1);
    assert.equal(M.elapsedSeconds('invalid'), 0);
    assert.equal(M.elapsedSeconds(checkIn, null, new Date(2026, 9, 26, 8)), 0);
  });
  await test('Past open check-ins do not accumulate fabricated hours and empty calendar views seed nothing', () => {
    const env = environment();
    const M = env.window.HCMEmployeeDashboard;
    const model = M.buildMonth({ id: 'one', salary: 22000 }, 2026, 10, { attendance: [record('one', '2026-10-01', '09:00', null)], leaves: [] }, new Date(2026, 9, 26, 10));
    assert.equal(model.openRecords, 1);
    assert.equal(model.activeCheckIn, null);
    assert.equal(M.totalWorkedHours(model), 0);
    const empty = M.buildMonth({ id: 'one', salary: 22000, createdOn: '2026-10-26' }, 2026, 9, { attendance: [], leaves: [] }, new Date(2026, 9, 26, 10));
    assert.equal(empty.hasAttendance, false);
    assert.equal(empty.summary.absentDays, 0);
    assert.equal(env.writes, 0);
  });
  await test('Employee dashboard data is role-scoped and greetings follow local hours', async () => {
    const { w, employee, as } = await workspace();
    const M = w.HCMEmployeeDashboard;
    assert.throws(() => M.getMonth(2026, 10), /session/);
    as(employee);
    assert.equal(M.getMonth(2026, 10).days.length, 31);
    assert.equal(M.greeting(new Date(2026, 9, 26, 8)), 'Good morning');
    assert.equal(M.greeting(new Date(2026, 9, 26, 14)), 'Good afternoon');
    assert.equal(M.greeting(new Date(2026, 9, 26, 20)), 'Good evening');
  });
  await test('Monthly payroll records paid and unpaid per employee and period without changing calculations', async () => {
    const { w, employee, other } = await workspace();
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    const initial = JSON.stringify(w.HCMPayroll.calculatePayslip(employee.id, year, month));
    assert.equal(w.HCMPayroll.payment(employee.id, year, month), null);
    const paid = await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid');
    assert.equal(paid.amount, employee.salary); assert.equal(paid.status, 'paid');
    assert.equal(JSON.stringify(w.HCMPayroll.calculatePayslip(employee.id, year, month)), initial);
    assert.equal(w.HCMPayroll.payment(other.id, year, month), null);
    assert.equal(w.HCMPayroll.listPayroll(year, month).filter((row) => row.payment?.status === 'paid').length, 1);
    await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid');
    assert.equal(w.HCMStorage.getCompany().payrollPayments.length, 1);
    assert.equal(w.HCMPayroll.payment(employee.id, year, month).updatedAt, paid.updatedAt);
    await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'unpaid');
    assert.equal(w.HCMPayroll.payment(employee.id, year, month).status, 'unpaid');
    await assert.rejects(w.HCMPayroll.setPaymentStatus(employee.id, year + 1, month, 'paid'), /unavailable/);
    await assert.rejects(w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'unknown'), /Choose/);
  });
  await test('Paid amount snapshots survive salary changes; employees cannot manage or inspect others payroll', async () => {
    const { w, employee, other, as } = await workspace();
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid');
    await w.HCMEmployees.save({ ...employee, salary: 33000, password: '' }, employee.id);
    assert.equal(w.HCMPayroll.payment(employee.id, year, month).amount, 22000);
    assert.equal(w.HCMPayroll.calculatePayslip(employee.id, year, month).netSalary, 33000);
    as(employee);
    assert.equal(w.HCMPayroll.payment(employee.id, year, month).status, 'paid');
    assert.throws(() => w.HCMPayroll.payment(other.id, year, month), /own payslip/);
    assert.throws(() => w.HCMPayroll.listPayroll(year, month), /session/);
    assert.throws(() => w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'unpaid'), /session/);
    assert.throws(() => w.HCMPayrollExport.downloadPayroll(year, month), /session/);
    await assert.rejects(w.HCMPayrollExport.downloadPayslip(other.id, year, month), /own payslip/);
  });
  await test('Company switching and employee deletion preserve payroll isolation and remove orphan payments', async () => {
    const { w, employee, admin } = await workspace();
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    const firstId = w.HCMStorage.getActiveCompanyId();
    await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid');
    await w.HCMAuth.createCompany({ companyName: 'Payroll isolation', name: 'Other Admin', email: 'other-admin@example.test', password: 'Example42', confirmPassword: 'Example42' });
    assert.equal(w.HCMStorage.getCompany().payrollPayments, undefined);
    assert.equal(w.HCMPayroll.listPayroll(year, month).length, 0);
    assert.throws(() => w.HCMPayroll.payment(employee.id, year, month), /active employee/);
    await w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password, role: 'admin' });
    assert.equal(w.HCMPayroll.payment(employee.id, year, month).status, 'paid');
    await w.HCMEmployees.remove(employee.id);
    assert.equal(w.HCMStorage.getCompany().payrollPayments.length, 0);
  });
  await test('Failed payroll saves roll back; malformed payment metadata blocks writes without data reset', async () => {
    const env = await workspace(); const { w, employee } = env;
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    const original = env.bytes.get('hcm_company');
    env.failOn('hcm_company');
    await assert.rejects(w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid'), /save data/);
    assert.equal(env.bytes.get('hcm_company'), original);
    env.failOn(null);
    const bad = { ...JSON.parse(original), payrollPayments: [{ employeeId: employee.id, period: '2026-13', status: 'paid', amount: -1 }] };
    env.bytes.set('hcm_company', JSON.stringify(bad));
    assert.ok(w.HCMStorage.getIssues().includes('hcm_company'));
    await assert.rejects(w.HCMSettings.save({ name: 'Test', startTime: '09:00', graceMinutes: 15, leaveQuota: 20 }), /session/);
    assert.equal(env.bytes.get('hcm_company'), JSON.stringify(bad));
  });
  await test('CSV payroll exports actual amounts and statuses with escaped formulas, commas and quotes', async () => {
    const { w, employee } = await workspace();
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    await w.HCMPayroll.setPaymentStatus(employee.id, year, month, 'paid');
    const rows = w.HCMPayroll.listPayroll(year, month);
    rows[0].employee.name = '=HYPERLINK("malicious"),value';
    const csv = w.HCMPayrollExport.payrollCSV(rows, `${year}-${String(month).padStart(2, '0')}`, 'Company, Ltd');
    assert.ok(csv.startsWith('\uFEFF"Company"'));
    assert.ok(csv.includes('"Company, Ltd"'));
    assert.ok(csv.includes('"\'=HYPERLINK(""malicious""),value"'));
    assert.ok(csv.includes('"Paid","22000.00"'));
    assert.ok(csv.includes('"Not paid",""'));
    assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
  });
  await test('PDF export constructs a valid A4 page, binary image length and exact cross-reference offsets', () => {
    const { window: w } = environment();
    const jpeg = Uint8Array.from([255, 216, 0, 10, 128, 255, 217]);
    const bytes = w.HCMPayrollExport.imagePDF(jpeg, 1190, 1684);
    const pdf = Buffer.from(bytes).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.ok(pdf.includes('/MediaBox [0 0 595.28 841.89]'));
    assert.ok(pdf.includes('/Length 7 >>\nstream\n'));
    assert.ok(Buffer.from(bytes).includes(Buffer.from(jpeg)));
    const start = Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.equal(pdf.slice(start, start + 4), 'xref');
    const entries = pdf.slice(start).split('\n').slice(3, 8);
    entries.forEach((entry, index) => assert.ok(pdf.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj`)));
  });
  await test('Payroll workspace totals keep recorded paid amounts separate from estimated calculations', () => {
    const P = environment().window.HCMPayroll;
    const rows = [
      { employee: { name: 'Paid person' }, slip: { eligible: true, provisional: true, netSalary: 120 }, payment: { status: 'paid', amount: 100 } },
      { employee: { name: 'Unpaid person' }, slip: { eligible: true, provisional: true, netSalary: 80 }, payment: null },
      { employee: { name: 'Not employed' }, slip: { eligible: false, provisional: false, netSalary: 900 }, payment: null },
    ];
    const summary = P.summarize(rows);
    assert.equal(summary.net, 200); assert.equal(summary.paid, 100); assert.equal(summary.pending, 80);
    assert.equal(summary.paidCount, 1); assert.equal(summary.employeeCount, 2);
    assert.equal(summary.estimated, true); assert.equal(summary.changedPayments, true);
    assert.equal(rows[0].slip.provisional, true);
    assert.equal(P.summarize([]).net, 0); assert.equal(P.summarize([]).employeeCount, 0);
  });
  await test('Payroll search and payment filters combine without changing employee or payroll records', () => {
    const P = environment().window.HCMPayroll;
    const rows = [
      { employee: { name: 'Morgan Example' }, slip: { eligible: true }, payment: { status: 'paid' } },
      { employee: { name: 'Riley Timer' }, slip: { eligible: true }, payment: { status: 'unpaid' } },
      { employee: { name: 'New Employee' }, slip: { eligible: false }, payment: null },
    ];
    const before = JSON.stringify(rows);
    assert.equal(P.filterRows(rows, '  MORGAN ', 'paid').length, 1);
    assert.equal(P.filterRows(rows, 'Morgan', 'unpaid').length, 0);
    assert.equal(P.filterRows(rows, '', 'unpaid')[0].employee.name, 'Riley Timer');
    assert.equal(P.filterRows(rows, 'new', 'all').length, 1);
    assert.equal(P.filterRows(rows, 'missing').length, 0);
    assert.equal(P.filterRows([], '', 'all').length, 0);
    assert.equal(JSON.stringify(rows), before);
  });
  await test('General settings save only the name while preserving policies, calendar and payment metadata', async () => {
    const { w, employee } = await workspace();
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2026-12-25', dayType: 'holiday', title: 'Company holiday' });
    const now = new Date();
    await w.HCMPayroll.setPaymentStatus(employee.id, now.getFullYear(), now.getMonth() + 1, 'paid');
    const before = w.HCMStorage.getCompany();
    const updated = await w.HCMSettings.saveGeneral({ name: 'Refined workspace', startTime: '03:00', leaveQuota: 1 });
    assert.equal(updated.name, 'Refined workspace');
    assert.equal(updated.startTime, before.startTime); assert.equal(updated.graceMinutes, before.graceMinutes);
    assert.equal(updated.leaveQuota, before.leaveQuota);
    assert.equal(JSON.stringify(updated.calendarExceptions), JSON.stringify(before.calendarExceptions));
    assert.equal(JSON.stringify(updated.payrollPayments), JSON.stringify(before.payrollPayments));
    assert.equal(w.HCMStorage.listCompanies()[0].name, 'Refined workspace');
  });
  await test('Separate policy saves preserve the latest name, calendar, existing attendance and approved leave', async () => {
    const { w, employee } = await workspace();
    w.HCMStorage.setAttendance([record(employee.id, '2026-10-01', '09:10', '17:00', true)]);
    w.HCMStorage.setLeaves([leave('retained', employee.id, '2026-10-27', '2026-10-27')]);
    const attendance = JSON.stringify(w.HCMStorage.getAttendance()), leaves = JSON.stringify(w.HCMStorage.getLeaves());
    await w.HCMSettings.saveGeneral({ name: 'Latest saved name' });
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2026-12-25', dayType: 'holiday', title: 'Holiday' });
    const updated = await w.HCMSettings.savePolicies({ name: 'Stale form name', startTime: '10:00', graceMinutes: 25, leaveQuota: 30 });
    assert.equal(updated.name, 'Latest saved name'); assert.equal(updated.startTime, '10:00');
    assert.equal(updated.graceMinutes, 25); assert.equal(updated.leaveQuota, 30);
    assert.equal(updated.calendarExceptions.length, 1);
    assert.equal(JSON.stringify(w.HCMStorage.getAttendance()), attendance);
    assert.equal(JSON.stringify(w.HCMStorage.getLeaves()), leaves);
  });
  await test('Section saves validate blank and fractional policies and enforce employee access restrictions', async () => {
    const { w, employee, as } = await workspace();
    const before = JSON.stringify(w.HCMStorage.getCompany());
    await assert.rejects(w.HCMSettings.savePolicies({ startTime: '09:00', graceMinutes: '', leaveQuota: 20 }), /Enter a grace/);
    await assert.rejects(w.HCMSettings.savePolicies({ startTime: '09:00', graceMinutes: 0, leaveQuota: 1.5 }), /whole days/);
    await assert.rejects(w.HCMSettings.saveGeneral({ name: '  ' }), /required/);
    assert.equal(JSON.stringify(w.HCMStorage.getCompany()), before);
    as(employee);
    await assert.rejects(w.HCMSettings.saveGeneral({ name: 'Not allowed' }), /session/);
    await assert.rejects(w.HCMSettings.savePolicies({ startTime: '09:00', graceMinutes: 0, leaveQuota: 0 }), /session/);
    assert.equal(JSON.stringify(w.HCMStorage.getCompany()), before);
  });
  await test('Policy preview derives the grace cutoff, including midnight rollover and invalid input', () => {
    const settings = environment().window.HCMSettings;
    assert.equal(settings.lateThreshold('09:00', 15).time, '09:15');
    assert.equal(settings.lateThreshold('23:50', 20).time, '00:10');
    assert.equal(settings.lateThreshold('23:50', 20).nextDay, true);
    assert.equal(settings.lateThreshold('00:00', 0).time, '00:00');
    for (const [time, grace] of [['25:00', 15], ['09:00', -1], ['09:00', 1.5], ['09:00', ''], ['09:00', 241]]) assert.equal(settings.lateThreshold(time, grace), null);
  });
  await test('Section saves and duplicate-name validation remain isolated to the selected company', async () => {
    const { w, admin } = await workspace();
    const firstId = w.HCMStorage.getActiveCompanyId(), before = JSON.stringify(w.HCMStorage.getCompany());
    await w.HCMAuth.createCompany({ companyName: 'Separate settings company', name: 'Other Admin', email: 'settings-admin@example.test', password: 'Example42', confirmPassword: 'Example42' });
    await w.HCMSettings.saveGeneral({ name: 'Renamed second company' });
    await w.HCMSettings.savePolicies({ startTime: '08:30', graceMinutes: 5, leaveQuota: 25 });
    await assert.rejects(w.HCMSettings.saveGeneral({ name: 'Memory test company' }), /already exists/);
    assert.equal(w.HCMStorage.getCompany().name, 'Renamed second company');
    assert.equal(w.HCMStorage.getCompany().startTime, '08:30');
    assert.equal(JSON.stringify(w.HCMStorage.getWorkspace(firstId).company), before);
    await w.HCMAuth.login({ companyId: firstId, email: admin.email, password: admin.password, role: 'admin' });
    assert.equal(JSON.stringify(w.HCMStorage.getCompany()), before);
  });
  await test('Check-in enforces exact shift boundaries while checkout remains available after shift end', async () => {
    const { w, employee, other, as } = await workspace();
    as(employee);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 8, 59, 59, 999)), /opens/);
    assert.equal(w.HCMStorage.getAttendance().length, 0);
    const saved = await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9));
    assert.equal(saved.startTime, '09:00'); assert.equal(saved.endTime, '17:00'); assert.equal(saved.wasLate, false);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 10)), /already/);
    const out = await w.HCMAttendance.checkOut(new Date(2026, 9, 26, 18));
    assert.equal(out.status, 'present');
    await assert.rejects(w.HCMAttendance.checkOut(new Date(2026, 9, 26, 19)), /already/);
    as(other);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 17, 0, 0, 1)), /closed/);
    const atEnd = await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 17));
    assert.equal(atEnd.wasLate, true);
    assert.equal((await w.HCMAttendance.checkOut(new Date(2026, 9, 26, 17, 1))).status, 'half-day');
  });
  await test('Custom shifts control opening and lateness and preserve saved attendance snapshots after edits', async () => {
    const { w, admin, employee, other, as } = await workspace();
    await w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '10:00', endTime: '18:00', note: 'Adjusted hours' });
    as(employee);
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 9, 59)), /opens at 10:00/);
    const saved = await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 10, 15));
    assert.equal(saved.wasLate, false); assert.equal(saved.customShift, true); assert.equal(saved.shiftNote, 'Adjusted hours');
    as(admin);
    await w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '11:00', endTime: '19:00', note: 'Changed later' }, '2026-10-26');
    await w.HCMSettings.savePolicies({ startTime: '08:00', endTime: '16:00', graceMinutes: 0, leaveQuota: 20 });
    as(employee);
    const out = await w.HCMAttendance.checkOut(new Date(2026, 9, 26, 18, 30));
    assert.equal(out.status, 'present'); assert.equal(out.startTime, '10:00'); assert.equal(out.endTime, '18:00'); assert.equal(out.graceMinutes, 15);
    as(other);
    const late = await w.HCMAttendance.checkIn(new Date(2026, 9, 26, 11, 0, 1));
    assert.equal(late.wasLate, true); assert.equal(late.startTime, '11:00');
  });
  await test('Custom hours never change holidays or weekends, while extra working days can use them', async () => {
    const { w, employee, as } = await workspace();
    await w.HCMSettings.saveShift({ date: '2026-10-24', startTime: '08:00', endTime: '14:00' });
    await w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '10:00', endTime: '18:00' });
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2026-10-26', dayType: 'holiday', title: 'Day off' });
    assert.equal(w.HCMAttendance.getEffectiveShift(w.HCMStorage.getActiveCompanyId(), '2026-10-24').isWorkingDay, false);
    assert.equal(w.HCMAttendance.getEffectiveShift(w.HCMStorage.getActiveCompanyId(), '2026-10-26').isWorkingDay, false);
    await w.HCMSettings.saveCalendarDay({ calendarDate: '2026-10-24', dayType: 'working', title: 'Saturday shift' });
    const working = w.HCMAttendance.getEffectiveShift(w.HCMStorage.getActiveCompanyId(), '2026-10-24');
    assert.equal(working.isWorkingDay, true); assert.equal(working.startTime, '08:00');
    as(employee);
    await w.HCMAttendance.checkIn(new Date(2026, 9, 24, 8));
    await assert.rejects(w.HCMAttendance.checkIn(new Date(2026, 9, 26, 10)), /holiday/);
  });
  await test('Shift CRUD validates ranges and duplicates without changing default shifts, leave or payroll data', async () => {
    const { w, employee } = await workspace();
    w.HCMStorage.setAttendance([record(employee.id, '2026-10-01', '09:00', '17:00')]);
    w.HCMStorage.setLeaves([leave('shift-safe', employee.id, '2026-10-27', '2026-10-27')]);
    const attendance = JSON.stringify(w.HCMStorage.getAttendance()), leaves = JSON.stringify(w.HCMStorage.getLeaves());
    await assert.rejects(w.HCMSettings.savePolicies({ startTime: '09:00', endTime: '08:00', graceMinutes: 15, leaveQuota: 20 }), /end time/);
    await assert.rejects(w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '17:00', endTime: '09:00' }), /daytime/);
    await w.HCMSettings.saveShift({ date: '2026-10-28', startTime: '10:00', endTime: '18:00' });
    await w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '08:00', endTime: '14:00' });
    assert.equal(w.HCMStorage.getCompany().shiftExceptions[0].date, '2026-10-26');
    await assert.rejects(w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '10:00', endTime: '18:00' }), /already exists/);
    await w.HCMSettings.removeShift('2026-10-26');
    assert.equal(w.HCMAttendance.getEffectiveShift(w.HCMStorage.getActiveCompanyId(), '2026-10-26').custom, false);
    assert.equal(w.HCMStorage.getCompany().startTime, '09:00'); assert.equal(w.HCMStorage.getCompany().endTime, '17:00');
    assert.equal(JSON.stringify(w.HCMStorage.getAttendance()), attendance); assert.equal(JSON.stringify(w.HCMStorage.getLeaves()), leaves);
  });
  await test('Shift overrides remain company-scoped and require Admin authorization', async () => {
    const { w, admin, employee } = await workspace();
    const original = w.HCMStorage.getActiveCompanyId();
    await w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '10:00', endTime: '18:00' });
    await w.HCMAuth.createCompany({ companyName: 'Shift company', name: 'Shift Admin', email: 'shift-admin@example.test', password: 'Example42', confirmPassword: 'Example42' });
    assert.equal(w.HCMAttendance.getEffectiveShift(w.HCMStorage.getActiveCompanyId(), '2026-10-26').custom, false);
    assert.throws(() => w.HCMAttendance.getEffectiveShift(original, '2026-10-26'), /active company/);
    await w.HCMAuth.login({ companyId: original, email: employee.email, password: employee.password, role: 'employee' });
    assert.equal(w.HCMAttendance.getEffectiveShift(original, '2026-10-26').startTime, '10:00');
    await assert.rejects(w.HCMSettings.saveShift({ date: '2026-10-27', startTime: '10:00', endTime: '18:00' }), /session/);
    await assert.rejects(w.HCMSettings.removeShift('2026-10-26'), /session/);
    await w.HCMAuth.login({ companyId: original, email: admin.email, password: admin.password, role: 'admin' });
    assert.equal(w.HCMStorage.getCompany().shiftExceptions.length, 1);
  });
  await test('Legacy shifts preserve existing starts without startup writes and reject invalid daytime windows', async () => {
    const env = environment();
    const legacy = { startTime: '08:00', graceMinutes: 5, calendarExceptions: [] };
    const shift = env.window.HCMAttendance.resolveShift(legacy, '2026-10-26');
    assert.equal(shift.startTime, '08:00'); assert.equal(shift.endTime, '17:00'); assert.equal(env.writes, 0);
    const lateLegacy = env.window.HCMAttendance.resolveShift({ ...legacy, startTime: '19:00' }, '2026-10-26');
    assert.equal(lateLegacy.valid, false);
    assert.equal(env.window.HCMAttendance.checkInWindow(lateLegacy, new Date(2026, 9, 26, 20)).state, 'invalid');
    assert.equal(env.window.HCMAttendance.checkInWindow(shift, new Date(2026, 9, 27, 9)).allowed, false);
    assert.equal(env.window.HCMAttendance.checkInWindow(shift, new Date(2026, 9, 26, 8)).allowed, true);
  });
  await test('Failed and malformed shift writes preserve stored bytes and existing records', async () => {
    const env = await workspace(); const w = env.w;
    const before = env.bytes.get('hcm_company'); env.failOn('hcm_company');
    await assert.rejects(w.HCMSettings.saveShift({ date: '2026-10-26', startTime: '10:00', endTime: '18:00' }), /save data/);
    assert.equal(env.bytes.get('hcm_company'), before); env.failOn(null);
    const bad = { ...JSON.parse(before), shiftExceptions: [{ date: '2026-10-26', startTime: '18:00', endTime: '09:00', note: '' }] };
    env.bytes.set('hcm_company', JSON.stringify(bad));
    assert.ok(w.HCMStorage.getIssues().includes('hcm_company'));
    assert.equal(w.HCMStorage.getCompany(), null); assert.equal(env.bytes.get('hcm_company'), JSON.stringify(bad));
  });
  await test('Departments expose six defaults without startup writes and retain existing legacy names', async () => {
    const env = environment(); const w = env.window;
    await w.HCMAuth.setup({ companyName: 'Department test', name: 'Admin', email: 'department-admin@example.test', password: 'Example42', confirmPassword: 'Example42' });
    const before = env.writes;
    assert.equal(w.HCMEmployees.defaultDepartments.length, 6);
    assert.equal(w.HCMEmployees.departments().length, 6);
    assert.equal(env.writes, before); assert.equal(w.HCMStorage.getCompany().departments, undefined);
    await w.HCMEmployees.save({ name: 'Legacy designer', email: 'legacy@example.test', password: 'Example42', department: 'Graphic Work', salary: 22000 });
    assert.ok(w.HCMEmployees.departments().includes('Graphic Work'));
    assert.equal(w.HCMEmployees.list('', 'graphic work').length, 1);
    assert.equal(w.HCMStorage.getUsers().find((user) => user.role === 'employee').department, 'Graphic Work');
  });
  await test('Admins can add persistent categories with blank, length and case-insensitive duplicate validation', async () => {
    const { w, bytes } = await workspace();
    assert.equal(await w.HCMEmployees.addDepartment('  Customer Success  '), 'Customer Success');
    assert.ok(w.HCMEmployees.departments().includes('Customer Success'));
    assert.equal(w.HCMStorage.getCompany().departments.length, 1);
    await assert.rejects(w.HCMEmployees.addDepartment('operations'), /already exists/);
    await assert.rejects(w.HCMEmployees.addDepartment('customer SUCCESS'), /already exists/);
    await assert.rejects(w.HCMEmployees.addDepartment('  '), /required/);
    await assert.rejects(w.HCMEmployees.addDepartment('x'.repeat(81)), /80/);
    const reloaded = environment(bytes);
    assert.ok(reloaded.window.HCMEmployees.departments().includes('Customer Success'));
    assert.equal(reloaded.writes, 0);
  });
  await test('Departments are company-scoped and category creation requires Admin access', async () => {
    const { w, admin, employee } = await workspace();
    const first = w.HCMStorage.getActiveCompanyId();
    await w.HCMEmployees.addDepartment('Customer Success');
    await w.HCMAuth.createCompany({ companyName: 'Other departments', name: 'Other Admin', email: 'other-department@example.test', password: 'Example42', confirmPassword: 'Example42' });
    assert.equal(w.HCMEmployees.departments().length, 6);
    assert.equal(w.HCMEmployees.departments().includes('Customer Success'), false);
    await w.HCMEmployees.addDepartment('Research');
    await w.HCMAuth.login({ companyId: first, email: employee.email, password: employee.password, role: 'employee' });
    assert.throws(() => w.HCMEmployees.departments(), /session/);
    await assert.rejects(w.HCMEmployees.addDepartment('Unauthorized'), /session/);
    await w.HCMAuth.login({ companyId: first, email: admin.email, password: admin.password, role: 'admin' });
    assert.ok(w.HCMEmployees.departments().includes('Customer Success'));
    assert.equal(w.HCMEmployees.departments().includes('Research'), false);
  });
  await test('Failed department writes and malformed categories preserve existing data', async () => {
    const env = await workspace(); const w = env.w;
    const before = env.bytes.get('hcm_company'), users = env.bytes.get('hcm_users');
    env.failOn('hcm_company');
    await assert.rejects(w.HCMEmployees.addDepartment('Customer Success'), /save data/);
    assert.equal(env.bytes.get('hcm_company'), before); assert.equal(env.bytes.get('hcm_users'), users);
    env.failOn(null);
    const bad = JSON.stringify({ ...JSON.parse(before), departments: ['Support', 'support'] });
    env.bytes.set('hcm_company', bad);
    assert.ok(w.HCMStorage.getIssues().includes('hcm_company')); assert.equal(env.bytes.get('hcm_company'), bad);
  });
  console.log(`\n${passed} application checks passed. Fixtures used isolated memory only.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
