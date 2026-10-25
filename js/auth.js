(function () {
  "use strict";

  const homePages = Object.freeze({
    admin: "admin.html",
    employee: "employee.html",
  });
  const pageCompanyId = window.HCMStorage.getActiveCompanyId();
  const pageUserId = window.HCMStorage.getSession()?.currentUserId;
  function pageUrl(target) {
    const atRoot =
      document.documentElement.dataset.page === "index.html" ||
      !document.documentElement.dataset.roles;
    return /^index\.html(?:[?#]|$)/.test(target)
      ? `${atRoot ? "" : "../"}${target}`
      : `${atRoot ? "pages/" : ""}${target}`;
  }

  function getCurrentUser() {
    if (!window.HCMStorage.getCompany()) return null;
    const session = window.HCMStorage.getSession();
    if (!session) return null;
    if (
      session.companyId &&
      session.companyId !== window.HCMStorage.getActiveCompanyId()
    )
      return null;
    const company = window.HCMStorage.getCompany();
    if (company.id && company.id !== window.HCMStorage.getActiveCompanyId())
      return null;
    const matches = window.HCMStorage.getUsers().filter(
      (user) => user.id === session.currentUserId,
    );
    if (matches.length !== 1 || matches[0].role !== session.role) return null;
    return matches[0];
  }

  function hasRole(roles) {
    const user = getCurrentUser();
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return Boolean(user && allowedRoles.includes(user.role));
  }

  function getHomePage(role) {
    return pageUrl(homePages[role] || "index.html");
  }

  function guardPage(roles) {
    const user = getCurrentUser();
    if (!user) {
      window.location.replace(pageUrl("index.html"));
      return false;
    }
    if (!hasRole(roles)) {
      window.location.replace(getHomePage(user.role));
      return false;
    }
    return true;
  }

  function signOut() {
    window.HCMStorage.clearSession();
    window.location.replace(pageUrl("index.html"));
  }

  function switchAccount(role) {
    if (!["admin", "employee"].includes(role))
      throw new Error("Choose Admin or Employee login.");
    window.HCMStorage.clearSession();
    window.location.replace(pageUrl(`index.html?view=${role}`));
  }

  function requireRole(roles) {
    if (
      document.documentElement.dataset.roles &&
      (pageCompanyId !== window.HCMStorage.getActiveCompanyId() ||
        pageUserId !== window.HCMStorage.getSession()?.currentUserId)
    )
      throw new Error(
        "The active company or account changed. Refresh this page before continuing.",
      );
    const user = getCurrentUser();
    if (!user || !(Array.isArray(roles) ? roles : [roles]).includes(user.role))
      throw new Error(
        "Your session does not allow this action. Sign in again.",
      );
    return user;
  }

  function register(input, allowAdditional) {
    return window.HCMStorage.mutate(() => {
      const store = window.HCMStorage;
      const utils = window.HCMUtils;
      if (
        !allowAdditional &&
        (store.getCompany() ||
          store.listCompanies().length ||
          store.getUsers().length ||
          store.getAttendance().length ||
          store.getLeaves().length)
      )
        throw new Error(
          "Setup cannot replace existing records. Use Create company to add another workspace.",
        );
      if (
        !store.getCompany() &&
        !store.listCompanies().length &&
        (store.getUsers().length ||
          store.getAttendance().length ||
          store.getLeaves().length)
      )
        throw new Error(
          "Existing records have no company. Repair the stored data before creating a workspace.",
        );
      const company = {
        id: utils.id(),
        name: utils.required(input.companyName, "Company name"),
        startTime: "09:00",
        endTime: "17:00",
        graceMinutes: 15,
        leaveQuota: 20,
      };
      if (
        store
          .listCompanies()
          .some(
            (entry) => entry.name.toLowerCase() === company.name.toLowerCase(),
          )
      )
        throw new Error(
          "A company with this name already exists in this browser.",
        );
      const user = {
        id: utils.id(),
        name: utils.required(input.name, "Admin name"),
        email: utils.email(input.email),
        password: utils.password(input.password),
        role: "admin",
        department: "",
        salary: 0,
      };
      if (input.password !== input.confirmPassword)
        throw new Error("Passwords do not match.");
      const session = {
        currentUserId: user.id,
        role: user.role,
        companyId: company.id,
      };
      if (store.getCompany() || store.readJSON(store.keys.companies) !== null) {
        store.addWorkspace(
          {
            id: company.id,
            company,
            users: [user],
            attendance: [],
            leaves: [],
          },
          session,
        );
      } else store.transaction({ company, users: [user], session });
      return user;
    });
  }
  const setup = (input) => register(input, false);
  const createCompany = (input) => register(input, true);

  function login(input) {
    return window.HCMStorage.mutate(() => {
      const email = window.HCMUtils.email(input.email);
      if (!input.password) throw new Error("Password is required.");
      const store = window.HCMStorage;
      const companyId = input.companyId || store.getActiveCompanyId();
      const workspace = store.getWorkspace(companyId);
      const users = (workspace?.users || []).filter(
        (user) =>
          user.email.toLowerCase() === email &&
          user.password === input.password,
      );
      if (!workspace || users.length !== 1)
        throw new Error(
          "Email or password is incorrect for the selected company.",
        );
      const user = users[0];
      if (
        input.role &&
        (!["admin", "employee"].includes(input.role) ||
          user.role !== input.role)
      ) {
        throw new Error(
          `These credentials do not match the selected login. Choose ${user.role === "admin" ? "Admin login" : "Employee login"} and try again.`,
        );
      }
      store.activateWorkspace(companyId, {
        currentUserId: user.id,
        role: user.role,
      });
      return user;
    });
  }

  function renameCompany(name, companyId) {
    return window.HCMStorage.mutate(() => {
      requireRole("admin");
      const store = window.HCMStorage;
      if (companyId && companyId !== store.getActiveCompanyId())
        throw new Error(
          "The active company changed. Refresh the company list.",
        );
      name = window.HCMUtils.required(name, "Company name");
      if (
        store
          .listCompanies()
          .some(
            (entry) =>
              entry.id !== store.getActiveCompanyId() &&
              entry.name.toLowerCase() === name.toLowerCase(),
          )
      )
        throw new Error("A company with this name already exists.");
      store.transaction({ company: { ...store.getCompany(), name } });
    });
  }

  function deleteCompany(confirmation, companyId) {
    return window.HCMStorage.mutate(() => {
      requireRole("admin");
      if (companyId && companyId !== window.HCMStorage.getActiveCompanyId())
        throw new Error(
          "The active company changed. Refresh the company list.",
        );
      if (confirmation !== window.HCMStorage.getCompany().name)
        throw new Error("Type the company name exactly to confirm deletion.");
      window.HCMStorage.deleteActiveWorkspace();
    });
  }

  window.HCMAuth = Object.freeze({
    getCurrentUser,
    hasRole,
    getHomePage,
    pageUrl,
    guardPage,
    signOut,
    switchAccount,
    requireRole,
    setup,
    createCompany,
    renameCompany,
    deleteCompany,
    login,
  });

  // Runs in the head before protected content can become visible.
  const roles = document.documentElement.dataset.roles;
  if (roles && guardPage(roles.split(","))) {
    document.documentElement.dataset.auth = "ready";
  }
})();
