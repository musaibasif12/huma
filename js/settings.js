(function () {
  'use strict';
  function save(input, section = 'all') {
    return window.HCMStorage.mutate(() => {
      window.HCMAuth.requireRole('admin');
      const current = window.HCMStorage.getCompany();
      if (section === 'general') input = { ...current, name: input.name };
      else if (section === 'policies') input = { ...current, startTime: input.startTime, endTime: input.endTime ?? current.endTime, graceMinutes: input.graceMinutes, leaveQuota: input.leaveQuota };
      if (section !== 'all' && [input.graceMinutes, input.leaveQuota].some((value) => String(value).trim() === '')) throw new Error('Enter a grace period and annual leave quota.');
      const company = { ...window.HCMStorage.getCompany(), name: window.HCMUtils.required(input.name, 'Company name'), startTime: input.startTime, graceMinutes: Number(input.graceMinutes), leaveQuota: Number(input.leaveQuota) };
      if (input.endTime !== undefined) company.endTime = input.endTime;
      if (window.HCMStorage.listCompanies().some((entry) => entry.id !== window.HCMStorage.getActiveCompanyId() && entry.name.toLowerCase() === company.name.toLowerCase())) throw new Error('A company with this name already exists.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(company.startTime)) throw new Error('Choose a valid office start time.');
      if (company.endTime !== undefined && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(company.endTime) || company.endTime <= company.startTime)) throw new Error('Shift end time must be later than start time. Choose a valid daytime shift.');
      if (!Number.isInteger(company.graceMinutes) || company.graceMinutes < 0 || company.graceMinutes > 240) throw new Error('Grace period must be 0–240 whole minutes.');
      if (!Number.isInteger(company.leaveQuota) || company.leaveQuota < 0 || company.leaveQuota > 366) throw new Error('Annual leave quota must be 0–366 whole days.');
      window.HCMStorage.transaction({ company });
      return company;
    });
  }
  function updateCalendar(company, calendar) {
    const S = window.HCMStorage;
    const U = window.HCMUtils;
    const leaves = S.getLeaves();
    const attendance = S.getAttendance();
    const reserved = new Map();
    const totals = new Map();
    for (const leave of leaves.filter((entry) => entry.status !== 'rejected')) {
      for (const date of U.workingDates(leave.from, leave.to, calendar)) {
        const key = `${leave.employeeId}/${date}`;
        if (reserved.has(key)) throw new Error('This calendar change would overlap active leave requests. Review the affected requests first.');
        reserved.set(key, true);
        const yearKey = `${leave.employeeId}/${date.slice(0, 4)}`;
        totals.set(yearKey, (totals.get(yearKey) || 0) + 1);
        if (!U.isWorkingDay(date, company.calendarExceptions || [])
          && attendance.some((record) => record.employeeId === leave.employeeId && record.date === date && record.checkIn)) {
          throw new Error('This extra working day would put an active leave request on a day with recorded attendance. Review the request first.');
        }
      }
    }
    for (const [key, total] of totals) {
      if (total <= company.leaveQuota) continue;
      const previous = new Set(leaves.filter((leave) => leave.status !== 'rejected' && key.startsWith(`${leave.employeeId}/`))
        .flatMap((leave) => U.workingDates(leave.from, leave.to, company.calendarExceptions || []))
        .filter((date) => date.startsWith(key.slice(key.lastIndexOf('/') + 1)))).size;
      if (total > previous) throw new Error('This extra working day would exceed an employee’s leave allowance. Review pending requests or the annual quota first.');
    }
    const updated = { ...company, calendarExceptions: calendar.sort((a, b) => a.date.localeCompare(b.date)) };
    S.transaction({ company: updated, leaves: leaves.map((leave) => ({ ...leave, days: U.countWorkingDays(leave.from, leave.to, calendar) })) });
    return updated;
  }
  function saveCalendarDay(input, originalDate = null) {
    return window.HCMStorage.mutate(() => {
      window.HCMAuth.requireRole('admin');
      const U = window.HCMUtils;
      U.parseDate(input.calendarDate);
      if (!['holiday', 'working'].includes(input.dayType)) throw new Error('Choose Holiday or Extra working day.');
      const entry = { date: input.calendarDate, type: input.dayType, name: U.required(input.title, 'Title', 100) };
      const company = window.HCMStorage.getCompany();
      const existing = company.calendarExceptions || [];
      if (originalDate && !existing.some((day) => day.date === originalDate)) throw new Error('This calendar entry no longer exists.');
      if (existing.some((day) => day.date === entry.date && day.date !== originalDate)) throw new Error('An entry already exists for this date. Edit the existing entry instead.');
      return updateCalendar(company, [...existing.filter((day) => day.date !== originalDate), entry]);
    });
  }
  function removeCalendarDay(date) {
    return window.HCMStorage.mutate(() => {
      window.HCMAuth.requireRole('admin');
      const company = window.HCMStorage.getCompany();
      const calendar = company.calendarExceptions || [];
      if (!calendar.some((day) => day.date === date)) throw new Error('This calendar entry no longer exists.');
      return updateCalendar(company, calendar.filter((day) => day.date !== date));
    });
  }
  function lateThreshold(startTime, graceMinutes) {
    const grace = Number(graceMinutes);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || String(graceMinutes).trim() === '' || !Number.isInteger(grace) || grace < 0 || grace > 240) return null;
    const [hours, minutes] = startTime.split(':').map(Number);
    const total = hours * 60 + minutes + grace;
    return { time: `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, nextDay: total >= 1440 };
  }
  function saveShift(input, originalDate = null) {
    return window.HCMStorage.mutate(() => {
      window.HCMAuth.requireRole('admin');
      window.HCMUtils.parseDate(input.date);
      const { startTime, endTime } = input;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) throw new Error('Choose a daytime shift with an end later than its start.');
      const note = String(input.note || '').trim();
      if (note.length > 240) throw new Error('Keep the shift note within 240 characters.');
      const company = window.HCMStorage.getCompany(), existing = company.shiftExceptions || [];
      if (originalDate && !existing.some((entry) => entry.date === originalDate)) throw new Error('This custom shift no longer exists.');
      if (existing.some((entry) => entry.date === input.date && entry.date !== originalDate)) throw new Error('A custom shift already exists for this date. Edit it instead.');
      const entry = { date: input.date, startTime, endTime, note };
      window.HCMStorage.transaction({ company: { ...company, shiftExceptions: [...existing.filter((entry) => entry.date !== originalDate), entry].sort((a, b) => a.date.localeCompare(b.date)) } });
      return entry;
    });
  }
  function removeShift(date) {
    return window.HCMStorage.mutate(() => {
      window.HCMAuth.requireRole('admin');
      const company = window.HCMStorage.getCompany();
      if (!company.shiftExceptions?.some((entry) => entry.date === date)) throw new Error('This custom shift no longer exists.');
      window.HCMStorage.transaction({ company: { ...company, shiftExceptions: company.shiftExceptions.filter((entry) => entry.date !== date) } });
    });
  }
  window.HCMSettings = Object.freeze({ save, saveGeneral: (input) => save(input, 'general'), savePolicies: (input) => save(input, 'policies'), lateThreshold, saveCalendarDay, removeCalendarDay, saveShift, removeShift });
}());
