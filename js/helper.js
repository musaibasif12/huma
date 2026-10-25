(function () {
  "use strict";
  const U = window.HCMUtils;
  function answer(question) {
    const user = window.HCMAuth.requireRole(["admin", "employee"]);
    const text = String(question)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const company = window.HCMStorage.getCompany();
    if (user.role === "admin") {
      const stats = window.HCMAdmin.summary();
      if (/pending|request/.test(text) && /leave|request/.test(text))
        return `${stats.pending} leave request(s) are pending. Review them in Leave requests.`;
      if (/late/.test(text))
        return `${stats.late} employee(s) checked in late today, including any who later completed a half day.`;
      if (/present|attendance/.test(text))
        return `${stats.present} of ${stats.employees} employee(s) have checked in today.${U.isWorkingDay(U.localDate(), company.calendarExceptions || []) ? "" : " Today is a holiday or non-working day in the company calendar."}`;
      if (/employee|team|headcount|staff/.test(text))
        return `There are ${stats.employees} active employee(s) in your workspace.`;
      if (/start|office|grace|shift/.test(text)) {
        const shift = window.HCMAttendance.getEffectiveShift(
          window.HCMStorage.getActiveCompanyId(),
          U.localDate(),
        );
        return `Today’s ${shift.custom ? "custom" : "default"} shift is ${shift.startTime}–${shift.endTime}, with ${shift.graceMinutes} grace minutes.${shift.isWorkingDay ? "" : " Today is non-working; custom hours do not open check-in."}`;
      }
      if (/company|organisation|organization/.test(text))
        return `Your company is ${company.name}.`;
      return "I can help with employee count, present or late employees today, pending leave requests, company name, and office start time. Try “How many employees are present today?”";
    }
    // Employee intents never look up a named person or accept an employee ID.
    if (
      /\b(other|another|everyone|all employees|team|colleague|coworker|staff|employee|employees)\b/.test(
        text,
      ) ||
      /\b(?:his|her|their)\b/.test(text) ||
      text.includes("@") ||
      /\b[a-z]+ s (?:salary|pay|leave|attendance)\b/.test(text)
    ) {
      return "I can only answer questions about your own salary, leave, attendance, and payslip.";
    }
    const now = new Date();
    if (/shift|office|grace/.test(text)) {
      const shift = window.HCMAttendance.getEffectiveShift(
        window.HCMStorage.getActiveCompanyId(),
        U.localDate(now),
      );
      return `Today’s ${shift.custom ? "custom" : "default"} shift: ${shift.startTime}–${shift.endTime}; ${shift.graceMinutes}-minute grace. ${window.HCMAttendance.checkInWindow(shift, now).message}`;
    }
    if (
      /request|application|approval/.test(text) &&
      /leave|status/.test(text)
    ) {
      const requests = window.HCMLeaves.list();
      if (!requests.length)
        return "You have no leave requests yet. Apply from My dashboard.";
      const latest = requests[0];
      return `Your latest leave request (${U.formatDate(latest.from)} to ${U.formatDate(latest.to)}) is ${latest.status}.${latest.comment ? ` Comment: ${latest.comment}` : ""}`;
    }
    if (/leave|quota|balance|time off|holiday|vacation/.test(text)) {
      const balance = window.HCMLeaves.balance(user.id, now.getFullYear());
      return `You have ${balance.remaining} of ${balance.quota} paid leave days remaining in ${now.getFullYear()}. Approved: ${balance.used}. Pending requests reserve quota for new applications but do not reduce this balance.`;
    }
    if (/absen/.test(text)) {
      const slip = window.HCMPayroll.calculatePayslip(
        user.id,
        now.getFullYear(),
        now.getMonth() + 1,
      );
      return `You have ${slip.absentDays} absent day(s) this month, counting only completed working days since joining.`;
    }
    if (/today|attendance|check in|check out|late/.test(text)) {
      const state = window.HCMAttendance.dayState(
        user,
        U.localDate(),
        window.HCMAttendance.records(user.id),
        window.HCMLeaves.list(),
        U.localDate(),
        company.calendarExceptions || [],
      );
      return `Today: ${U.statusLabels[state.status] || state.status}.${state.record ? ` Check-in: ${U.formatTime(state.record.checkIn)}. Check-out: ${U.formatTime(state.record.checkOut)}.${state.record.wasLate ? " Your check-in was late." : ""}` : ""}`;
    }
    if (/payslip|net|deduction/.test(text)) {
      const slip = window.HCMPayroll.calculatePayslip(
        user.id,
        now.getFullYear(),
        now.getMonth() + 1,
      );
      return `This month: base ${U.formatCurrency(slip.salary)}, deductions ${U.formatCurrency(slip.deduction)}, net ${U.formatCurrency(slip.netSalary)}. This is provisional until the month is complete. Open My payslip for the breakdown.`;
    }
    if (/salary|pay|earning|wage/.test(text))
      return `Your monthly base salary is ${U.formatCurrency(user.salary)}.`;
    return "Ask about your salary, remaining leave, leave request status, attendance today, absent days, or payslip. Try “How many leaves are remaining?”";
  }
  window.HCMHelper = Object.freeze({ answer });
})();
