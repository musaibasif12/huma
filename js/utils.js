(function () {
  'use strict';
  const pad = (value) => String(value).padStart(2, '0');
  function localDate(date = new Date()) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date.');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid calendar date.');
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    if (year < 1900 || year > 9999 || localDate(date) !== value) throw new Error('Choose a valid calendar date.');
    return date;
  }
  function calendarDay(value, calendar = []) {
    const date = typeof value === 'string' ? parseDate(value) : value;
    const key = localDate(date);
    const exception = calendar.find((entry) => entry.date === key);
    return { working: exception ? exception.type === 'working' : ![0, 6].includes(date.getDay()),
      type: exception?.type || 'regular', name: exception?.name || ([0, 6].includes(date.getDay()) ? 'Weekend' : 'Regular working day') };
  }
  const isWorkingDay = (value, calendar = []) => calendarDay(value, calendar).working;
  function dateRange(from, to) {
    const start = parseDate(from);
    const end = parseDate(to);
    if (start > end) throw new Error('The end date must be on or after the start date.');
    if (end.getFullYear() - start.getFullYear() > 5) throw new Error('Choose a range of five years or less.');
    const dates = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(localDate(cursor));
    return dates;
  }
  const workingDates = (from, to, calendar = []) => dateRange(from, to).filter((date) => isWorkingDay(date, calendar));
  const countWorkingDays = (from, to, calendar = []) => workingDates(from, to, calendar).length;
  function monthRange(year, month) {
    if (!Number.isInteger(year) || year < 1900 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a valid month.');
    return [localDate(new Date(year, month - 1, 1, 12)), localDate(new Date(year, month, 0, 12))];
  }
  function getWorkingDaysInMonth(year, month, calendar = []) { return countWorkingDays(...monthRange(year, month), calendar); }
  function parseMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value || '')) throw new Error('Choose a month.');
    const [year, month] = value.split('-').map(Number);
    monthRange(year, month);
    return { year, month };
  }
  function calculateWorkedHours(checkIn, checkOut) {
    if (!checkIn || !checkOut) return null;
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Attendance times are invalid.');
    return (end - start) / 3600000;
  }
  function calculateAttendanceStatus(checkIn, checkOut, company) {
    const time = new Date(checkIn);
    if (!Number.isFinite(time.getTime())) throw new Error('Invalid check-in time.');
    const [hours, minutes] = company.startTime.split(':').map(Number);
    const cutoff = new Date(time);
    cutoff.setHours(hours, minutes + company.graceMinutes, 0, 0);
    const wasLate = time > cutoff;
    const workedHours = calculateWorkedHours(checkIn, checkOut);
    return { wasLate, workedHours, status: workedHours !== null && workedHours < 5 ? 'half-day' : wasLate ? 'late' : 'present' };
  }
  const formatCurrency = (amount) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 }).format(amount);
  function formatDate(value, options = {}) {
    return (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : new Date(value))
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...options });
  }
  const formatTime = (value) => value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  const id = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : `hcm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  function required(value, label, max = 160) {
    const text = String(value ?? '').trim();
    if (!text) throw new Error(`${label} is required.`);
    if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
    return text;
  }
  function email(value) {
    const text = required(value, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('Enter a valid email address.');
    return text;
  }
  function password(value) {
    if (typeof value !== 'string' || !value.trim() || value.length < 6 || value.length > 128) throw new Error('Password must contain 6–128 characters.');
    return value;
  }
  const statusLabels = Object.freeze({ present: 'On time', late: 'Late', 'half-day': 'Half day', absent: 'Absent', leave: 'Paid leave', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', holiday: 'Holiday', 'non-working': 'Non-working day', 'not-started': 'Not checked in', scheduled: 'Upcoming', active: 'Active' });
  window.HCMUtils = Object.freeze({ localDate, parseDate, calendarDay, isWorkingDay, dateRange, workingDates, countWorkingDays, monthRange, parseMonth, getWorkingDaysInMonth, calculateWorkedHours, calculateAttendanceStatus, formatCurrency, formatDate, formatTime, id, required, email, password, statusLabels });
}());
