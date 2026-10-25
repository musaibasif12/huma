(function () {
  "use strict";
  function summary(date = window.HCMUtils.localDate()) {
    window.HCMAuth.requireRole("admin");
    const employees = window.HCMEmployees.list();
    const attendance = window.HCMStorage.getAttendance();
    const leaves = window.HCMStorage.getLeaves();
    const rows = employees.map((employee) => ({
      employee,
      ...window.HCMAttendance.dayState(
        employee,
        date,
        attendance,
        leaves,
        window.HCMUtils.localDate(),
        window.HCMStorage.getCompany().calendarExceptions || [],
      ),
    }));
    return {
      employees: employees.length,
      present: rows.filter((row) => row.record).length,
      late: rows.filter(
        (row) => row.record && (row.record.wasLate || row.status === "late"),
      ).length,
      absent: rows.filter((row) => row.status === "absent").length,
      pending: leaves.filter((leave) => leave.status === "pending").length,
      rows,
    };
  }
  window.HCMAdmin = Object.freeze({ summary });
})();
