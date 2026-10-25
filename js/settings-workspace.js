(function () {
  "use strict";
  function render(ui) {
    const {
      el,
      icon,
      iconButton,
      button,
      link,
      heading,
      field,
      select,
      dialog,
      toast,
      formError,
      submit,
      submitButton,
      empty,
    } = ui;
    const S = window.HCMStorage,
      U = window.HCMUtils,
      settings = window.HCMSettings;
    window.HCMAuth.requireRole("admin");
    const main = document.getElementById("page-content");
    main.classList.add("settings-workspace");
    const company = S.getCompany();
    const today = U.localDate();
    let activeSection = "general";
    let selectedDate = today;
    let year = Number(today.slice(0, 4)),
      month = Number(today.slice(5, 7));
    let showAllUpcoming = false;
    const formStates = [];
    const mobile = window.matchMedia("(max-width: 800px)");
    const tabs = new Map(),
      panels = new Map();
    const companyName = el("strong", {}, company.name);
    const nav = el("div", {
      class: "settings-tabs",
      role: "tablist",
      "aria-label": "Company settings sections",
      "aria-orientation": mobile.matches ? "horizontal" : "vertical",
    });
    for (const [id, label] of [
      ["general", "General"],
      ["policies", "Attendance & Leave"],
      ["calendar", "Company Calendar"],
    ]) {
      const tab = el(
        "button",
        {
          type: "button",
          role: "tab",
          id: `settings-tab-${id}`,
          "aria-controls": `settings-panel-${id}`,
          "aria-selected": String(id === activeSection),
          tabindex: id === activeSection ? "0" : "-1",
          onClick: () => activate(id),
        },
        label,
        el("span", {
          class: "settings-dirty-dot",
          "aria-hidden": "true",
          hidden: true,
        }),
      );
      const panel = el("section", {
        class: "settings-panel card",
        id: `settings-panel-${id}`,
        role: "tabpanel",
        "aria-labelledby": `settings-tab-${id}`,
        hidden: id !== activeSection,
      });
      tabs.set(id, tab);
      panels.set(id, panel);
      nav.append(tab);
    }
    const navigation = el(
      "aside",
      { class: "settings-navigation" },
      el(
        "div",
        { class: "settings-company-context" },
        el("span", {}, "CURRENT WORKSPACE"),
        companyName,
      ),
      nav,
    );
    main.replaceChildren(
      heading(
        "Company settings",
        "Manage your workspace and team policies.",
        link("Manage companies", "index.html?view=companies"),
      ),
      el(
        "div",
        { class: "settings-layout" },
        navigation,
        el("div", { class: "settings-content" }, ...panels.values()),
      ),
    );
    function activate(id) {
      activeSection = id;
      for (const [key, tab] of tabs) {
        tab.setAttribute("aria-selected", String(key === id));
        tab.tabIndex = key === id ? 0 : -1;
        panels.get(key).hidden = key !== id;
      }
    }
    nav.addEventListener("keydown", (event) => {
      const keys = mobile.matches
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowUp", "ArrowDown"];
      if (![...keys, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const ids = [...tabs.keys()];
      const focused = [...tabs.values()].indexOf(
        event.target.closest('[role="tab"]'),
      );
      const index = focused < 0 ? ids.indexOf(activeSection) : focused;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? ids.length - 1
            : (index + (event.key === keys[0] ? -1 : 1) + ids.length) %
              ids.length;
      activate(ids[next]);
      tabs.get(ids[next]).focus();
    });
    mobile.addEventListener("change", () =>
      nav.setAttribute(
        "aria-orientation",
        mobile.matches ? "horizontal" : "vertical",
      ),
    );
    function sectionHeading(title, description, action) {
      return el(
        "div",
        { class: "settings-panel-heading" },
        el(
          "div",
          {},
          el("h2", {}, title),
          el("p", { class: "muted" }, description),
        ),
        action,
      );
    }
    function bindForm(id, form, save) {
      const saveButton = submitButton("Save Changes");
      const status = el(
        "span",
        {
          class: "settings-save-status",
          role: "status",
          "aria-live": "polite",
        },
        "No unsaved changes",
      );
      form.append(
        formError(),
        el("div", { class: "settings-save-row" }, saveButton, status),
      );
      const values = () => Object.fromEntries(new FormData(form));
      let baseline = JSON.stringify(values()),
        busy = false;
      const state = { dirty: false };
      formStates.push(state);
      function sync() {
        state.dirty = JSON.stringify(values()) !== baseline;
        saveButton.disabled = busy || !state.dirty;
        status.textContent = busy
          ? "Saving…"
          : state.dirty
            ? "Unsaved changes"
            : "All changes saved";
        status.classList.toggle("is-dirty", state.dirty);
        tabs.get(id).querySelector(".settings-dirty-dot").hidden = !state.dirty;
        tabs
          .get(id)
          .setAttribute(
            "aria-label",
            `${id === "general" ? "General" : "Attendance & Leave"}${state.dirty ? " · Unsaved changes" : ""}`,
          );
      }
      form.addEventListener("input", (event) => {
        const error = event.target
          .closest(".field")
          ?.querySelector(".settings-field-error");
        if (error) {
          error.remove();
          event.target.removeAttribute("aria-invalid");
          event.target.removeAttribute("aria-errormessage");
        }
        form.querySelector(".form-error").hidden = true;
        sync();
      });
      form.addEventListener(
        "invalid",
        (event) => {
          event.preventDefault();
          const input = event.target,
            parent = input.closest(".field");
          if (parent) {
            let error = parent.querySelector(".settings-field-error");
            if (!error) {
              error = el("p", {
                class: "settings-field-error",
                id: `${input.id}-error`,
              });
              parent.append(error);
            }
            error.textContent = input.validationMessage;
            input.setAttribute("aria-invalid", "true");
            input.setAttribute("aria-errormessage", error.id);
          }
          form.querySelector(":invalid")?.focus();
        },
        true,
      );
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || !state.dirty || !form.reportValidity()) return;
        busy = true;
        form.setAttribute("aria-busy", "true");
        sync();
        const inputs = [...form.querySelectorAll("input")];
        inputs.forEach((input) => {
          input.readOnly = true;
        });
        try {
          const updated = await save(values());
          for (const input of inputs) input.value = updated[input.name];
          baseline = JSON.stringify(values());
          companyName.textContent = updated.name;
          document.querySelector(".company-name").textContent = updated.name;
          form.querySelector(".form-error").hidden = true;
          toast(
            id === "general"
              ? "Workspace details saved."
              : "Attendance and leave policies saved.",
          );
          updatePreview();
        } catch (error) {
          const target = form.querySelector(".form-error");
          target.textContent = error.message;
          target.hidden = false;
          target.focus();
        } finally {
          busy = false;
          form.removeAttribute("aria-busy");
          inputs.forEach((input) => {
            input.readOnly = false;
          });
          sync();
        }
      });
      saveButton.disabled = true;
    }
    const generalForm = el(
      "form",
      { class: "settings-compact-form" },
      field("Company name", "name", {
        value: company.name,
        maxlength: 160,
        autocomplete: "organization",
      }),
    );
    bindForm("general", generalForm, settings.saveGeneral);
    panels
      .get("general")
      .append(
        sectionHeading(
          "Workspace details",
          "Basic information about your company.",
        ),
        el("div", { class: "settings-panel-body" }, generalForm),
      );
    const preview = el("p", {
      class: "settings-policy-preview",
      "aria-live": "polite",
    });
    const policyForm = el(
      "form",
      { class: "settings-compact-form" },
      el(
        "fieldset",
        { class: "settings-policy-group" },
        el("legend", {}, "Working Hours & Shifts"),
        el(
          "div",
          { class: "settings-policy-fields shift-policy-fields" },
          field("Shift start time", "startTime", {
            type: "time",
            value: company.startTime,
          }),
          field("Shift end time", "endTime", {
            type: "time",
            value: company.endTime || "17:00",
          }),
          field("Grace period (minutes)", "graceMinutes", {
            type: "number",
            min: 0,
            max: 240,
            step: 1,
            value: company.graceMinutes,
          }),
        ),
        el(
          "p",
          { class: "field-hint" },
          "Employees checking in after the grace period are marked late.",
        ),
        preview,
        el(
          "p",
          { class: "field-hint" },
          "Applies to new check-ins. Recorded attendance keeps its original policy.",
        ),
      ),
      el(
        "fieldset",
        { class: "settings-policy-group" },
        el("legend", {}, "Leave policy"),
        field("Annual paid leave quota", "leaveQuota", {
          type: "number",
          min: 0,
          max: 366,
          step: 1,
          value: company.leaveQuota,
          hint: "Maximum paid leave days available per employee each year.",
        }),
        el(
          "p",
          { class: "field-hint" },
          "Existing approvals are preserved. New requests use the saved quota.",
        ),
      ),
    );
    function updatePreview() {
      const time = policyForm.querySelector('[name="startTime"]').value;
      const grace = policyForm.querySelector('[name="graceMinutes"]').value;
      const end = policyForm.querySelector('[name="endTime"]');
      const validRange = time && end.value && end.value > time;
      end.setCustomValidity(
        validRange ? "" : "Shift end time must be later than start time.",
      );
      const threshold = settings.lateThreshold(time, grace);
      preview.replaceChildren(
        ...(threshold && validRange
          ? [
              el("span", {}, "Working shift / check-in window"),
              el("strong", {}, `${time} — ${end.value}`),
              el("span", {}, "Late after"),
              el(
                "strong",
                {},
                `${threshold.time}${threshold.nextDay ? " · next day" : ""}`,
              ),
            ]
          : [
              el(
                "span",
                {},
                "Enter a valid daytime shift and grace period to preview the check-in window.",
              ),
            ]),
      );
    }
    policyForm.addEventListener("input", updatePreview);
    bindForm("policies", policyForm, settings.savePolicies);
    panels
      .get("policies")
      .append(
        sectionHeading(
          "Attendance & leave",
          "Set the rules your team follows.",
        ),
        el("div", { class: "settings-panel-body" }, policyForm),
      );
    const shiftList = el("div", { class: "settings-shift-list" });
    panels.get("policies").append(
      el(
        "section",
        { class: "settings-shift-exceptions" },
        sectionHeading(
          "Shift Exceptions",
          "Adjust working hours for specific dates.",
          button("Add custom shift", () => editShift(), "secondary", "plus"),
        ),
        shiftList,
      ),
    );
    updatePreview();
    window.addEventListener("beforeunload", (event) => {
      if (formStates.some((state) => state.dirty)) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    function containFocus(node) {
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const items = [
          ...node.querySelectorAll(
            "button,input,select,textarea,a[href],[tabindex]",
          ),
        ].filter(
          (item) =>
            item.tabIndex >= 0 &&
            !item.disabled &&
            item.getClientRects().length,
        );
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items[items.length - 1]?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === items[items.length - 1]
        ) {
          event.preventDefault();
          items[0]?.focus();
        }
      });
    }
    function editDate(entry = null, type = "holiday") {
      const form = el(
        "form",
        {},
        field("Date", "calendarDate", {
          type: "date",
          value: entry?.date || selectedDate,
          min: "1900-01-01",
          max: "9998-12-31",
        }),
        field("Title", "title", {
          value: entry?.name || "",
          maxlength: 100,
          placeholder: "e.g. Company holiday",
        }),
        select(
          "Day type",
          "dayType",
          [
            ["holiday", "Holiday"],
            ["working", "Extra working day"],
          ],
          entry?.type || type,
        ),
        formError(),
      );
      const modal = dialog(
        entry ? "Edit calendar date" : "Add calendar date",
        "Choose how this date affects your company’s working schedule.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Cancel", modal.close, "secondary"),
          submitButton("Save Date"),
        ),
      );
      containFocus(modal.node);
      submit(
        form,
        (input) => settings.saveCalendarDay(input, entry?.date || null),
        () => {
          const date = form.querySelector('[name="calendarDate"]').value;
          modal.close();
          selectedDate = date;
          year = Number(date.slice(0, 4));
          month = Number(date.slice(5, 7));
          renderCalendar(true);
          toast(
            "Calendar date saved. Leave and payroll now use the updated schedule.",
          );
        },
      );
    }
    function editShift(entry = null) {
      const current = S.getCompany();
      const hint = el("p", { class: "notice small" });
      const form = el(
        "form",
        {},
        field("Date", "date", {
          type: "date",
          value: entry?.date || selectedDate,
          min: "1900-01-01",
          max: "9998-12-31",
        }),
        el(
          "div",
          { class: "form-grid" },
          field("Shift start time", "startTime", {
            id: "custom-shift-start",
            type: "time",
            value: entry?.startTime || current.startTime,
          }),
          field("Shift end time", "endTime", {
            id: "custom-shift-end",
            type: "time",
            value: entry?.endTime || current.endTime || "17:00",
          }),
        ),
        field("Note (optional)", "note", {
          type: "textarea",
          rows: 2,
          required: false,
          maxlength: 240,
          value: entry?.note || "",
        }),
        hint,
        formError(),
      );
      function previewShift() {
        try {
          const shift = window.HCMAttendance.resolveShift(
            S.getCompany(),
            form.querySelector('[name="date"]').value,
          );
          hint.textContent = shift.isWorkingDay
            ? "Custom hours change timing only. The company grace period still applies."
            : "This is a holiday or non-working day. Custom hours will not open check-in unless the company calendar explicitly makes it a working day.";
        } catch {
          hint.textContent =
            "Choose a valid date. Custom hours never change its working-day classification.";
        }
        const start = form.querySelector('[name="startTime"]'),
          end = form.querySelector('[name="endTime"]');
        end.setCustomValidity(
          start.value && end.value > start.value
            ? ""
            : "Shift end time must be later than start time.",
        );
      }
      form.addEventListener("input", previewShift);
      previewShift();
      const modal = dialog(
        entry ? "Edit custom shift" : "Add custom shift",
        "Set daytime hours for one date. Holidays remain non-working.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Cancel", modal.close, "secondary"),
          submitButton("Save shift"),
        ),
      );
      containFocus(modal.node);
      submit(
        form,
        (input) => settings.saveShift(input, entry?.date || null),
        (saved) => {
          modal.close();
          selectedDate = saved.date;
          year = Number(saved.date.slice(0, 4));
          month = Number(saved.date.slice(5, 7));
          renderCalendar();
          renderShiftList();
          toast("Custom shift saved. Calendar classification is unchanged.");
        },
      );
    }
    function removeShift(entry) {
      const form = el(
        "form",
        {},
        el(
          "p",
          { class: "notice" },
          `Remove custom hours on ${U.formatDate(entry.date)}? The default company shift will apply. Existing attendance stays unchanged.`,
        ),
        formError(),
      );
      const modal = dialog(
        "Remove custom shift?",
        "The holiday or working-day classification will not change.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Keep shift", modal.close, "secondary"),
          submitButton("Remove shift"),
        ),
      );
      containFocus(modal.node);
      submit(
        form,
        () => settings.removeShift(entry.date),
        () => {
          modal.close();
          renderCalendar();
          renderShiftList();
          toast("Custom shift removed.");
        },
      );
    }
    function renderShiftList() {
      const shifts = [...(S.getCompany().shiftExceptions || [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      shiftList.replaceChildren(
        shifts.length
          ? el(
              "ul",
              {},
              shifts.map((entry) =>
                el(
                  "li",
                  {},
                  el(
                    "div",
                    {},
                    el("strong", {}, U.formatDate(entry.date)),
                    el("p", {}, `${entry.startTime} — ${entry.endTime}`),
                    entry.note && el("small", { class: "muted" }, entry.note),
                  ),
                  el(
                    "div",
                    { class: "row-actions" },
                    el(
                      "button",
                      {
                        type: "button",
                        class: "button button-secondary",
                        "aria-label": `Edit shift on ${U.formatDate(entry.date)}`,
                        onClick: () => editShift(entry),
                      },
                      "Edit",
                    ),
                    el(
                      "button",
                      {
                        type: "button",
                        class: "button button-danger-quiet",
                        "aria-label": `Remove shift on ${U.formatDate(entry.date)}`,
                        onClick: () => removeShift(entry),
                      },
                      "Remove",
                    ),
                  ),
                ),
              ),
            )
          : el(
              "p",
              { class: "muted small" },
              "No custom shifts. Working days use your default shift.",
            ),
      );
    }
    function removeDate(entry) {
      const form = el(
        "form",
        {},
        el(
          "p",
          { class: "notice" },
          `Remove “${entry.name}” on ${U.formatDate(entry.date)}? The default Monday–Friday schedule will apply. Leave and payroll will recalculate; attendance records are preserved.`,
        ),
        formError(),
      );
      const modal = dialog(
        "Remove calendar exception?",
        "This removes the date override from this company.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Keep date", modal.close, "secondary"),
          submitButton("Remove exception"),
        ),
      );
      containFocus(modal.node);
      submit(
        form,
        () => settings.removeCalendarDay(entry.date),
        () => {
          modal.close();
          renderCalendar(true);
          toast("Calendar exception removed.");
        },
      );
    }
    const monthHeading = el("h3", {
      id: "settings-calendar-month",
      "aria-live": "polite",
    });
    const grid = el("div", {
      class: "settings-calendar-grid",
      role: "grid",
      "aria-labelledby": "settings-calendar-month",
      "aria-colcount": "7",
    });
    const detail = el("section", {
      class: "settings-date-detail",
      "aria-label": "Selected calendar date",
    });
    const upcoming = el("div", { class: "settings-upcoming" });
    function shiftMonth(delta) {
      const date = new Date(year, month - 1 + delta, 1, 12);
      if (date.getFullYear() < 1900 || date.getFullYear() > 9998) return;
      year = date.getFullYear();
      month = date.getMonth() + 1;
      selectedDate = U.localDate(date);
      renderCalendar();
    }
    const previous = iconButton("chevronLeft", "Previous month", () =>
      shiftMonth(-1),
    );
    const next = iconButton("chevronRight", "Next month", () => shiftMonth(1));
    const todayButton = button(
      "Today",
      () => {
        selectedDate = U.localDate();
        year = Number(selectedDate.slice(0, 4));
        month = Number(selectedDate.slice(5, 7));
        renderCalendar();
      },
      "secondary",
    );
    panels.get("calendar").append(
      sectionHeading(
        "Company calendar",
        "Manage holidays and additional working days.",
        button("Add Date", () => editDate(), "primary", "plus"),
      ),
      el(
        "div",
        { class: "settings-calendar-body" },
        el(
          "div",
          { class: "settings-calendar-toolbar" },
          monthHeading,
          el(
            "div",
            { class: "calendar-controls" },
            todayButton,
            previous,
            next,
          ),
        ),
        el(
          "div",
          { class: "settings-calendar-weekdays", "aria-hidden": "true" },
          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) =>
            el("span", {}, day),
          ),
        ),
        grid,
        el(
          "div",
          {
            class: "settings-calendar-legend",
            "aria-label": "Calendar legend",
          },
          [
            ["regular", "Working day"],
            ["weekend", "Weekend"],
            ["holiday", "Holiday"],
            ["working", "Extra working day"],
            ["custom", "Custom shift"],
          ].map(([type, label]) =>
            el(
              "span",
              { class: `calendar-kind-${type}` },
              el("i", { "aria-hidden": "true" }),
              label,
            ),
          ),
        ),
        detail,
        el(
          "p",
          { class: "field-hint settings-calendar-impact" },
          "Calendar changes recalculate leave and payroll, including past periods. Recorded attendance is preserved.",
        ),
      ),
      upcoming,
    );
    grid.addEventListener("keydown", (event) => {
      if (
        !event.target.dataset.date ||
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      const cursor = U.parseDate(event.target.dataset.date),
        weekday = (cursor.getDay() + 6) % 7;
      cursor.setDate(
        cursor.getDate() +
          {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
            Home: -weekday,
            End: 6 - weekday,
          }[event.key],
      );
      if (cursor.getFullYear() < 1900 || cursor.getFullYear() > 9998) return;
      selectedDate = U.localDate(cursor);
      year = cursor.getFullYear();
      month = cursor.getMonth() + 1;
      renderCalendar(true);
    });
    function renderCalendar(focus = false) {
      const calendar = S.getCompany().calendarExceptions || [];
      const [from, to] = U.monthRange(year, month),
        currentDay = U.localDate();
      monthHeading.textContent = U.formatDate(from, {
        day: undefined,
        month: "long",
      });
      previous.disabled = year === 1900 && month === 1;
      next.disabled = year === 9998 && month === 12;
      const labels = {
        regular: "Working day",
        weekend: "Weekend",
        holiday: "Holiday",
        working: "Extra working day",
      };
      const cells = Array((U.parseDate(from).getDay() + 6) % 7)
        .fill(null)
        .concat(U.dateRange(from, to));
      while (cells.length % 7) cells.push(null);
      const weeks = [];
      for (let index = 0; index < cells.length; index += 7) {
        weeks.push(
          el(
            "div",
            { class: "settings-calendar-week", role: "row" },
            cells.slice(index, index + 7).map((date) => {
              if (!date)
                return el("div", {
                  role: "gridcell",
                  class: "settings-calendar-blank",
                  "aria-hidden": "true",
                });
              const info = U.calendarDay(date, calendar),
                kind =
                  info.type === "regular" && !info.working
                    ? "weekend"
                    : info.type;
              const shift = window.HCMAttendance.resolveShift(
                S.getCompany(),
                date,
              );
              const selected = date === selectedDate;
              return el(
                "div",
                { role: "gridcell", "aria-selected": String(selected) },
                el(
                  "button",
                  {
                    type: "button",
                    class: `settings-calendar-date calendar-kind-${kind}${date === currentDay ? " is-today" : ""}${selected ? " is-selected" : ""}`,
                    "data-date": date,
                    tabindex: selected ? "0" : "-1",
                    "aria-pressed": String(selected),
                    "aria-current": date === currentDay ? "date" : undefined,
                    "aria-label": `${U.formatDate(date, { weekday: "long" })}, ${labels[kind]}${info.name ? `, ${info.name}` : ""}${shift.custom ? `, Custom shift ${shift.startTime} to ${shift.endTime}` : ""}`,
                    onClick: () => {
                      selectedDate = date;
                      renderCalendar(true);
                    },
                  },
                  el(
                    "span",
                    { class: "settings-calendar-number" },
                    Number(date.slice(-2)),
                  ),
                  el(
                    "span",
                    { class: "settings-calendar-indicator" },
                    el("i", { "aria-hidden": "true" }),
                    el(
                      "span",
                      {},
                      kind === "working" ? "Extra workday" : labels[kind],
                    ),
                  ),
                  shift.custom &&
                    el("span", {
                      class: "calendar-custom-dot",
                      title: "Custom shift",
                      "aria-hidden": "true",
                    }),
                ),
              );
            }),
          ),
        );
      }
      grid.setAttribute("aria-rowcount", String(weeks.length));
      grid.replaceChildren(...weeks);
      const info = U.calendarDay(selectedDate, calendar),
        entry = calendar.find((value) => value.date === selectedDate);
      const kind = entry ? entry.type : info.working ? "regular" : "weekend";
      const effectiveShift = window.HCMAttendance.resolveShift(
        S.getCompany(),
        selectedDate,
      );
      const customShift = S.getCompany().shiftExceptions?.find(
        (shift) => shift.date === selectedDate,
      );
      detail.replaceChildren(
        el(
          "div",
          { class: "settings-date-heading" },
          el(
            "div",
            {},
            el("h3", {}, U.formatDate(selectedDate, { weekday: "long" })),
            el(
              "p",
              { class: "muted" },
              entry?.name ||
                (info.working
                  ? "A regular company working day."
                  : "A regular weekend day."),
            ),
          ),
          el(
            "span",
            {
              class: `badge ${kind === "holiday" ? "settings-holiday-badge" : kind === "working" ? "badge-working" : ""}`,
            },
            labels[kind],
          ),
        ),
        el(
          "div",
          { class: "settings-date-actions" },
          entry
            ? [
                button("Edit entry", () => editDate(entry), "secondary"),
                button("Remove entry", () => removeDate(entry), "danger-quiet"),
              ]
            : [
                button(
                  "Add company holiday",
                  () => editDate(null, "holiday"),
                  "secondary",
                ),
                button(
                  "Add extra working day",
                  () => editDate(null, "working"),
                  "secondary",
                ),
              ],
        ),
      );
      detail.append(
        el(
          "p",
          { class: "settings-effective-shift small" },
          `${effectiveShift.custom ? "Custom shift" : "Default shift"}: ${effectiveShift.startTime} — ${effectiveShift.endTime} · ${effectiveShift.graceMinutes}-minute grace.${effectiveShift.isWorkingDay ? "" : " Check-in remains closed on this non-working date."}`,
        ),
        el(
          "div",
          { class: "settings-date-actions" },
          button(
            customShift ? "Edit custom shift" : "Add custom shift",
            () => editShift(customShift || null),
            "secondary",
          ),
          customShift &&
            button(
              "Remove custom shift",
              () => removeShift(customShift),
              "danger-quiet",
            ),
        ),
      );
      const future = calendar
        .filter((entry) => entry.date >= currentDay)
        .sort((a, b) => a.date.localeCompare(b.date));
      upcoming.replaceChildren(
        ...[
          el(
            "div",
            { class: "settings-upcoming-heading" },
            el("h3", {}, "Upcoming exceptions"),
            el("span", { class: "muted small" }, `${future.length} scheduled`),
          ),
          future.length
            ? el(
                "ul",
                { class: "settings-exception-list" },
                (showAllUpcoming ? future : future.slice(0, 6)).map((entry) =>
                  el(
                    "li",
                    {},
                    el(
                      "time",
                      { datetime: entry.date },
                      U.formatDate(entry.date, { year: undefined }),
                    ),
                    el(
                      "div",
                      { class: "settings-exception-info" },
                      el("strong", {}, entry.name),
                      el(
                        "span",
                        {
                          class: `badge ${entry.type === "holiday" ? "settings-holiday-badge" : "badge-working"}`,
                        },
                        entry.type === "holiday"
                          ? "Holiday"
                          : "Extra working day",
                      ),
                    ),
                    el(
                      "button",
                      {
                        type: "button",
                        class: "button button-secondary",
                        "aria-label": `Edit ${entry.name} on ${U.formatDate(entry.date)}`,
                        onClick: () => editDate(entry),
                      },
                      "Edit",
                    ),
                  ),
                ),
              )
            : el(
                "p",
                { class: "muted small settings-upcoming-empty" },
                "No upcoming exceptions. Select a date to add a holiday or extra working day. Past entries remain available in the calendar.",
              ),
          future.length > 6
            ? button(
                showAllUpcoming
                  ? "Show fewer dates"
                  : `Show all ${future.length} dates`,
                () => {
                  showAllUpcoming = !showAllUpcoming;
                  renderCalendar();
                },
                "secondary",
              )
            : null,
        ].filter(Boolean),
      );
      if (focus)
        [...grid.querySelectorAll("button")]
          .find((item) => item.dataset.date === selectedDate)
          ?.focus({ preventScroll: true });
    }
    renderCalendar();
    renderShiftList();
  }
  window.HCMSettingsWorkspace = Object.freeze({ render });
})();
