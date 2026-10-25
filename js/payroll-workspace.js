(function () {
  "use strict";
  function render(ui) {
    const {
      el,
      icon,
      iconButton,
      button,
      link,
      person,
      heading,
      empty,
      table,
      field,
      select,
      dialog,
      toast,
      brand,
    } = ui;
    const S = window.HCMStorage,
      A = window.HCMAuth,
      U = window.HCMUtils,
      P = window.HCMPayroll;
    const actor = A.requireRole(["admin", "employee"]);
    const admin = actor.role === "admin";
    document.title = `${admin ? "Payroll" : "My payslip"} · Huma`;
    const breadcrumb = document.querySelector(".breadcrumb-current");
    if (breadcrumb) breadcrumb.textContent = admin ? "Payroll" : "My payslip";
    const main = document.getElementById("page-content");
    main.classList.add("payroll-workspace");
    let selectedId = admin ? null : actor.id;
    let rows = [];
    let drawer = null;
    let opener = null;
    let selectedPeriod;
    let downloading = false;
    const currentMonth = U.localDate().slice(0, 7);
    let initialMonth = currentMonth;
    const requested = new URLSearchParams(window.location.search).get("month");
    try {
      if (requested && requested <= currentMonth) {
        U.parseMonth(requested);
        initialMonth = requested;
      }
    } catch {
      /* Fall back to the current period. */
    }
    const monthField = field("Pay period", "pay-month", {
      type: "month",
      value: initialMonth,
      max: currentMonth,
    });
    const monthInput = monthField.querySelector("input");
    const exportButton = button(
      "Export payroll",
      () => {
        try {
          const period = periodValue();
          window.HCMPayrollExport.downloadPayroll(period.year, period.month);
        } catch (error) {
          toast(error.message, true);
        }
      },
      "primary",
      "download",
    );
    exportButton.title = "Download the selected month’s payroll as CSV";
    const headerActions = el(
      "div",
      { class: "payroll-header-actions" },
      monthField,
      admin && exportButton,
    );
    const header = heading(
      admin ? "Payroll" : "My payslip",
      admin
        ? "Review salaries, deductions, and payments."
        : "Your salary, attendance, and payment details.",
      headerActions,
    );
    const summary = el("section", {
      class: "payroll-summary",
      "aria-label": "Monthly payroll summary",
    });
    const calculation = el("div", { class: "payroll-calculation-note" });
    const searchField = field("Search employees", "payroll-search", {
      type: "search",
      placeholder: "Search by name",
      required: false,
      autocomplete: "off",
    });
    const statusField = select(
      "Payment status",
      "payroll-status",
      [
        ["all", "All payments"],
        ["paid", "Paid"],
        ["unpaid", "Unpaid"],
      ],
      "all",
    );
    const results = el("span", {
      class: "muted small",
      role: "status",
      "aria-live": "polite",
    });
    const tableContent = el("div", { class: "payroll-table-content" });
    const register = el(
      "section",
      { class: "card payroll-register", "aria-label": "Employee payroll" },
      el(
        "div",
        { class: "payroll-table-heading" },
        el("h2", {}, "Employee payroll"),
        results,
      ),
      el(
        "div",
        { class: "payroll-filters" },
        el("div", { class: "payroll-search" }, icon("search"), searchField),
        statusField,
      ),
      tableContent,
    );
    const employeeContent = el("div", { class: "employee-payslip-content" });
    const employeeTools = el("div", { class: "payroll-personal-tools" });
    const printRoot = el("div", { class: "payroll-print-root" });
    document.querySelector(".payroll-print-root")?.remove();
    document.body.classList.remove("payroll-print-ready");
    document.body.append(printRoot);
    main.replaceChildren(
      ...[
        header,
        admin && summary,
        calculation,
        admin ? register : employeeTools,
        !admin && employeeContent,
      ].filter(Boolean),
    );

    function periodValue() {
      return U.parseMonth(monthInput.value);
    }
    function periodLabel() {
      return U.formatDate(
        U.monthRange(selectedPeriod.year, selectedPeriod.month)[0],
        { day: undefined, month: "long" },
      );
    }
    function paymentBadge(payment) {
      return el(
        "span",
        {
          class: `badge ${payment?.status === "paid" ? "badge-approved" : "badge-pending"}`,
        },
        payment?.status === "paid" ? "Paid" : "Unpaid",
      );
    }
    function containFocus(node) {
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...node.querySelectorAll(
            "button,input,select,textarea,a[href],summary,[tabindex]",
          ),
        ].filter(
          (control) =>
            control.tabIndex >= 0 &&
            !control.disabled &&
            control.getClientRects().length,
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
    function calculationBadge(slip) {
      return el(
        "span",
        { class: "badge payroll-calculation-badge" },
        slip.provisional ? "Estimated" : "Calculated",
      );
    }
    function facts(items) {
      return el(
        "dl",
        { class: "breakdown" },
        items.map(([label, value]) =>
          el("div", {}, el("dt", {}, label), el("dd", {}, value)),
        ),
      );
    }
    function attendanceFacts(slip) {
      return [
        ["Working days", slip.workingDays],
        ["Present days", slip.presentDays],
        ["Late days · included", slip.lateDays],
        ["Half-days · included", slip.halfDays],
        ["Absent days", slip.absentDays],
        ["Approved leave days", slip.approvedLeaveDays],
      ];
    }
    function salaryFacts(slip) {
      return [
        ["Base salary", U.formatCurrency(slip.salary)],
        ["Daily rate", U.formatCurrency(slip.dailyRate)],
        ["Deduction days", slip.absentDays + 0.5 * slip.halfDays],
        ["Total deductions", U.formatCurrency(slip.deduction)],
      ];
    }
    function getSelected() {
      if (!selectedId) return null;
      const employee = S.findById("users", selectedId);
      if (!employee || employee.role !== "employee")
        throw new Error("This employee is no longer available.");
      const slip = P.calculatePayslip(
        selectedId,
        selectedPeriod.year,
        selectedPeriod.month,
      );
      return {
        employee,
        slip,
        payment: P.payment(
          selectedId,
          selectedPeriod.year,
          selectedPeriod.month,
        ),
      };
    }
    function notes(slip) {
      return el(
        "div",
        { class: "payslip-notes", tabindex: "-1" },
        el("strong", {}, "Calculation notes"),
        el(
          "p",
          {},
          "Daily rate = monthly salary ÷ working days. Deduction = daily rate × (absent days + 0.5 × half days). Lateness adds no separate deduction; approved paid leave is not absence.",
        ),
        el(
          "p",
          {},
          slip.provisional
            ? "Estimated: only recorded attendance and completed working days are evaluated. Future dates and today’s missing check-in are excluded. The full monthly base is shown; this is not pay earned to date."
            : "Calculated from the completed month’s stored records. Changes to salary, attendance, or company policies can change this calculation.",
        ),
        el(
          "p",
          {},
          "Working days follow the company calendar. Absences before joining are excluded. Currency: PKR.",
        ),
      );
    }
    function paymentDetails(payment, slip) {
      return el(
        "div",
        { class: "payroll-payment-detail" },
        paymentBadge(payment),
        payment?.status === "paid" &&
          facts([
            [
              "Recorded payment date",
              U.formatDate(new Date(payment.updatedAt)),
            ],
            ["Recorded paid amount", U.formatCurrency(payment.amount)],
          ]),
        payment?.status === "paid" &&
          Math.abs(payment.amount - slip.netSalary) > 0.005 &&
          el(
            "p",
            { class: "payroll-changed-note small" },
            "The calculated net salary has changed since this payment was recorded. The recorded amount is preserved.",
          ),
      );
    }
    function statement(data) {
      const { employee, slip, payment } = data;
      return el(
        "article",
        { class: "payslip", "aria-label": "Salary payslip" },
        el(
          "div",
          { class: "payslip-heading" },
          el(
            "div",
            {},
            el("div", { class: "payslip-brand" }, brand(false)),
            el("p", {}, S.getCompany().name),
          ),
          el(
            "div",
            { class: "align-right" },
            el("p", { class: "eyebrow" }, "SALARY STATEMENT"),
            el("h2", {}, periodLabel()),
            calculationBadge(slip),
          ),
        ),
        el(
          "div",
          { class: "payslip-identity" },
          el(
            "div",
            {},
            el("span", { class: "muted small" }, "EMPLOYEE"),
            el("h2", {}, employee.name),
            el("p", {}, employee.department),
          ),
          el(
            "div",
            {},
            el("span", { class: "muted small" }, "EMAIL"),
            el("p", {}, employee.email),
          ),
          el(
            "div",
            {},
            el("span", { class: "muted small" }, "GENERATED"),
            el("p", {}, U.formatDate(new Date())),
          ),
        ),
        el(
          "div",
          { class: "payslip-columns" },
          el(
            "section",
            {},
            el("h3", {}, "Attendance summary"),
            facts(attendanceFacts(slip)),
          ),
          el(
            "section",
            {},
            el("h3", {}, "Salary breakdown"),
            facts(salaryFacts(slip)),
            el(
              "div",
              { class: "net-salary" },
              el("span", {}, "Net salary"),
              el("strong", {}, U.formatCurrency(slip.netSalary)),
            ),
          ),
        ),
        paymentDetails(payment, slip),
        notes(slip),
      );
    }
    function setPrint(data) {
      printRoot.replaceChildren(
        ...(data?.slip.eligible ? [statement(data)] : []),
      );
      document.body.classList.toggle(
        "payroll-print-ready",
        Boolean(data?.slip.eligible),
      );
    }
    function printPayslip() {
      try {
        const data = getSelected();
        if (!data?.slip.eligible) return;
        setPrint(data);
        window.print();
      } catch (error) {
        toast(error.message, true);
      }
    }
    async function downloadPayslip(target) {
      if (downloading) return;
      const id = selectedId,
        period = { ...selectedPeriod };
      downloading = true;
      target.disabled = true;
      target.setAttribute("aria-busy", "true");
      try {
        await window.HCMPayrollExport.downloadPayslip(
          id,
          period.year,
          period.month,
        );
        toast("Your payslip PDF is ready to download.");
      } catch (error) {
        toast(error.message, true);
      } finally {
        downloading = false;
        if (target.isConnected) {
          target.disabled = false;
          target.removeAttribute("aria-busy");
        }
      }
    }
    function exportActions() {
      return [
        button("Print", printPayslip, "secondary", "print"),
        button(
          "Download PDF",
          (event) => downloadPayslip(event.currentTarget),
          "secondary",
          "download",
        ),
      ];
    }
    function renderTable() {
      const filtered = P.filterRows(
        rows,
        searchField.querySelector("input").value,
        statusField.querySelector("select").value,
      );
      results.textContent = `${filtered.length} of ${rows.length} employees`;
      const reset = button(
        "Clear filters",
        () => {
          searchField.querySelector("input").value = "";
          statusField.querySelector("select").value = "all";
          statusField.refreshSelect();
          renderTable();
          searchField.querySelector("input").focus();
        },
        "secondary",
      );
      const emptyState = !rows.length
        ? empty(
            "No employees yet",
            "Add an employee to start reviewing payroll.",
            "users",
            link("Add employee", "employees.html", true),
          )
        : empty(
            "No matching employees",
            "Try another name or payment status.",
            "search",
            reset,
          );
      const visibleTable = table(
        [
          "Employee",
          "Base salary",
          "Deductions",
          "Net salary",
          "Payment status",
          "Action",
        ],
        filtered.map(({ employee, slip, payment }) => {
          const view = button(
            "View payslip",
            (event) => openDrawer(employee.id, event.currentTarget),
            "secondary",
          );
          view.classList.add("payroll-view-button");
          view.dataset.employeeId = employee.id;
          view.setAttribute("aria-label", `View payslip for ${employee.name}`);
          return [
            person({ ...employee, email: employee.department }),
            U.formatCurrency(slip.salary),
            slip.eligible ? U.formatCurrency(slip.deduction) : "—",
            el(
              "strong",
              {},
              slip.eligible ? U.formatCurrency(slip.netSalary) : "—",
            ),
            slip.eligible
              ? paymentBadge(payment)
              : el("span", { class: "badge" }, "Unavailable"),
            view,
          ];
        }),
        emptyState,
      );
      visibleTable.querySelectorAll("tbody tr").forEach((row, index) => {
        const employee = filtered[index].employee;
        row.dataset.employeeId = employee.id;
        row.classList.toggle("is-selected", employee.id === selectedId);
        if (employee.id === selectedId)
          row.setAttribute("aria-current", "true");
        row.addEventListener("click", (event) => {
          if (!event.target.closest("button,a"))
            openDrawer(employee.id, row.querySelector("button"));
        });
      });
      tableContent.replaceChildren(visibleTable);
    }
    function confirmPayment(status) {
      const previousFocus = document.activeElement;
      let data;
      try {
        data = getSelected();
        if (!data?.slip.eligible) return;
      } catch (error) {
        toast(error.message, true);
        return;
      }
      const id = data.employee.id,
        period = { ...selectedPeriod };
      let confirmation;
      const confirm = button(
        status === "paid" ? "Confirm paid" : "Confirm unpaid",
        async () => {
          confirm.disabled = true;
          confirm.setAttribute("aria-busy", "true");
          cancel.disabled = true;
          try {
            await P.setPaymentStatus(id, period.year, period.month, status);
            confirmation.close();
            refresh();
            toast(
              status === "paid"
                ? "Payment recorded. Salary calculations remain unchanged."
                : "Payment marked unpaid.",
            );
            drawer?.closeButton.focus();
          } catch (error) {
            toast(error.message, true);
          } finally {
            confirm.disabled = false;
            confirm.removeAttribute("aria-busy");
            cancel.disabled = false;
          }
        },
        "primary",
        status === "paid" ? "check" : undefined,
      );
      const cancel = button("Cancel", () => confirmation.close(), "secondary");
      const body = el(
        "div",
        {},
        el(
          "p",
          { class: "payroll-confirm-amount" },
          status === "paid"
            ? U.formatCurrency(data.slip.netSalary)
            : U.formatCurrency(data.payment?.amount || 0),
        ),
        el(
          "p",
          { class: "small muted" },
          status === "paid"
            ? `Record this amount as paid to ${data.employee.name} for ${periodLabel()}? This records a status only; no money is transferred.`
            : `Mark ${data.employee.name}’s ${periodLabel()} payment as unpaid? You can record payment again later.`,
        ),
        data.slip.provisional &&
          el(
            "p",
            { class: "notice" },
            "This month’s salary is still estimated. Recording payment does not finalize the calculation.",
          ),
        el("div", { class: "form-actions" }, cancel, confirm),
      );
      confirmation = dialog(
        status === "paid" ? "Record salary payment?" : "Mark payment unpaid?",
        data.employee.name,
        body,
      );
      containFocus(confirmation.node);
      confirmation.node.addEventListener("close", () => {
        if (previousFocus?.isConnected && previousFocus.getClientRects().length)
          previousFocus.focus();
        else drawer?.closeButton.focus();
      });
      confirmation.node.addEventListener("cancel", (event) => {
        if (confirm.disabled) event.preventDefault();
      });
      cancel.focus();
    }
    function openDrawer(id, trigger) {
      selectedId = id;
      opener = trigger;
      renderTable();
      const title = el("h2", { id: "payroll-detail-title" });
      const meta = el("p", { class: "muted small" });
      const statuses = el("div", { class: "payroll-detail-statuses" });
      const detailMonth = field("Payslip period", "drawer-month", {
        type: "month",
        value: monthInput.value,
        max: currentMonth,
      });
      const closeButton = iconButton("close", "Close payslip", () =>
        node.close(),
      );
      const more = el(
        "details",
        { class: "payroll-more" },
        el("summary", {}, "More actions", icon("chevrons")),
        el("div", { class: "payroll-more-options" }),
      );
      const tools = el(
        "div",
        { class: "payroll-detail-tools" },
        ...exportActions(),
        more,
      );
      const body = el("div", { class: "payroll-detail-body" });
      const node = el(
        "dialog",
        {
          class: "payroll-drawer",
          "aria-labelledby": "payroll-detail-title",
          "aria-modal": "true",
        },
        el(
          "header",
          { class: "payroll-drawer-header" },
          el(
            "div",
            { class: "payroll-drawer-heading" },
            el("div", {}, title, meta),
            closeButton,
          ),
          el("div", { class: "payroll-drawer-period" }, statuses, detailMonth),
          tools,
        ),
        body,
      );
      drawer = {
        node,
        title,
        meta,
        statuses,
        detailMonth,
        tools,
        more,
        body,
        closeButton,
      };
      containFocus(node);
      detailMonth.addEventListener("change", () => {
        monthInput.value = detailMonth.querySelector("input").value;
        refresh();
      });
      node.addEventListener("cancel", (event) => {
        if (more.open) {
          event.preventDefault();
          more.open = false;
          more.querySelector("summary").focus();
        }
      });
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          const rect = node.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            node.close();
        }
      });
      node.addEventListener("close", () => {
        drawer = null;
        node.remove();
        document.body.classList.remove("payroll-detail-open");
        setPrint(null);
        const replacement = [
          ...tableContent.querySelectorAll("button[data-employee-id]"),
        ].find((button) => button.dataset.employeeId === selectedId);
        (opener?.isConnected
          ? opener
          : replacement || searchField.querySelector("input")
        ).focus();
      });
      node.addEventListener("pointerdown", (event) => {
        if (!more.contains(event.target)) more.open = false;
      });
      document.body.append(node);
      document.body.classList.add("payroll-detail-open");
      refreshDetail();
      node.showModal();
      closeButton.focus();
    }
    function refreshDetail() {
      let data;
      try {
        data = getSelected();
      } catch (error) {
        setPrint(null);
        if (drawer) {
          drawer.title.textContent = "Payslip unavailable";
          drawer.body.replaceChildren(
            empty("Employee unavailable", error.message, "users"),
          );
          drawer.tools.hidden = true;
        } else
          employeeContent.replaceChildren(
            empty("Payslip unavailable", error.message, "file"),
          );
        return;
      }
      if (!data) return;
      const { employee, slip, payment } = data;
      setPrint(data);
      if (!drawer) {
        employeeTools.replaceChildren(...exportActions());
        employeeTools.querySelectorAll("button").forEach((control) => {
          control.disabled = !slip.eligible;
        });
        employeeContent.replaceChildren(
          slip.eligible
            ? statement(data)
            : empty(
                "No payslip for this period",
                "Choose a current or past month on or after you joined.",
                "file",
              ),
        );
        return;
      }
      drawer.title.textContent = employee.name;
      drawer.meta.textContent = `${employee.department} · ${periodLabel()}`;
      drawer.detailMonth.querySelector("input").value = monthInput.value;
      drawer.statuses.replaceChildren(
        ...(slip.eligible
          ? [paymentBadge(payment), calculationBadge(slip)]
          : [el("span", { class: "badge" }, "Unavailable")]),
      );
      drawer.tools.hidden = !slip.eligible;
      drawer.tools.querySelectorAll("button").forEach((control) => {
        control.disabled = downloading;
      });
      drawer.more.open = false;
      const noteAction = button(
        "Calculation notes",
        () => {
          drawer.more.open = false;
          const note = drawer.body.querySelector(".payslip-notes");
          note?.focus();
          note?.scrollIntoView({ block: "nearest" });
        },
        "secondary",
      );
      drawer.more.querySelector(".payroll-more-options").replaceChildren(
        ...[
          payment?.status === "paid" &&
            button(
              "Mark as Unpaid",
              () => {
                drawer.more.open = false;
                confirmPayment("unpaid");
              },
              "secondary",
            ),
          noteAction,
        ].filter(Boolean),
      );
      if (!slip.eligible) {
        drawer.body.replaceChildren(
          empty(
            "No payroll data for this period",
            "Choose a current or past month on or after this employee joined.",
            "file",
          ),
        );
        return;
      }
      drawer.body.replaceChildren(
        el(
          "section",
          { class: "payroll-detail-section" },
          el("h3", {}, "Employee information"),
          facts([
            ["Employee", employee.name],
            ["Department", employee.department],
            ["Company", S.getCompany().name],
            ["Payroll period", periodLabel()],
          ]),
        ),
        el(
          "section",
          { class: "payroll-detail-section" },
          el("h3", {}, "Attendance summary"),
          facts(attendanceFacts(slip)),
        ),
        el(
          "section",
          { class: "payroll-detail-section" },
          el("h3", {}, "Salary breakdown"),
          facts(salaryFacts(slip)),
        ),
        el(
          "section",
          { class: "payroll-final-section" },
          el(
            "span",
            { class: "eyebrow" },
            slip.provisional ? "ESTIMATED NET SALARY" : "NET SALARY",
          ),
          el(
            "strong",
            { class: "payroll-final-amount" },
            U.formatCurrency(slip.netSalary),
          ),
          paymentDetails(payment, slip),
          payment?.status !== "paid" &&
            button(
              "Mark as Paid",
              () => confirmPayment("paid"),
              "primary",
              "check",
            ),
        ),
        notes(slip),
      );
    }
    function refresh() {
      try {
        selectedPeriod = periodValue();
        if (monthInput.value > currentMonth)
          throw new Error("Choose a current or past payroll month.");
        rows = admin
          ? P.listPayroll(selectedPeriod.year, selectedPeriod.month)
          : [];
        exportButton.disabled = !rows.length;
        const info = admin ? P.summarize(rows) : null;
        if (admin) {
          summary.replaceChildren(
            ...[
              [
                "Total Net Payroll",
                U.formatCurrency(info.net),
                "Calculated net salary for all eligible employees",
              ],
              [
                "Total Paid",
                U.formatCurrency(info.paid),
                "Saved amounts recorded as paid",
              ],
              [
                "Pending Payments",
                U.formatCurrency(info.pending),
                "Calculated net salary for employees marked unpaid",
              ],
              [
                "Employees Paid",
                `${info.paidCount} of ${info.employeeCount}`,
                "Eligible employees with recorded payment",
              ],
            ].map(([label, value, tooltip]) =>
              el(
                "div",
                { class: "payroll-summary-item", title: tooltip },
                el("span", {}, label),
                el("strong", {}, value),
              ),
            ),
          );
          calculation.replaceChildren(
            ...[
              el(
                "span",
                { class: "badge payroll-calculation-badge" },
                info.estimated ? "Estimated payroll" : "Calculated payroll",
              ),
              el(
                "span",
                {},
                info.estimated
                  ? "Current month · based on attendance to date. Payment status is tracked separately."
                  : "Based on saved salary and attendance records.",
              ),
              info.changedPayments &&
                el(
                  "span",
                  { class: "payroll-changed-note" },
                  "Some calculations differ from recorded payments. Review the employee’s payslip.",
                ),
            ].filter(Boolean),
          );
          renderTable();
        } else calculation.replaceChildren();
        if (drawer || !admin) refreshDetail();
      } catch (error) {
        rows = [];
        selectedPeriod = null;
        exportButton.disabled = true;
        setPrint(null);
        summary.replaceChildren();
        calculation.replaceChildren(
          el(
            "p",
            { class: "notice notice-danger", role: "alert" },
            error.message,
          ),
        );
        tableContent.replaceChildren(
          empty(
            "Payroll unavailable",
            "Select a valid payroll period to continue.",
            "calendar",
          ),
        );
        employeeTools.replaceChildren();
        employeeContent.replaceChildren();
        if (drawer) {
          drawer.tools.hidden = true;
          drawer.body.replaceChildren(
            empty("Payroll unavailable", error.message, "calendar"),
          );
        }
      }
    }
    monthField.addEventListener("change", refresh);
    searchField.addEventListener("input", renderTable);
    statusField.addEventListener("change", renderTable);
    refresh();
  }
  window.HCMPayrollWorkspace = Object.freeze({ render });
})();
