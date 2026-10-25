(function () {
  "use strict";
  const U = window.HCMUtils;
  function calculateMonthlyAttendance(employeeId, year, month, data) {
    const [from, to] = U.monthRange(year, month);
    const employee = data.employee;
    const today = data.today || U.localDate();
    const counts = {
      presentDays: 0,
      lateDays: 0,
      halfDays: 0,
      absentDays: 0,
      approvedLeaveDays: 0,
      onTimeDays: 0,
      evaluatedDays: 0,
    };
    for (const date of U.workingDates(from, to, data.calendar || [])) {
      if (date > today || (employee.createdOn && date < employee.createdOn))
        continue;
      const state = window.HCMAttendance.dayState(
        { ...employee, id: employeeId },
        date,
        data.attendance,
        data.leaves,
        today,
        data.calendar || [],
      );
      if (state.record) {
        const hours = U.calculateWorkedHours(
          state.record.checkIn,
          state.record.checkOut,
        );
        const halfDay = hours !== null && hours < 5;
        const late =
          typeof state.record.wasLate === "boolean"
            ? state.record.wasLate
            : state.record.status === "late";
        counts.presentDays += 1;
        if (late) counts.lateDays += 1;
        if (halfDay) counts.halfDays += 1;
        else if (!late) counts.onTimeDays += 1;
      } else if (state.status === "leave") counts.approvedLeaveDays += 1;
      else if (state.status === "absent") counts.absentDays += 1;
      else continue;
      counts.evaluatedDays += 1;
    }
    return counts;
  }
  function calculate(employee, year, month, data) {
    const workingDays = U.getWorkingDaysInMonth(
      year,
      month,
      data.calendar || [],
    );
    const summary = calculateMonthlyAttendance(employee.id, year, month, {
      ...data,
      employee,
    });
    const dailyRate = workingDays > 0 ? employee.salary / workingDays : 0;
    const deduction = dailyRate * (summary.absentDays + 0.5 * summary.halfDays);
    const [from, to] = U.monthRange(year, month);
    const today = data.today || U.localDate();
    return {
      ...summary,
      workingDays,
      dailyRate,
      deduction,
      netSalary: employee.salary - deduction,
      salary: employee.salary,
      year,
      month,
      provisional: to >= today,
      eligible:
        from <= today && (!employee.createdOn || employee.createdOn <= to),
    };
  }
  function calculatePayslip(employeeId, year, month) {
    const actor = window.HCMAuth.requireRole(["admin", "employee"]);
    if (actor.role === "employee" && employeeId !== actor.id)
      throw new Error("You can only view your own payslip.");
    const employee = window.HCMStorage.findById("users", employeeId);
    if (!employee || employee.role !== "employee")
      throw new Error("Choose an active employee.");
    return calculate(employee, year, month, {
      attendance: window.HCMStorage.getAttendance(),
      leaves: window.HCMStorage.getLeaves(),
      calendar: window.HCMStorage.getCompany().calendarExceptions || [],
    });
  }
  function payment(employeeId, year, month) {
    // Reuse the same company and ownership checks as the salary calculation.
    calculatePayslip(employeeId, year, month);
    const period = `${year}-${String(month).padStart(2, "0")}`;
    return (
      window.HCMStorage.getCompany().payrollPayments?.find(
        (entry) => entry.employeeId === employeeId && entry.period === period,
      ) || null
    );
  }
  function setPaymentStatus(employeeId, year, month, status) {
    const S = window.HCMStorage;
    const companyId = S.getActiveCompanyId();
    const actorId = window.HCMAuth.requireRole("admin").id;
    U.monthRange(year, month);
    if (!["paid", "unpaid"].includes(status))
      return Promise.reject(new Error("Choose Paid or Not paid."));
    return S.mutate(() => {
      const actor = window.HCMAuth.requireRole("admin");
      if (actor.id !== actorId || S.getActiveCompanyId() !== companyId)
        throw new Error(
          "The active workspace changed. Reload payroll before updating a payment.",
        );
      const slip = calculatePayslip(employeeId, year, month);
      if (!slip.eligible)
        throw new Error("Payment status is unavailable for this period.");
      const company = S.getCompany();
      const period = `${year}-${String(month).padStart(2, "0")}`;
      const existing = company.payrollPayments || [];
      const previous = existing.find(
        (entry) => entry.employeeId === employeeId && entry.period === period,
      );
      if (previous?.status === status) return previous;
      const entry = {
        employeeId,
        period,
        status,
        amount: status === "paid" ? slip.netSalary : 0,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id,
      };
      S.transaction({
        company: {
          ...company,
          payrollPayments: [
            ...existing.filter(
              (entry) =>
                entry.employeeId !== employeeId || entry.period !== period,
            ),
            entry,
          ],
        },
      });
      return entry;
    });
  }
  function listPayroll(year, month) {
    window.HCMAuth.requireRole("admin");
    U.monthRange(year, month);
    return window.HCMStorage.getUsers()
      .filter((user) => user.role === "employee")
      .map((employee) => ({
        employee,
        slip: calculatePayslip(employee.id, year, month),
        payment: payment(employee.id, year, month),
      }));
  }
  function summarize(rows) {
    const eligible = rows.filter((row) => row.slip.eligible);
    const paid = eligible.filter((row) => row.payment?.status === "paid");
    return {
      net: eligible.reduce((sum, row) => sum + row.slip.netSalary, 0),
      paid: paid.reduce((sum, row) => sum + row.payment.amount, 0),
      pending: eligible
        .filter((row) => row.payment?.status !== "paid")
        .reduce((sum, row) => sum + row.slip.netSalary, 0),
      paidCount: paid.length,
      employeeCount: eligible.length,
      estimated: eligible.some((row) => row.slip.provisional),
      changedPayments: paid.some(
        (row) => Math.abs(row.payment.amount - row.slip.netSalary) > 0.005,
      ),
    };
  }
  function filterRows(rows, query = "", status = "all") {
    const name = query.trim().toLocaleLowerCase();
    return rows.filter(
      (row) =>
        row.employee.name.toLocaleLowerCase().includes(name) &&
        (status === "all" ||
          (row.slip.eligible &&
            (row.payment?.status === "paid" ? "paid" : "unpaid") === status)),
    );
  }
  window.HCMPayroll = Object.freeze({
    calculateMonthlyAttendance,
    calculate,
    calculatePayslip,
    payment,
    setPaymentStatus,
    listPayroll,
    summarize,
    filterRows,
  });
})();
