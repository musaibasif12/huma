(function () {
  "use strict";

  const keys = Object.freeze({
    company: "hcm_company",
    users: "hcm_users",
    attendance: "hcm_attendance",
    leaves: "hcm_leaves",
    session: "hcm_session",
    companies: "hcm_companies",
  });
  const allowedKeys = new Set(Object.values(keys));
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isText = (value) =>
    typeof value === "string" && value.trim().length > 0;
  const isAmount = (value) => Number.isFinite(value) && value >= 0;
  const isWholeNumber = (value) => Number.isInteger(value) && value >= 0;
  const isRole = (value) => value === "admin" || value === "employee";
  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return (
      year >= 1900 &&
      year <= 9998 &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }
  const isTimestamp = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(new Date(value).getTime());
  function isCalendar(value) {
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          isObject(entry) &&
          isDate(entry.date) &&
          ["holiday", "working"].includes(entry.type) &&
          isText(entry.name) &&
          entry.name.length <= 100,
      ) &&
      new Set(value.map((entry) => entry.date)).size === value.length
    );
  }
  function isPayrollPayments(value) {
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          isObject(entry) &&
          isText(entry.employeeId) &&
          typeof entry.period === "string" &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.period) &&
          Number(entry.period.slice(0, 4)) >= 1900 &&
          Number(entry.period.slice(0, 4)) <= 9998 &&
          ["paid", "unpaid"].includes(entry.status) &&
          isAmount(entry.amount) &&
          isTimestamp(entry.updatedAt) &&
          isText(entry.updatedBy),
      ) &&
      new Set(value.map((entry) => `${entry.employeeId}/${entry.period}`))
        .size === value.length
    );
  }

  function checkKey(key) {
    if (!allowedKeys.has(key)) throw new Error("Unknown HCM storage key.");
  }
  const isTime = (value) =>
    typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  function isShifts(value) {
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          isObject(entry) &&
          isDate(entry.date) &&
          isTime(entry.startTime) &&
          isTime(entry.endTime) &&
          entry.endTime > entry.startTime &&
          typeof entry.note === "string" &&
          entry.note.length <= 240,
      ) &&
      new Set(value.map((entry) => entry.date)).size === value.length
    );
  }

  function readJSON(key, fallback = null) {
    checkKey(key);
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    checkKey(key);
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined)
        throw new Error("Value is not JSON serializable.");
      window.localStorage.setItem(key, serialized);
    } catch {
      throw new Error(
        "Could not save data in this browser. Check storage permissions and available space.",
      );
    }
  }

  function removeValue(key) {
    checkKey(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      throw new Error("Could not remove data from browser storage.");
    }
  }

  function isAvailable() {
    try {
      // Reading availability must not create even a temporary storage entry.
      return typeof window.localStorage.length === "number";
    } catch {
      return false;
    }
  }

  const validators = {
    company: (value) =>
      isObject(value) &&
      isText(value.name) &&
      (value.id === undefined || isText(value.id)) &&
      typeof value.startTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) &&
      isWholeNumber(value.graceMinutes) &&
      isWholeNumber(value.leaveQuota) &&
      (value.calendarExceptions === undefined ||
        isCalendar(value.calendarExceptions)) &&
      (value.endTime === undefined ||
        (isTime(value.endTime) && value.endTime > value.startTime)) &&
      (value.shiftExceptions === undefined ||
        isShifts(value.shiftExceptions)) &&
      (value.departments === undefined ||
        (Array.isArray(value.departments) &&
          value.departments.every(
            (name) => isText(name) && name.trim() === name && name.length <= 80,
          ) &&
          new Set(value.departments.map((name) => name.toLocaleLowerCase()))
            .size === value.departments.length)) &&
      (value.payrollPayments === undefined ||
        isPayrollPayments(value.payrollPayments)),
    users: (value) =>
      isObject(value) &&
      isText(value.id) &&
      isText(value.name) &&
      isText(value.email) &&
      isText(value.password) &&
      isRole(value.role) &&
      typeof value.department === "string" &&
      isAmount(value.salary) &&
      (value.createdOn === undefined || isDate(value.createdOn)),
    attendance: (value) =>
      isObject(value) &&
      isText(value.employeeId) &&
      isDate(value.date) &&
      (value.checkIn === null || isTimestamp(value.checkIn)) &&
      (value.checkOut === null || isTimestamp(value.checkOut)) &&
      (!value.checkOut ||
        (value.checkIn &&
          new Date(value.checkOut) >= new Date(value.checkIn))) &&
      ["present", "late", "half-day", "absent"].includes(value.status),
    leaves: (value) =>
      isObject(value) &&
      isText(value.id) &&
      isText(value.employeeId) &&
      isText(value.type) &&
      isDate(value.from) &&
      isDate(value.to) &&
      value.from <= value.to &&
      isWholeNumber(value.days) &&
      typeof value.reason === "string" &&
      ["pending", "approved", "rejected"].includes(value.status) &&
      typeof value.comment === "string",
    session: (value) =>
      isObject(value) &&
      isText(value.currentUserId) &&
      isRole(value.role) &&
      (value.companyId === undefined || isText(value.companyId)),
    companies: (value) =>
      isObject(value) &&
      value.version === 1 &&
      Array.isArray(value.workspaces) &&
      value.workspaces.every(
        (workspace) =>
          isObject(workspace) &&
          isText(workspace.id) &&
          validators.company(workspace.company) &&
          workspace.company.id === workspace.id &&
          ["users", "attendance", "leaves"].every(
            (name) =>
              Array.isArray(workspace[name]) &&
              workspace[name].every(validators[name]),
          ),
      ) &&
      new Set(value.workspaces.map((workspace) => workspace.id)).size ===
        value.workspaces.length &&
      (value.activeCompanyId === null
        ? value.workspaces.length === 0
        : value.workspaces.some(
            (workspace) => workspace.id === value.activeCompanyId,
          )),
  };

  function getSingle(name) {
    const value = readJSON(keys[name]);
    return validators[name](value) ? value : null;
  }

  function getRecords(name) {
    const value = readJSON(keys[name], []);
    return Array.isArray(value) && value.every(validators[name]) ? value : [];
  }

  function setSingle(name, value) {
    if (!validators[name](value)) throw new TypeError(`Invalid ${name} data.`);
    if (!isAvailable())
      throw new Error(
        "Could not save data in this browser. Check storage permissions and available space.",
      );
    transaction({ [name]: value });
  }

  function setRecords(name, value) {
    if (!Array.isArray(value) || !value.every(validators[name])) {
      throw new TypeError(`Invalid ${name} records.`);
    }
    transaction({ [name]: value });
  }

  function getIssues() {
    const issues = [];
    for (const [name, key] of Object.entries(keys)) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) continue;
        const value = JSON.parse(raw);
        const valid = ["users", "attendance", "leaves"].includes(name)
          ? Array.isArray(value) && value.every(validators[name])
          : validators[name](value);
        if (!valid) issues.push(key);
      } catch {
        issues.push(key);
      }
    }
    return issues;
  }

  function transaction(changes) {
    const issues = getIssues().filter(
      (key) => key !== keys.session || !changes.session,
    );
    if (issues.length)
      throw new Error(
        "Stored data is unreadable. Export or repair it in browser developer tools before making changes; no records have been replaced.",
      );
    changes = { ...changes };
    const registry = getSingle("companies");
    if (
      registry &&
      !Object.hasOwn(changes, "companies") &&
      ["company", "users", "attendance", "leaves"].some((name) =>
        Object.hasOwn(changes, name),
      )
    ) {
      const current = registry.workspaces.find(
        (workspace) => workspace.id === registry.activeCompanyId,
      );
      if (!current)
        throw new Error("Choose a company before changing workspace records.");
      const updated = { ...current };
      for (const name of ["company", "users", "attendance", "leaves"]) {
        if (Object.hasOwn(changes, name)) updated[name] = changes[name];
      }
      if (updated.company && updated.company.id === undefined) {
        updated.company = { ...updated.company, id: current.id };
        changes.company = updated.company;
      }
      if (updated.company?.id !== current.id)
        throw new Error("Company identity cannot change while saving records.");
      changes.companies = {
        ...registry,
        workspaces: registry.workspaces.map((workspace) =>
          workspace.id === current.id ? updated : workspace,
        ),
      };
    }
    const previous = new Map();
    for (const [name, value] of Object.entries(changes)) {
      if (!Object.hasOwn(keys, name))
        throw new Error("Unknown HCM collection.");
      const valid =
        value === null && ["company", "session"].includes(name)
          ? true
          : ["users", "attendance", "leaves"].includes(name)
            ? Array.isArray(value) && value.every(validators[name])
            : validators[name](value);
      if (!valid) throw new Error(`Invalid ${name} data.`);
      previous.set(keys[name], window.localStorage.getItem(keys[name]));
    }
    try {
      for (const [name, value] of Object.entries(changes)) {
        if (value === null && ["company", "session"].includes(name))
          removeValue(keys[name]);
        else writeJSON(keys[name], value);
      }
    } catch (error) {
      let recovered = true;
      for (const [key, raw] of previous) {
        try {
          if (raw === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, raw);
        } catch {
          recovered = false;
        }
      }
      throw new Error(
        `${error.message}${recovered ? " Changes were rolled back." : " Storage recovery failed; inspect your browser data before retrying."}`,
      );
    }
  }

  let queue = Promise.resolve();
  function mutate(callback) {
    const run = () =>
      window.navigator?.locks
        ? window.navigator.locks.request("huma-storage-write", () => callback())
        : callback();
    const task = queue.then(run);
    queue = task.catch(() => {});
    return task;
  }

  function findById(collection, id) {
    if (!["users", "leaves"].includes(collection))
      throw new Error("This collection has no record IDs.");
    return getRecords(collection).find((record) => record.id === id) || null;
  }

  function getWorkspaces() {
    const registry = getSingle("companies");
    if (registry) return registry.workspaces;
    const company = getSingle("company");
    if (!company) return [];
    const id = company.id || "legacy-company";
    return [
      {
        id,
        company: { ...company, id },
        users: getRecords("users"),
        attendance: getRecords("attendance"),
        leaves: getRecords("leaves"),
      },
    ];
  }

  function getActiveCompanyId() {
    const registry = getSingle("companies");
    if (registry) return registry.activeCompanyId;
    const company = getSingle("company");
    return company ? company.id || "legacy-company" : null;
  }

  function getWorkspace(id) {
    return getWorkspaces().find((workspace) => workspace.id === id) || null;
  }

  function listCompanies() {
    return getWorkspaces().map((workspace) => ({
      id: workspace.id,
      name: workspace.company.name,
    }));
  }

  function activateWorkspace(id, session) {
    const workspaces = getWorkspaces();
    const workspace = workspaces.find((entry) => entry.id === id);
    if (!workspace) throw new Error("This company is no longer available.");
    const registry = getSingle("companies");
    const changes = {
      company: workspace.company,
      users: workspace.users,
      attendance: workspace.attendance,
      leaves: workspace.leaves,
      session: { ...session, companyId: id },
    };
    if (registry) changes.companies = { ...registry, activeCompanyId: id };
    transaction(changes);
  }

  function addWorkspace(workspace, session) {
    const workspaces = getWorkspaces();
    if (workspaces.some((entry) => entry.id === workspace.id))
      throw new Error("Company identity already exists.");
    const companies = {
      version: 1,
      activeCompanyId: workspace.id,
      workspaces: [...workspaces, workspace],
    };
    transaction({
      companies,
      company: workspace.company,
      users: workspace.users,
      attendance: workspace.attendance,
      leaves: workspace.leaves,
      session: { ...session, companyId: workspace.id },
    });
  }

  function deleteActiveWorkspace() {
    const activeId = getActiveCompanyId();
    const workspaces = getWorkspaces().filter(
      (workspace) => workspace.id !== activeId,
    );
    const next = workspaces[0];
    transaction({
      companies: { version: 1, activeCompanyId: next?.id || null, workspaces },
      company: next?.company || null,
      users: next?.users || [],
      attendance: next?.attendance || [],
      leaves: next?.leaves || [],
      session: null,
    });
  }

  window.HCMStorage = Object.freeze({
    keys,
    readJSON,
    writeJSON,
    removeValue,
    isAvailable,
    getIssues,
    transaction,
    mutate,
    findById,
    listCompanies,
    getActiveCompanyId,
    getWorkspace,
    activateWorkspace,
    addWorkspace,
    deleteActiveWorkspace,
    getCompany: () => getSingle("company"),
    setCompany: (value) => setSingle("company", value),
    getUsers: () => getRecords("users"),
    setUsers: (value) => setRecords("users", value),
    getAttendance: () => getRecords("attendance"),
    setAttendance: (value) => setRecords("attendance", value),
    getLeaves: () => getRecords("leaves"),
    setLeaves: (value) => setRecords("leaves", value),
    getSession: () => getSingle("session"),
    setSession: (value) => setSingle("session", value),
    clearSession: () => removeValue(keys.session),
  });
})();
