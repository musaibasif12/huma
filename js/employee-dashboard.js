(function () {
  "use strict";
  const U = window.HCMUtils;
  const labels = Object.freeze({
    present: "Present",
    late: "Late",
    "half-day": "Half day",
    absent: "Absent",
    leave: "Approved leave",
    "non-working": "Weekend",
    holiday: "Holiday",
    scheduled: "Future date",
    "not-started": "Not checked in",
    "not-employed": "Before joining",
  });

  function elapsedSeconds(checkIn, checkOut = null, now = new Date()) {
    const start = new Date(checkIn).getTime();
    const end = checkOut ? new Date(checkOut).getTime() : now.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.floor((end - start) / 1000));
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  }

  function greeting(now = new Date()) {
    return now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  }

  function buildMonth(employee, year, month, data, now = new Date()) {
    const [from, to] = U.monthRange(year, month);
    const today = U.localDate(now);
    const calendar = data.calendar || [];
    const attendance = data.attendance.filter(
      (record) => record.employeeId === employee.id,
    );
    const leaves = data.leaves.filter(
      (leave) => leave.employeeId === employee.id,
    );
    const paidDates = window.HCMLeaves.approvedDates(
      employee.id,
      leaves,
      calendar,
    );
    const days = U.dateRange(from, to).map((date) => {
      const info = U.calendarDay(date, calendar);
      const state = window.HCMAttendance.dayState(
        employee,
        date,
        attendance,
        leaves,
        today,
        calendar,
      );
      let status = state.status;
      if (status === "scheduled") {
        if (!info.working)
          status = info.type === "holiday" ? "holiday" : "non-working";
        else if (paidDates.has(date)) status = "leave";
      }
      const leave =
        status === "leave"
          ? leaves.find(
              (entry) =>
                entry.status === "approved" &&
                window.HCMLeaves.isPaid(entry) &&
                entry.from <= date &&
                entry.to >= date,
            )
          : null;
      return {
        date,
        number: Number(date.slice(-2)),
        status,
        label: labels[status] || status,
        isToday: date === today,
        future: date > today,
        working: info.working,
        calendarType: info.type,
        calendarName: info.name,
        record: state.record,
        leave: leave || null,
        shift: window.HCMAttendance.resolveShift(
          data.company || {
            startTime: "09:00",
            endTime: "17:00",
            graceMinutes: 15,
            calendarExceptions: calendar,
          },
          date,
        ),
        workedHours: state.record
          ? U.calculateWorkedHours(state.record.checkIn, state.record.checkOut)
          : null,
      };
    });
    const summary = window.HCMPayroll.calculateMonthlyAttendance(
      employee.id,
      year,
      month,
      { employee, attendance, leaves, calendar, today },
    );
    const workingRecords = days.filter((day) => day.working && day.record);
    const completedWorkedHours = workingRecords.reduce(
      (hours, day) => hours + (day.workedHours || 0),
      0,
    );
    const activeCheckIn =
      workingRecords.find((day) => day.isToday && !day.record.checkOut)?.record
        .checkIn || null;
    const leading = (U.parseDate(from).getDay() + 6) % 7;
    const cells = [...Array(leading).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    return {
      year,
      month,
      from,
      to,
      today,
      days,
      cells,
      summary,
      completedWorkedHours,
      activeCheckIn,
      hasAttendance: days.some((day) => day.record),
      openRecords: workingRecords.filter((day) => !day.record.checkOut).length,
    };
  }

  function totalWorkedHours(model, now = new Date()) {
    return (
      model.completedWorkedHours +
      (model.activeCheckIn
        ? elapsedSeconds(model.activeCheckIn, null, now) / 3600
        : 0)
    );
  }

  function getMonth(year, month, now = new Date()) {
    const user = window.HCMAuth.requireRole("employee");
    return buildMonth(
      user,
      year,
      month,
      {
        company: window.HCMStorage.getCompany(),
        attendance: window.HCMAttendance.records(user.id),
        leaves: window.HCMLeaves.list(),
        calendar: window.HCMStorage.getCompany().calendarExceptions || [],
      },
      now,
    );
  }

  window.HCMEmployeeDashboard = Object.freeze({
    labels,
    elapsedSeconds,
    formatDuration,
    greeting,
    buildMonth,
    totalWorkedHours,
    getMonth,
  });
})();
