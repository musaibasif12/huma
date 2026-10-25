(function () {
  "use strict";
  const U = window.HCMUtils;
  const S = window.HCMStorage;
  const paidTypes = new Set(["annual", "personal", "paid", "sick"]);
  const isPaid = (leave) => paidTypes.has(leave.type.toLowerCase());
  function leaveDates(leave, calendar = []) {
    return U.workingDates(leave.from, leave.to, calendar);
  }
  function approvedDates(employeeId, leaves, calendar = []) {
    return new Set(
      leaves
        .filter(
          (leave) =>
            leave.employeeId === employeeId &&
            leave.status === "approved" &&
            isPaid(leave),
        )
        .flatMap((leave) => leaveDates(leave, calendar)),
    );
  }
  function calculateLeaveBalance(
    employeeId,
    year,
    leaves,
    quota,
    calendar = [],
  ) {
    const approved = [...approvedDates(employeeId, leaves, calendar)].filter(
      (date) => Number(date.slice(0, 4)) === year,
    ).length;
    return { quota, used: approved, remaining: Math.max(0, quota - approved) };
  }
  function validateRequest(
    request,
    leaves,
    company,
    attendance,
    ignoreId = null,
  ) {
    const calendar = company.calendarExceptions || [];
    const dates = leaveDates(request, calendar);
    if (!dates.length)
      throw new Error(
        "Choose a range with at least one working day in the company calendar. Holidays and days off are excluded.",
      );
    const active = leaves.filter(
      (leave) =>
        leave.id !== ignoreId &&
        leave.employeeId === request.employeeId &&
        leave.status !== "rejected",
    );
    const reserved = new Set(
      active.flatMap((leave) => leaveDates(leave, calendar)),
    );
    if (dates.some((date) => reserved.has(date)))
      throw new Error("These dates overlap a pending or approved request.");
    if (
      attendance.some(
        (record) =>
          record.employeeId === request.employeeId &&
          record.checkIn &&
          dates.includes(record.date),
      )
    )
      throw new Error(
        "This range includes a day with recorded attendance. Choose different dates.",
      );
    for (const year of new Set(dates.map((date) => date.slice(0, 4)))) {
      const committed = [...reserved].filter((date) =>
        date.startsWith(year),
      ).length;
      const requested = dates.filter((date) => date.startsWith(year)).length;
      if (committed + requested > company.leaveQuota)
        throw new Error(
          `Not enough leave in ${year}. ${Math.max(0, company.leaveQuota - committed)} day(s) available after pending requests.`,
        );
    }
    return dates;
  }
  function apply(input) {
    return S.mutate(() => {
      const user = window.HCMAuth.requireRole("employee");
      if (!["annual", "personal"].includes(input.type))
        throw new Error("Choose a supported paid leave type.");
      const dates = U.workingDates(
        input.from,
        input.to,
        S.getCompany().calendarExceptions || [],
      );
      if (input.from < U.localDate())
        throw new Error("New requests must start today or later.");
      const leave = {
        id: U.id(),
        employeeId: user.id,
        type: input.type,
        from: input.from,
        to: input.to,
        days: dates.length,
        reason: U.required(input.reason, "Reason", 1000),
        status: "pending",
        comment: "",
        createdAt: new Date().toISOString(),
      };
      const leaves = S.getLeaves();
      validateRequest(leave, leaves, S.getCompany(), S.getAttendance());
      S.transaction({ leaves: [...leaves, leave] });
      return leave;
    });
  }
  function decide(id, decision, comment = "") {
    return S.mutate(() => {
      window.HCMAuth.requireRole("admin");
      if (!["approved", "rejected"].includes(decision))
        throw new Error("Choose approve or reject.");
      const leaves = S.getLeaves();
      const leave = leaves.find((entry) => entry.id === id);
      if (!leave || leave.status !== "pending")
        throw new Error(
          "This request has already been processed or no longer exists.",
        );
      if (
        !S.getUsers().some(
          (user) => user.id === leave.employeeId && user.role === "employee",
        )
      )
        throw new Error("Employee no longer exists.");
      if (decision === "approved")
        validateRequest(leave, leaves, S.getCompany(), S.getAttendance(), id);
      if (comment.trim().length > 1000)
        throw new Error("Comment must be 1,000 characters or fewer.");
      const updated = {
        ...leave,
        days: leaveDates(leave, S.getCompany().calendarExceptions || []).length,
        status: decision,
        comment: comment.trim(),
        decidedAt: new Date().toISOString(),
      };
      S.transaction({
        leaves: leaves.map((entry) => (entry.id === id ? updated : entry)),
      });
      return updated;
    });
  }
  function list() {
    const user = window.HCMAuth.requireRole(["admin", "employee"]);
    return S.getLeaves()
      .filter((leave) => user.role === "admin" || leave.employeeId === user.id)
      .sort((a, b) =>
        (b.createdAt || b.from).localeCompare(a.createdAt || a.from),
      );
  }
  function balance(employeeId, year = new Date().getFullYear()) {
    const user = window.HCMAuth.requireRole(["admin", "employee"]);
    if (user.role === "employee" && employeeId !== user.id)
      throw new Error("You can only view your own leave balance.");
    const company = S.getCompany();
    return calculateLeaveBalance(
      employeeId,
      year,
      S.getLeaves(),
      company.leaveQuota,
      company.calendarExceptions || [],
    );
  }
  window.HCMLeaves = Object.freeze({
    isPaid,
    leaveDates,
    approvedDates,
    calculateLeaveBalance,
    validateRequest,
    apply,
    decide,
    list,
    balance,
  });
})();
