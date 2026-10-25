(function () {
  "use strict";
  const S = window.HCMStorage;
  const U = window.HCMUtils;
  function resolveShift(company, date) {
    U.parseDate(date);
    const calendar = U.calendarDay(date, company.calendarExceptions || []);
    const override = (company.shiftExceptions || []).find(
      (entry) => entry.date === date,
    );
    const startTime = override?.startTime || company.startTime;
    const endTime = override?.endTime || company.endTime || "17:00";
    return {
      date,
      isWorkingDay: calendar.working,
      startTime,
      endTime,
      graceMinutes: company.graceMinutes,
      custom: Boolean(override),
      note: override?.note || "",
      calendarType: calendar.type,
      calendarName: calendar.name,
      valid:
        /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) &&
        endTime > startTime,
    };
  }
  function getEffectiveShift(companyId, date) {
    window.HCMAuth.requireRole(["admin", "employee"]);
    if (companyId !== S.getActiveCompanyId())
      throw new Error("You can only view the active company’s shift.");
    return resolveShift(S.getCompany(), date);
  }
  function checkInWindow(shift, now = new Date()) {
    if (!shift.isWorkingDay)
      return {
        state: "non-working",
        allowed: false,
        message:
          shift.calendarType === "holiday"
            ? "Today is a company holiday."
            : "Today is a non-working day.",
      };
    if (!shift.valid)
      return {
        state: "invalid",
        allowed: false,
        message: "Ask your admin to configure a valid daytime shift.",
      };
    if (U.localDate(now) !== shift.date)
      return {
        state: "closed",
        allowed: false,
        message: "Check-in is only available for today.",
      };
    const seconds = (clock) =>
      Number(clock.slice(0, 2)) * 3600 + Number(clock.slice(3, 5)) * 60;
    const current =
      now.getHours() * 3600 +
      now.getMinutes() * 60 +
      now.getSeconds() +
      now.getMilliseconds() / 1000;
    if (current < seconds(shift.startTime))
      return {
        state: "before",
        allowed: false,
        message: `Check-in opens at ${shift.startTime}.`,
      };
    if (current > seconds(shift.endTime))
      return {
        state: "after",
        allowed: false,
        message: "Check-in closed for today.",
      };
    return {
      state: "open",
      allowed: true,
      message: "Your check-in window is open.",
    };
  }
  function checkIn(now = new Date()) {
    return S.mutate(() => {
      const user = window.HCMAuth.requireRole("employee");
      const date = U.localDate(now);
      const company = S.getCompany();
      const calendar = company.calendarExceptions || [];
      if (!U.isWorkingDay(date, calendar))
        throw new Error(
          "Today is a holiday or non-working day in your company calendar. The default workweek is Monday to Friday.",
        );
      const attendance = S.getAttendance();
      if (
        attendance.some(
          (record) => record.employeeId === user.id && record.date === date,
        )
      )
        throw new Error("You have already checked in today.");
      if (
        window.HCMLeaves.approvedDates(user.id, S.getLeaves(), calendar).has(
          date,
        )
      )
        throw new Error("You are on approved paid leave today.");
      const shift = getEffectiveShift(S.getActiveCompanyId(), date);
      const availability = checkInWindow(shift, now);
      if (!availability.allowed) throw new Error(availability.message);
      const checkIn = now.toISOString();
      const result = U.calculateAttendanceStatus(checkIn, null, shift);
      const record = {
        employeeId: user.id,
        date,
        checkIn,
        checkOut: null,
        status: result.status,
        wasLate: result.wasLate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes,
        customShift: shift.custom,
        shiftNote: shift.note,
      };
      S.transaction({ attendance: [...attendance, record] });
      return record;
    });
  }
  function checkOut(now = new Date()) {
    return S.mutate(() => {
      const user = window.HCMAuth.requireRole("employee");
      const date = U.localDate(now);
      const attendance = S.getAttendance();
      const matches = attendance.filter(
        (record) => record.employeeId === user.id && record.date === date,
      );
      if (matches.length !== 1 || !matches[0].checkIn)
        throw new Error("Check in before checking out.");
      const record = matches[0];
      if (record.checkOut)
        throw new Error("You have already checked out today.");
      const checkOut = now.toISOString();
      const workedHours = U.calculateWorkedHours(record.checkIn, checkOut);
      const wasLate =
        typeof record.wasLate === "boolean"
          ? record.wasLate
          : U.calculateAttendanceStatus(
              record.checkIn,
              null,
              record.startTime ? record : S.getCompany(),
            ).wasLate;
      const updated = {
        ...record,
        checkOut,
        wasLate,
        status: workedHours < 5 ? "half-day" : wasLate ? "late" : "present",
      };
      S.transaction({
        attendance: attendance.map((entry) =>
          entry === record ? updated : entry,
        ),
      });
      return updated;
    });
  }
  function records(employeeId) {
    const user = window.HCMAuth.requireRole(["admin", "employee"]);
    if (user.role === "employee" && employeeId !== user.id)
      throw new Error("You can only view your own attendance.");
    return S.getAttendance()
      .filter((record) => record.employeeId === employeeId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function dayState(
    employee,
    date,
    attendance,
    leaves,
    today = U.localDate(),
    calendar = [],
  ) {
    if (employee.createdOn && date < employee.createdOn)
      return { status: "not-employed", record: null };
    if (date > today) return { status: "scheduled", record: null };
    const record = attendance
      .filter(
        (entry) =>
          entry.employeeId === employee.id &&
          entry.date === date &&
          entry.checkIn,
      )
      .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))[0];
    if (record) return { status: record.status, record };
    const day = U.calendarDay(date, calendar);
    if (!day.working)
      return {
        status: day.type === "holiday" ? "holiday" : "non-working",
        record: null,
      };
    if (window.HCMLeaves.approvedDates(employee.id, leaves, calendar).has(date))
      return { status: "leave", record: null };
    return { status: date < today ? "absent" : "not-started", record: null };
  }
  window.HCMAttendance = Object.freeze({
    checkIn,
    checkOut,
    records,
    dayState,
    resolveShift,
    getEffectiveShift,
    checkInWindow,
  });
})();
