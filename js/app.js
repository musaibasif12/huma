(function () {
  "use strict";
  const S = window.HCMStorage;
  const A = window.HCMAuth;
  const U = window.HCMUtils;
  const page = document.documentElement.dataset.page;
  let renderCurrent = () => {};
  let employeeTimer = null;
  let employeeView = null;
  const iconPaths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h2m4 0h2"/>',
    settings:
      '<circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h1m6 0h1M8 11h1m6 0h1"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/>',
    print:
      '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevrons: '<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (name === "class") node.className = value;
      else if (
        name === "href" &&
        /^[a-z][a-z0-9-]*\.html(?:[?#]|$)/i.test(value)
      )
        node.setAttribute(name, A.pageUrl(value));
      else if (name === "text") node.textContent = value;
      else if (name.startsWith("on"))
        node.addEventListener(name.slice(2).toLowerCase(), value);
      else if (name === "value") node.value = value;
      else if (value === true) node.setAttribute(name, "");
      else node.setAttribute(name, value);
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false)
        node.append(
          child instanceof Node
            ? child
            : document.createTextNode(String(child)),
        );
    }
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(key, value);
    // These paths are fixed application assets. User content is always a text node.
    svg.innerHTML = iconPaths[name] || iconPaths.grid;
    return svg;
  }
  function brand(linked = true) {
    return el(
      linked ? "a" : "div",
      {
        class: "brand",
        href: linked ? "index.html" : undefined,
        "aria-label": linked ? "Huma home" : "Huma",
      },
      el("img", {
        class: "brand-mark",
        src: `${page === "index.html" ? "" : "../"}assets/huma-logo.svg`,
        width: 36,
        height: 36,
        alt: "",
        "aria-hidden": "true",
      }),
      el("span", { class: "brand-wordmark" }, "huma"),
    );
  }
  function button(text, action, variant = "primary", iconName) {
    return el(
      "button",
      { type: "button", class: `button button-${variant}`, onClick: action },
      iconName && icon(iconName),
      text,
    );
  }
  function iconButton(name, label, action, className = "") {
    return el(
      "button",
      {
        type: "button",
        class: `icon-button ${className}`,
        "aria-label": label,
        title: label,
        onClick: action,
      },
      icon(name),
    );
  }
  function link(text, href, primary = false) {
    return el(
      "a",
      { class: primary ? "button button-primary" : "text-link", href },
      text,
      icon("arrow"),
    );
  }
  function badge(status) {
    return el(
      "span",
      { class: `badge badge-${status}` },
      U.statusLabels[status] || status,
    );
  }
  function empty(title, text, iconName = "users", action) {
    return el(
      "div",
      { class: "empty-state" },
      el("span", { class: "empty-icon" }, icon(iconName)),
      el("h3", {}, title),
      el("p", {}, text),
      action,
    );
  }
  function card(title, description, content, action) {
    return el(
      "section",
      { class: "card" },
      el(
        "div",
        { class: "card-header" },
        el(
          "div",
          {},
          el("h2", {}, title),
          description && el("p", { class: "muted" }, description),
        ),
        action,
      ),
      content,
    );
  }
  function heading(title, description, action) {
    return el(
      "div",
      { class: "page-header" },
      el(
        "div",
        {},
        el("h1", {}, title),
        el("p", { class: "page-description" }, description),
      ),
      action,
    );
  }
  function metric(label, value, detail, iconName = "grid") {
    return el(
      "div",
      { class: "metric" },
      el("div", { class: "metric-top" }, el("span", {}, label), icon(iconName)),
      el("div", { class: "metric-value" }, value),
      el("p", {}, detail),
    );
  }
  function table(headers, rows, emptyContent) {
    if (!rows.length)
      return (
        emptyContent ||
        empty("Nothing here yet", "New activity will appear here.")
      );
    return el(
      "div",
      {
        class: "table-scroll",
        tabindex: "0",
        "aria-label": `${headers.join(", ")} table`,
      },
      el(
        "table",
        {},
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            headers.map((header) => el("th", { scope: "col" }, header)),
          ),
        ),
        el(
          "tbody",
          {},
          rows.map((row) =>
            el(
              "tr",
              {},
              row.map((cell) => el("td", {}, cell)),
            ),
          ),
        ),
      ),
    );
  }
  function toast(message, error = false) {
    const node = el(
      "div",
      {
        class: `toast ${error ? "toast-error" : ""}`,
        role: error ? "alert" : "status",
      },
      icon(error ? "close" : "check"),
      el("span", {}, message),
    );
    node.append(
      iconButton("close", "Dismiss notification", () => node.remove()),
    );
    document.getElementById("toasts").append(node);
    window.setTimeout(() => node.remove(), error ? 12000 : 6000);
  }
  function errorMessage(form, message) {
    const target = form.querySelector(".form-error");
    target.textContent = message;
    target.hidden = false;
    target.focus();
  }
  function submit(form, callback, success) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.dataset.busy) return;
      if (!form.reportValidity()) return;
      const error = form.querySelector(".form-error");
      error.hidden = true;
      form.dataset.busy = "true";
      form.setAttribute("aria-busy", "true");
      const submitButton = form.querySelector('[type="submit"]');
      const label = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Saving…";
      try {
        const result = await callback(Object.fromEntries(new FormData(form)));
        if (success) success(result);
      } catch (failure) {
        errorMessage(
          form,
          failure.message || "Something went wrong. Please try again.",
        );
      } finally {
        delete form.dataset.busy;
        form.removeAttribute("aria-busy");
        submitButton.disabled = false;
        submitButton.textContent = label;
      }
    });
  }
  function field(label, name, options = {}) {
    const {
      type = "text",
      value = "",
      required = true,
      hint,
      id: customId,
      ...attributes
    } = options;
    const id = customId || `field-${name}`;
    const hintId = `${id}-hint`;
    const input = el(type === "textarea" ? "textarea" : "input", {
      id,
      name,
      type: type === "textarea" ? undefined : type,
      required,
      value,
      "aria-describedby": hint ? hintId : undefined,
      ...attributes,
    });
    let control = input;
    if (type === "password") {
      const toggle = iconButton(
        "eye",
        `Show ${label.toLowerCase()}`,
        () => {
          const visible = input.type === "password";
          input.type = visible ? "text" : "password";
          toggle.setAttribute(
            "aria-label",
            `${visible ? "Hide" : "Show"} ${label.toLowerCase()}`,
          );
          toggle.setAttribute("aria-pressed", String(visible));
        },
        "password-toggle",
      );
      toggle.setAttribute("aria-pressed", "false");
      control = el("div", { class: "password-input" }, input, toggle);
    }
    return el(
      "div",
      { class: "field" },
      el("label", { for: id }, label),
      control,
      hint && el("small", { class: "field-hint", id: hintId }, hint),
    );
  }
  function select(label, name, options, value = "", config = {}) {
    return window.HCMSelect.create(
      { el, icon },
      label,
      name,
      options,
      value,
      config,
    );
  }
  function formError() {
    return el("p", {
      class: "form-error",
      role: "alert",
      tabindex: "-1",
      hidden: true,
    });
  }
  function submitButton(label) {
    return el(
      "button",
      { class: "button button-primary", type: "submit" },
      label,
    );
  }
  function dialog(title, description, content) {
    const previous = document.activeElement;
    const node = el("dialog", {
      class: "dialog",
      "aria-labelledby": "dialog-title",
      "aria-describedby": "dialog-description",
    });
    const close = () => node.close();
    node.append(
      el(
        "div",
        { class: "dialog-header" },
        el(
          "div",
          {},
          el("h2", { id: "dialog-title" }, title),
          el("p", { id: "dialog-description", class: "muted" }, description),
        ),
        iconButton("close", "Close dialog", close),
      ),
      content,
    );
    node.addEventListener("close", () => {
      node.remove();
      if (previous?.isConnected) previous.focus();
    });
    node.addEventListener("click", (event) => {
      if (event.target === node && !node.querySelector('[aria-busy="true"]'))
        close();
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const items = [
        ...node.querySelectorAll(
          "a[href],button,input,select,textarea,[tabindex]",
        ),
      ].filter(
        (item) =>
          item.tabIndex >= 0 && !item.disabled && item.getClientRects().length,
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
    document.body.append(node);
    node.showModal();
    return { node, close };
  }
  function person(user, tag = "div") {
    const initials = user.name
      .trim()
      .split(/\s+/)
      .map((part) => Array.from(part)[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return el(
      tag,
      { class: "person" },
      el("span", { class: "avatar", "aria-hidden": "true" }, initials),
      el(
        tag === "span" ? "span" : "div",
        { class: "person-details" },
        el("strong", {}, user.name),
        el("span", {}, user.email),
      ),
    );
  }
  function profileMenu(user) {
    const wrapper = el("div", { class: "profile-control" });
    const menu = el("div", {
      class: "profile-menu",
      id: "profile-menu",
      role: "menu",
      "aria-label": "Account options",
      "aria-hidden": "true",
    });
    const trigger = el(
      "button",
      {
        type: "button",
        class: "profile-trigger",
        "aria-label": `Account menu for ${user.name}`,
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": "profile-menu",
      },
      person(user, "span"),
      icon("chevrons"),
    );
    let opened = false;
    let pinned = false;
    let hovered = false;
    let closeTimer;
    function setOpen(value, focusIndex = null) {
      window.clearTimeout(closeTimer);
      opened = value;
      if (!value) pinned = false;
      wrapper.classList.toggle("profile-open", value);
      trigger.setAttribute("aria-expanded", String(value));
      menu.setAttribute("aria-hidden", String(!value));
      menu.inert = !value;
      if (value && focusIndex !== null)
        menu.querySelectorAll("button")[focusIndex].focus();
    }
    function accountAction(action) {
      setOpen(false);
      try {
        action();
      } catch (error) {
        toast(error.message, true);
        trigger.focus();
      }
    }
    for (const [name, iconName, action] of [
      ["Employee Login", "users", () => A.switchAccount("employee")],
      ["Admin Login", "building", () => A.switchAccount("admin")],
      ["Log Out", "logout", () => A.signOut()],
    ]) {
      if (name === "Log Out")
        menu.append(el("div", { class: "profile-divider", role: "separator" }));
      menu.append(
        el(
          "button",
          {
            type: "button",
            role: "menuitem",
            tabindex: "-1",
            class: `profile-option${name === "Log Out" ? " profile-logout" : ""}`,
            onClick: () => accountAction(action),
          },
          icon(iconName),
          name,
        ),
      );
    }
    menu.inert = true;
    trigger.addEventListener("click", () => {
      const next = !opened || !pinned;
      setOpen(next);
      pinned = next;
    });
    wrapper.addEventListener("pointerenter", () => {
      hovered = true;
      if (
        window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
        !window.matchMedia("(max-width: 800px)").matches
      )
        setOpen(true);
    });
    wrapper.addEventListener("pointerleave", () => {
      hovered = false;
      closeTimer = window.setTimeout(() => {
        if (!pinned && !wrapper.contains(document.activeElement))
          setOpen(false);
      }, 180);
    });
    wrapper.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!hovered && !wrapper.contains(document.activeElement))
          setOpen(false);
      }, 0);
    });
    wrapper.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll("button")];
      if (event.key === "Escape" && opened) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.focus();
        return;
      }
      if (event.key === "Tab" && opened) {
        setOpen(false);
        trigger.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : index < 0
              ? event.key === "ArrowUp"
                ? items.length - 1
                : 0
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
      pinned = true;
      setOpen(true, next);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });
    wrapper.append(trigger, menu);
    return { node: wrapper, close: () => setOpen(false) };
  }
  function initShell(user) {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const workspace = document.querySelector(".workspace");
    const media = window.matchMedia("(max-width: 800px)");
    let opened = false;
    let toggle;
    const profile = profileMenu(user);
    function setOpen(value, focus = true) {
      opened = value && media.matches;
      if (!opened) profile.close();
      document.body.classList.toggle("nav-open", opened);
      sidebar.inert = media.matches && !opened;
      workspace.inert = opened;
      backdrop.hidden = !opened;
      toggle?.setAttribute("aria-expanded", String(opened));
      if (focus) {
        if (opened) close.focus();
        else if (media.matches) toggle.focus();
      }
    }
    const close = iconButton(
      "close",
      "Close navigation",
      () => setOpen(false),
      "sidebar-close",
    );
    sidebar.append(
      el("div", { class: "sidebar-brand" }, brand(), close),
      el(
        "p",
        { class: "nav-label" },
        user.role === "admin" ? "WORKSPACE" : "SELF SERVICE",
      ),
    );
    const items =
      user.role === "admin"
        ? [
            ["admin.html", "Overview", "grid"],
            ["employees.html", "Employees", "users"],
            ["leaves.html", "Leave requests", "calendar"],
            ["payslip.html", "Payroll", "file"],
            ["settings.html", "Settings", "settings"],
          ]
        : [
            ["employee.html", "My dashboard", "grid"],
            ["payslip.html", "My payslip", "file"],
          ];
    const nav = el(
      "nav",
      { "aria-label": "Main navigation" },
      el(
        "ul",
        { class: "nav-list" },
        items.map(([href, name, iconName]) =>
          el(
            "li",
            {},
            el(
              "a",
              {
                class: "nav-link",
                href,
                "aria-current": href === page ? "page" : undefined,
              },
              icon(iconName),
              name,
            ),
          ),
        ),
      ),
    );
    const companyAccess = el(
      "div",
      { class: "company-access" },
      el("p", { class: "nav-label" }, "COMPANIES"),
      el(
        "a",
        { class: "nav-link", href: "index.html?view=companies" },
        icon("building"),
        "Manage companies",
      ),
      el(
        "a",
        { class: "nav-link", href: "index.html?view=setup" },
        icon("plus"),
        "Create company",
      ),
    );
    sidebar.append(
      nav,
      companyAccess,
      el("div", { class: "sidebar-bottom" }, profile.node),
    );
    toggle = iconButton(
      "menu",
      "Open navigation",
      () => setOpen(true),
      "menu-toggle",
    );
    toggle.setAttribute("aria-controls", "sidebar");
    const company = S.getCompany();
    document
      .getElementById("topbar")
      .append(
        el(
          "div",
          { class: "topbar-context" },
          toggle,
          icon("building"),
          el("span", { class: "company-name" }, company.name),
          el("span", { class: "breadcrumb-separator" }, "/"),
          el(
            "span",
            { class: "breadcrumb-current" },
            document.title.split(" · ")[0],
          ),
        ),
        el(
          "div",
          { class: "topbar-right" },
          el(
            "span",
            { class: "topbar-date" },
            U.formatDate(new Date(), { weekday: "short" }),
          ),
          el(
            "span",
            { class: "badge" },
            user.role === "admin" ? "Admin" : "Employee",
          ),
        ),
      );
    backdrop.addEventListener("click", () => setOpen(false));
    media.addEventListener("change", () => setOpen(false, false));
    document.addEventListener("keydown", (event) => {
      if (!opened) return;
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...sidebar.querySelectorAll("a,button")].filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.closest("[inert]") &&
          node.getClientRects().length,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    setOpen(false, false);
    initMobileNavigation(user);
  }
  function initMobileNavigation(user) {
    const employee = user.role === "employee";
    const items = employee
      ? [
          ["employee.html#employee-home", "Home", "grid"],
          ["employee.html#attendance-calendar", "Attendance", "clock"],
          ["employee.html#leave-balance", "Leaves", "calendar"],
          ["payslip.html", "Payslip", "file"],
        ]
      : [
          ["admin.html", "Overview", "grid"],
          ["employees.html", "Employees", "users"],
          ["leaves.html", "Leaves", "calendar"],
          ["payslip.html", "Payroll", "file"],
        ];
    const nav = el("nav", {
      class: "mobile-bottom-nav",
      "aria-label": "Mobile main navigation",
    });
    const links = items.map(([href, title, name]) =>
      el("a", { href }, icon(name), el("span", {}, title)),
    );
    let sheet = null;
    const more = el(
      "button",
      {
        type: "button",
        "aria-label": "More navigation",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        onClick: () => openMore(),
      },
      icon("more"),
      el("span", {}, "More"),
    );
    function markActive() {
      const hash = window.location.hash || "#employee-home";
      links.forEach((anchor, index) => {
        const [route, fragment] = items[index][0].split("#");
        const active = route === page && (!fragment || hash === `#${fragment}`);
        if (active) anchor.setAttribute("aria-current", "page");
        else anchor.removeAttribute("aria-current");
      });
      if (!employee && page === "settings.html")
        more.setAttribute("aria-current", "page");
    }
    function showSheet(title, content) {
      sheet = dialog(title, S.getCompany().name, content);
      sheet.node.classList.add("mobile-more-sheet");
      document.body.classList.add("mobile-sheet-open");
      more.setAttribute("aria-expanded", "true");
      sheet.node.addEventListener("close", () => {
        if (!document.querySelector(".mobile-more-sheet[open]")) {
          document.body.classList.remove("mobile-sheet-open");
          more.setAttribute("aria-expanded", "false");
          more.focus();
        }
      });
      return sheet;
    }
    function account() {
      sheet.close();
      showSheet(
        "Your account",
        el(
          "div",
          { class: "mobile-sheet-options" },
          person(user),
          button(
            "Employee Login",
            () => A.switchAccount("employee"),
            "secondary",
            "users",
          ),
          button(
            "Admin Login",
            () => A.switchAccount("admin"),
            "secondary",
            "building",
          ),
          button("Log Out", () => A.signOut(), "danger-quiet", "logout"),
        ),
      );
    }
    function openMore() {
      const actions = el("div", { class: "mobile-sheet-options" });
      if (!employee) actions.append(link("Settings", "settings.html"));
      actions.append(
        link("Manage companies", "index.html?view=companies"),
        link("Create company", "index.html?view=setup"),
        button("Account", account, "secondary", "users"),
        button(
          "Smart Helper",
          () => {
            sheet.node.addEventListener(
              "close",
              () => document.querySelector(".helper-launcher")?.click(),
              { once: true },
            );
            sheet.close();
          },
          "secondary",
          "chat",
        ),
        button("Log Out", () => A.signOut(), "danger-quiet", "logout"),
      );
      showSheet("More", actions);
    }
    nav.append(...links, more);
    document.body.append(nav);
    markActive();
    window.addEventListener("hashchange", markActive);
  }
  function initAuth() {
    const current = A.getCurrentUser();
    const requestedView = new URLSearchParams(window.location.search).get(
      "view",
    );
    const requestedCompanyId = new URLSearchParams(window.location.search).get(
      "company",
    );
    document.querySelector("[data-brand]").append(brand());
    const main = document.getElementById("auth-content");
    const configured = Boolean(S.getCompany());
    const view = ["admin", "employee", "setup", "companies"].includes(
      requestedView,
    )
      ? requestedView
      : current
        ? "companies"
        : configured
          ? "admin"
          : "setup";
    const isSetup = view === "setup";
    const accessNav = el("nav", {
      class: "auth-access-nav",
      "aria-label": "Account access",
    });
    const choices = [
      ["setup", "Create company"],
      ["companies", "Manage companies"],
      ["admin", "Admin login"],
      ["employee", "Employee login"],
    ];
    for (const [mode, label] of choices)
      accessNav.append(
        el(
          "a",
          {
            href: `index.html?view=${mode}${["admin", "employee"].includes(mode) && requestedCompanyId ? `&company=${encodeURIComponent(requestedCompanyId)}` : ""}`,
            "aria-current": mode === view ? "page" : undefined,
          },
          label,
        ),
      );
    main.append(accessNav);
    if (view === "companies") {
      renderCompanies(main, current);
      return;
    }
    main.append(
      el(
        "p",
        { class: "eyebrow" },
        isSetup
          ? "NEW WORKSPACE"
          : view === "employee"
            ? "EMPLOYEE ACCESS"
            : "ADMIN ACCESS",
      ),
      el(
        "h1",
        {},
        isSetup
          ? "Create a company"
          : view === "employee"
            ? "Employee login"
            : "Admin login",
      ),
      el(
        "p",
        { class: "auth-description" },
        isSetup
          ? "Set up a new workspace for your team."
          : view === "employee"
            ? "Choose your company and sign in with the account provided by your admin."
            : "Sign in to manage your team and company.",
      ),
    );
    const form = el("form", { class: "auth-form" });
    if (isSetup)
      form.append(
        field("Company name", "companyName", {
          autocomplete: "organization",
          maxlength: 160,
        }),
        field("Your full name", "name", {
          autocomplete: "name",
          maxlength: 160,
        }),
      );
    else {
      form.append(el("input", { type: "hidden", name: "role", value: view }));
      const companies = S.listCompanies();
      const selected = companies.some(
        (entry) => entry.id === requestedCompanyId,
      )
        ? requestedCompanyId
        : S.getActiveCompanyId();
      const companyField = select(
        "Company",
        "companyId",
        companies.length
          ? companies.map((entry) => [entry.id, entry.name])
          : [["", "No companies available"]],
        selected,
      );
      companyField.addEventListener("change", () => {
        const companyId = companyField.querySelector("select").value;
        for (const anchor of accessNav.querySelectorAll("a")) {
          const target = new URL(anchor.href);
          if (["admin", "employee"].includes(target.searchParams.get("view"))) {
            target.searchParams.set("company", companyId);
            anchor.href = target.href;
          }
        }
      });
      form.append(companyField);
    }
    form.append(
      field("Email address", "email", {
        type: "email",
        autocomplete: "username",
        maxlength: 254,
      }),
      field("Password", "password", {
        type: "password",
        autocomplete: isSetup ? "new-password" : "current-password",
        minlength: isSetup ? 6 : 1,
        maxlength: 128,
        hint: isSetup ? "At least 6 characters." : undefined,
      }),
    );
    if (isSetup)
      form.append(
        field("Confirm password", "confirmPassword", {
          type: "password",
          autocomplete: "new-password",
          minlength: 6,
          maxlength: 128,
        }),
        el(
          "div",
          { class: "notice" },
          el("strong", {}, "Your starting policies"),
          el(
            "p",
            {},
            "09:00–17:00 shift · 15-minute grace · 20 paid leave days per year. Adjust these in Settings.",
          ),
        ),
      );
    form.append(
      formError(),
      submitButton(
        isSetup
          ? "Create company"
          : view === "employee"
            ? "Sign in as employee"
            : "Sign in as admin",
      ),
    );
    submit(form, isSetup ? A.createCompany : A.login, (user) =>
      window.location.replace(A.getHomePage(user.role)),
    );
    if (!isSetup && !S.listCompanies().length) {
      form.prepend(
        el(
          "p",
          { class: "notice auth-login-notice" },
          "No company has been set up in this browser yet. Your admin must create the workspace and your employee account first.",
          el("a", { href: "index.html?view=setup" }, "Create a company"),
        ),
      );
      form.querySelector('[type="submit"]').disabled = true;
    }
    if (current)
      main.append(
        el(
          "p",
          { class: "notice auth-login-notice" },
          `You are signed in as ${current.name} at ${S.getCompany().name}. ${isSetup ? "Creating a company will open its new admin account." : "Signing in below switches this browser to the selected company and account."}`,
          link("Continue to my dashboard", A.getHomePage(current.role)),
        ),
      );
    main.append(
      form,
      el(
        "button",
        {
          type: "button",
          class: "data-privacy-link",
          onClick: () =>
            dialog(
              "About your data",
              "Huma stores this workspace in your browser.",
              el(
                "div",
                { class: "privacy-note" },
                el(
                  "p",
                  {},
                  "Accounts and HR records are saved locally in this browser. They are not automatically synchronized or backed up.",
                ),
                el(
                  "p",
                  {},
                  "Local credentials and role checks do not provide production security. Use fictional information rather than real employee, credential, or payroll data.",
                ),
              ),
            ),
        },
        "About your data",
      ),
    );
    if (
      !S.isAvailable() ||
      S.getIssues().some((key) => key !== S.keys.session)
    ) {
      errorMessage(
        form,
        "Browser data is unavailable or malformed. Allow storage or repair the existing hcm_* data before continuing. Nothing has been reset.",
      );
      form.querySelector('[type="submit"]').disabled = true;
    }
  }

  function renderCompanies(main, current) {
    document.body.classList.add("auth-directory");
    main.append(
      el(
        "div",
        { class: "company-directory-heading" },
        el(
          "div",
          {},
          el("h1", {}, "Companies"),
          el(
            "p",
            { class: "auth-description" },
            "Manage and switch between your workspaces.",
          ),
        ),
        link("Create company", "index.html?view=setup", true),
      ),
    );
    const directory = el("div", { class: "company-list" });
    const activeId = S.getActiveCompanyId();
    const companies = S.listCompanies();
    if (!companies.length)
      directory.append(
        empty(
          "No companies yet",
          "Create your first workspace to get started.",
          "building",
          link("Create company", "index.html?view=setup", true),
        ),
      );
    for (const company of companies) {
      const isCurrent = Boolean(current && company.id === activeId);
      const loginUrl = (role) =>
        `index.html?view=${role}&company=${encodeURIComponent(company.id)}`;
      const actions = el("div", { class: "company-actions" });
      if (isCurrent)
        actions.append(
          link("Open workspace", A.getHomePage(current.role), true),
        );
      else
        actions.append(
          link("Switch workspace", loginUrl(current?.role || "admin"), true),
        );
      const extra = el(
        "div",
        { class: "company-overflow-options" },
        link("Admin login", loginUrl("admin")),
        link("Employee login", loginUrl("employee")),
      );
      if (isCurrent && current.role === "admin")
        extra.append(
          button("Rename", () => renameCompanyDialog(company), "secondary"),
          link("Settings", "settings.html"),
          button(
            "Delete company",
            () => deleteCompanyDialog(company),
            "danger-quiet",
          ),
        );
      const overflow = el(
        "details",
        { class: "company-overflow" },
        el(
          "summary",
          { "aria-label": `More actions for ${company.name}` },
          icon("more"),
          "More",
        ),
        extra,
      );
      overflow.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && overflow.open) {
          event.preventDefault();
          overflow.open = false;
          overflow.querySelector("summary").focus();
        }
      });
      document.addEventListener("pointerdown", (event) => {
        if (!overflow.contains(event.target)) overflow.open = false;
      });
      actions.append(overflow);
      directory.append(
        el(
          "section",
          {
            class: `company-tile${isCurrent ? " is-active-company" : ""}`,
            "aria-label": company.name,
          },
          el(
            "div",
            { class: "company-tile-heading" },
            el("span", { class: "empty-icon" }, icon("building")),
            el("h2", {}, company.name),
            isCurrent &&
              el("span", { class: "badge badge-active" }, "Active workspace"),
          ),
          el(
            "p",
            { class: "muted small" },
            isCurrent
              ? `Signed in as ${current.role === "admin" ? "Admin" : "Employee"}${current.role === "admin" ? ` · ${S.getUsers().filter((user) => user.role === "employee").length} employees` : ""}.`
              : "Sign in to access this company’s workspace.",
          ),
          actions,
        ),
      );
    }
    main.append(
      directory,
      el(
        "div",
        { class: "company-directory-footer" },
        link("Create another company", "index.html?view=setup", true),
      ),
      el(
        "p",
        { class: "company-directory-note" },
        "Companies are saved in this browser only. Sign in as a company’s admin to rename, configure, or delete it. Employee records are never listed here.",
      ),
    );
    if (S.getIssues().length || !S.isAvailable())
      main.prepend(
        el(
          "p",
          { class: "form-error", role: "alert" },
          "Some browser data is unavailable or malformed. Changes are blocked to preserve existing records.",
        ),
      );
    function renameCompanyDialog(company) {
      const form = el(
        "form",
        {},
        field("Company name", "name", { value: company.name, maxlength: 160 }),
        formError(),
      );
      const modal = dialog(
        "Rename company",
        "Your company’s employees, policies, calendar, and records will be preserved.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Cancel", modal.close, "secondary"),
          submitButton("Save company name"),
        ),
      );
      submit(
        form,
        (input) => A.renameCompany(input.name, company.id),
        () => {
          modal.close();
          window.location.reload();
        },
      );
    }
    function deleteCompanyDialog(company) {
      const form = el(
        "form",
        {},
        el(
          "p",
          { class: "notice notice-danger" },
          `Permanently delete ${company.name}, its accounts, attendance, leave, settings, and calendar? Other companies will be preserved. This cannot be undone.`,
        ),
        field("Type the company name to confirm", "confirmation", {
          autocomplete: "off",
          maxlength: 160,
        }),
        formError(),
      );
      const modal = dialog(
        "Delete company?",
        "Only the signed-in admin can delete the current company.",
        form,
      );
      const remove = submitButton("Delete company");
      remove.classList.replace("button-primary", "button-danger");
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Keep company", modal.close, "secondary"),
          remove,
        ),
      );
      submit(
        form,
        (input) => A.deleteCompany(input.confirmation, company.id),
        () => {
          modal.close();
          window.location.replace("index.html?view=companies");
        },
      );
    }
  }
  function attendanceRows(rows) {
    return rows.map(({ employee, record, status }) => [
      person(employee),
      employee.department,
      U.formatTime(record?.checkIn),
      U.formatTime(record?.checkOut),
      badge(status === "not-employed" ? "not-started" : status),
    ]);
  }
  function leaveRows(leaves, admin = false, actions = false) {
    const users = admin ? S.getUsers() : [];
    return leaves.map((leave) => [
      ...(admin
        ? [
            person(
              users.find((user) => user.id === leave.employeeId) || {
                name: "Deleted employee",
                email: "",
              },
            ),
          ]
        : []),
      el("span", { class: "capitalize" }, `${leave.type} · Paid`),
      `${U.formatDate(leave.from)} – ${U.formatDate(leave.to)}`,
      `${U.countWorkingDays(leave.from, leave.to, S.getCompany().calendarExceptions || [])} day(s)`,
      el(
        "div",
        { class: "reason-cell" },
        el("span", {}, leave.reason),
        leave.comment &&
          el("small", { class: "muted" }, `Comment: ${leave.comment}`),
      ),
      badge(leave.status),
      ...(actions
        ? [
            leave.status === "pending"
              ? button("Review", () => reviewLeave(leave), "secondary")
              : el("span", { class: "muted" }, "Decided"),
          ]
        : []),
    ]);
  }
  function renderAdmin() {
    const main = document.getElementById("page-content");
    const user = A.getCurrentUser();
    const stats = window.HCMAdmin.summary();
    const today = U.localDate();
    const working = U.isWorkingDay(
      today,
      S.getCompany().calendarExceptions || [],
    );
    main.replaceChildren(
      heading(
        `Welcome back, ${user.name.split(" ")[0]}.`,
        "A little clarity for the day ahead.",
        link("Add employee", "employees.html", true),
      ),
    );
    main.append(
      el(
        "div",
        { class: "metrics-grid" },
        metric(
          "Total employees",
          stats.employees,
          "People in your workspace",
          "users",
        ),
        metric(
          "Present today",
          stats.present,
          working
            ? "Including late and half-day check-ins"
            : "Today is a non-working day",
          "check",
        ),
        metric(
          "Late today",
          stats.late,
          "After the saved grace period",
          "clock",
        ),
        metric(
          "Absent today",
          stats.absent,
          "Absence is final after the day ends",
          "calendar",
        ),
        metric(
          "Pending requests",
          stats.pending,
          "Ready for your review",
          "file",
        ),
      ),
    );
    const attendanceContent = el("div");
    const dateField = field("Attendance date", "attendance-date", {
      type: "date",
      value: today,
      max: today,
    });
    const dateToolbar = el(
      "div",
      { class: "toolbar" },
      dateField,
      el(
        "p",
        { class: "muted small" },
        "Attendance follows your company calendar, including holidays and extra working days. Today’s missing check-ins remain open until the day ends.",
      ),
    );
    const grid = el("div");
    function renderDate() {
      try {
        const date = dateField.querySelector("input").value;
        U.parseDate(date);
        const selected = window.HCMAdmin.summary(date);
        grid.replaceChildren(
          table(
            ["Employee", "Department", "Check-in", "Check-out", "Status"],
            attendanceRows(selected.rows),
            empty(
              "Your team starts here",
              "Add your first employee to bring this workspace to life.",
              "users",
              link("Add employee", "employees.html", true),
            ),
          ),
        );
      } catch (error) {
        toast(error.message, true);
      }
    }
    dateField.addEventListener("change", renderDate);
    attendanceContent.append(dateToolbar, grid);
    renderDate();
    main.append(
      card(
        "Attendance overview",
        "A daily view of your team’s working day.",
        attendanceContent,
      ),
    );
    const pending = window.HCMLeaves.list().slice(0, 5);
    main.append(
      card(
        "Recent leave requests",
        "Time away, thoughtfully coordinated.",
        table(
          ["Employee", "Type", "Dates", "Days", "Reason / comment", "Status"],
          leaveRows(pending, true),
          empty(
            "No leave requests yet",
            "Requests from your team will appear here.",
            "calendar",
          ),
        ),
        link("View requests", "leaves.html"),
      ),
    );
    if (stats.employees) {
      const tracked = stats.rows.filter(
        (row) => row.record || row.status === "leave",
      ).length;
      main.append(
        el(
          "section",
          {
            class: "activity-strip",
            "aria-label": "Today’s activity coverage",
          },
          el(
            "div",
            {},
            el("strong", {}, "Today, at a glance"),
            el(
              "p",
              { class: "muted" },
              `${tracked} of ${stats.employees} employees have a check-in or approved leave.`,
            ),
          ),
          el("progress", {
            max: stats.employees,
            value: tracked,
            "aria-label": "Employees with check-in or approved leave",
          }),
        ),
      );
    }
  }
  function employeeDialog(existing = null, onDepartmentAdded = null) {
    const E = window.HCMEmployees;
    const choices = E.departments();
    const selected =
      choices.find(
        (name) =>
          name.toLocaleLowerCase() ===
          existing?.department.trim().toLocaleLowerCase(),
      ) || "";
    const department = select(
      "Department",
      "department",
      [["", "Select department"], ...choices.map((name) => [name, name])],
      selected,
      { required: true },
    );
    const newName = field("New department name", "newDepartment", {
      required: false,
      maxlength: 80,
      id: "new-department-name",
      placeholder: "e.g. Customer Success",
    });
    const departmentError = el("p", {
      class: "department-error",
      role: "alert",
      hidden: true,
    });
    const editor = el(
      "div",
      { class: "department-editor", hidden: true },
      newName,
      departmentError,
    );
    const openEditor = button(
      "Add department",
      () => {
        editor.hidden = false;
        newName.querySelector("input").required = true;
        openEditor.hidden = true;
        newName.querySelector("input").focus();
      },
      "secondary",
      "plus",
    );
    openEditor.classList.add("department-add-button");
    function closeEditor() {
      editor.hidden = true;
      newName.querySelector("input").required = false;
      newName.querySelector("input").value = "";
      departmentError.hidden = true;
      openEditor.hidden = false;
    }
    const add = button(
      "Add",
      async () => {
        const input = newName.querySelector("input");
        if (!input.reportValidity()) return;
        add.disabled = true;
        add.setAttribute("aria-busy", "true");
        try {
          const name = await E.addDepartment(input.value);
          const native = department.querySelector("select");
          native.replaceChildren(
            el("option", { value: "" }, "Select department"),
            ...E.departments().map((value) => el("option", { value }, value)),
          );
          native.value = name;
          native.dispatchEvent(new Event("change", { bubbles: true }));
          onDepartmentAdded?.();
          closeEditor();
          department.querySelector('[role="combobox"]').focus();
          toast("Department added. It is available to this company.");
        } catch (error) {
          departmentError.textContent = error.message;
          departmentError.hidden = false;
          input.focus();
        } finally {
          add.disabled = false;
          add.removeAttribute("aria-busy");
        }
      },
      "primary",
    );
    editor.append(
      el(
        "div",
        { class: "department-editor-actions" },
        add,
        button(
          "Cancel",
          () => {
            closeEditor();
            openEditor.focus();
          },
          "secondary",
        ),
      ),
    );
    newName.querySelector("input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        add.click();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!add.disabled) {
          closeEditor();
          openEditor.focus();
        }
      }
    });
    department.append(openEditor, editor);
    const form = el(
      "form",
      {},
      el(
        "div",
        { class: "form-grid" },
        field("Full name", "name", {
          value: existing?.name || "",
          maxlength: 160,
        }),
        field("Email address", "email", {
          type: "email",
          value: existing?.email || "",
          maxlength: 254,
        }),
        field(
          existing ? "New password (optional)" : "Temporary password",
          "password",
          {
            type: "password",
            required: !existing,
            minlength: 6,
            maxlength: 128,
            autocomplete: "new-password",
            hint: existing
              ? "Leave blank to keep the current password."
              : "At least 6 characters. Share these login details with the employee.",
          },
        ),
        department,
        field("Monthly salary (PKR)", "salary", {
          type: "number",
          min: "0.01",
          max: "1000000000000",
          step: "0.01",
          value: existing?.salary || "",
        }),
      ),
      formError(),
    );
    form.addEventListener("submit", (event) => {
      if (!editor.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        departmentError.textContent =
          "Add or cancel the new department before saving the employee.";
        departmentError.hidden = false;
        newName.querySelector("input").focus();
      }
    });
    const modal = dialog(
      existing ? "Edit employee" : "Add a new employee",
      "Their account gives them access to their own attendance, leave, and payslips.",
      form,
    );
    form.append(
      el(
        "div",
        { class: "form-actions" },
        button("Cancel", modal.close, "secondary"),
        submitButton(existing ? "Save changes" : "Create employee"),
      ),
    );
    submit(
      form,
      (input) => window.HCMEmployees.save(input, existing?.id),
      () => {
        modal.close();
        toast(
          existing
            ? "Employee updated."
            : "Employee account is ready. They can now sign in.",
        );
        renderCurrent();
      },
    );
  }
  function deleteEmployee(user) {
    const form = el(
      "form",
      {},
      el(
        "p",
        { class: "notice notice-danger" },
        `Delete ${user.name} and all of their attendance and leave records? This action cannot be undone.`,
      ),
      formError(),
    );
    const modal = dialog(
      "Delete employee?",
      "Associated records are removed together to avoid broken references.",
      form,
    );
    const remove = el(
      "button",
      { type: "submit", class: "button button-danger" },
      "Delete employee",
    );
    form.append(
      el(
        "div",
        { class: "form-actions" },
        button("Keep employee", modal.close, "secondary"),
        remove,
      ),
    );
    submit(
      form,
      () => window.HCMEmployees.remove(user.id),
      () => {
        modal.close();
        toast("Employee and associated records deleted.");
        renderCurrent();
      },
    );
  }
  function renderEmployees() {
    const main = document.getElementById("page-content");
    const employees = window.HCMEmployees.list();
    main.replaceChildren(
      heading(
        "Your people.",
        "A well-organized team starts with the essentials.",
        button(
          "Add employee",
          () => employeeDialog(null, refreshDepartmentOptions),
          "primary",
          "plus",
        ),
      ),
    );
    const searchField = field("Search employees", "search", {
      type: "search",
      required: false,
      placeholder: "Search by name or email…",
      maxlength: 160,
    });
    const departmentField = select("Department", "department-filter", [
      ["", "All departments"],
      ...window.HCMEmployees.departments().map((name) => [name, name]),
    ]);
    function refreshDepartmentOptions() {
      const input = departmentField.querySelector("select"),
        previous = input.value;
      input.replaceChildren(
        el("option", { value: "" }, "All departments"),
        ...window.HCMEmployees.departments().map((name) =>
          el("option", { value: name }, name),
        ),
      );
      input.value = previous;
      departmentField.refreshSelect();
    }
    const results = el("div");
    const count = el("span", { class: "muted small", role: "status" });
    const toolbar = el(
      "div",
      { class: "toolbar directory-toolbar" },
      searchField,
      departmentField,
      count,
    );
    function update() {
      const users = window.HCMEmployees.list(
        searchField.querySelector("input").value,
        departmentField.querySelector("select").value,
      );
      count.textContent = `${users.length} employee${users.length === 1 ? "" : "s"}`;
      results.replaceChildren(
        table(
          ["Employee", "Department", "Monthly salary", "Status", "Actions"],
          users.map((user) => [
            person(user),
            user.department,
            U.formatCurrency(user.salary),
            badge("active"),
            el(
              "div",
              { class: "row-actions" },
              button(
                "Edit",
                () => employeeDialog(user, refreshDepartmentOptions),
                "secondary",
              ),
              button("Delete", () => deleteEmployee(user), "danger-quiet"),
            ),
          ]),
          empty(
            employees.length
              ? "No matching employees"
              : "Your first teammate belongs here",
            employees.length
              ? "Try another name, email, or department."
              : "Create an employee account to get started.",
            "users",
            !employees.length &&
              button(
                "Add employee",
                () => employeeDialog(null, refreshDepartmentOptions),
                "primary",
                "plus",
              ),
          ),
        ),
      );
    }
    searchField.addEventListener("input", update);
    departmentField.addEventListener("change", update);
    main.append(el("section", { class: "card" }, toolbar, results));
    update();
  }
  function renderSettings() {
    window.HCMSettingsWorkspace.render({
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
    });
  }
  function renderLeaves() {
    const main = document.getElementById("page-content");
    const leaves = window.HCMLeaves.list();
    main.replaceChildren(
      heading(
        "Time away, in order.",
        "Review requests and help your team plan ahead.",
      ),
    );
    main.append(
      el(
        "div",
        { class: "metrics-grid metrics-three" },
        metric(
          "Pending review",
          leaves.filter((leave) => leave.status === "pending").length,
          "Requests awaiting a decision",
          "clock",
        ),
        metric(
          "Approved",
          leaves.filter((leave) => leave.status === "approved").length,
          "Paid leave requests",
          "check",
        ),
        metric(
          "Rejected",
          leaves.filter((leave) => leave.status === "rejected").length,
          "Requests not approved",
          "calendar",
        ),
      ),
    );
    const filter = select("Request status", "status-filter", [
      ["", "All requests"],
      ["pending", "Pending"],
      ["approved", "Approved"],
      ["rejected", "Rejected"],
    ]);
    const results = el("div");
    function update() {
      const selected = filter.querySelector("select").value;
      const filtered = leaves.filter(
        (leave) => !selected || leave.status === selected,
      );
      results.replaceChildren(
        table(
          [
            "Employee",
            "Type",
            "Dates",
            "Days",
            "Reason / comment",
            "Status",
            "Action",
          ],
          leaveRows(filtered, true, true),
          empty(
            "No requests to show",
            selected
              ? "There are no requests with this status."
              : "Employee requests will appear here when submitted.",
            "calendar",
          ),
        ),
      );
    }
    filter.addEventListener("change", update);
    main.append(
      el(
        "section",
        { class: "card" },
        el("div", { class: "toolbar" }, filter),
        results,
      ),
    );
    update();
  }
  function leaveForm(user, onSuccess) {
    const form = el(
      "form",
      { class: "card-body leave-form" },
      select(
        "Leave type",
        "type",
        [
          ["annual", "Annual leave (paid)"],
          ["personal", "Personal leave (paid)"],
        ],
        "annual",
      ),
      el(
        "div",
        { class: "form-grid" },
        field("From date", "from", { type: "date", min: U.localDate() }),
        field("To date", "to", { type: "date", min: U.localDate() }),
      ),
      field("Reason", "reason", {
        type: "textarea",
        maxlength: 1000,
        rows: 3,
        placeholder: "A brief note for your admin…",
      }),
      el(
        "p",
        { class: "field-hint", "data-leave-preview": true },
        "Only company working days count. Holidays are excluded and extra working days are included. Both types use your annual paid leave allowance.",
      ),
      formError(),
      submitButton("Submit leave request"),
    );
    const from = form.elements.from;
    const to = form.elements.to;
    function preview() {
      const target = form.querySelector("[data-leave-preview]");
      try {
        if (!from.value || !to.value) return;
        const days = U.countWorkingDays(
          from.value,
          to.value,
          S.getCompany().calendarExceptions || [],
        );
        target.textContent = `${days} working day(s). Pending requests reserve allowance for new applications. Approved leave reduces your displayed balance.`;
      } catch (error) {
        target.textContent = error.message;
      }
    }
    from.addEventListener("change", preview);
    to.addEventListener("change", preview);
    submit(form, window.HCMLeaves.apply, () => {
      toast("Leave request sent to your admin.");
      if (onSuccess) onSuccess();
      renderCurrent();
    });
    return form;
  }
  function renderEmployee() {
    window.clearInterval(employeeTimer);
    const main = document.getElementById("page-content");
    const user = A.requireRole("employee");
    const company = S.getCompany();
    const companyId = S.getActiveCompanyId();
    const M = window.HCMEmployeeDashboard;
    const now = new Date();
    const today = U.localDate(now);
    const records = window.HCMAttendance.records(user.id);
    const leaves = window.HCMLeaves.list();
    const calendar = company.calendarExceptions || [];
    const dayInfo = U.calendarDay(today, calendar);
    const state = window.HCMAttendance.dayState(
      user,
      today,
      records,
      leaves,
      today,
      calendar,
    );
    const record = state.record;
    const shift = window.HCMAttendance.getEffectiveShift(companyId, today);
    const balance = window.HCMLeaves.balance(user.id, now.getFullYear());
    if (!employeeView)
      employeeView = {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        selectedDate: today,
      };
    const context = record?.checkOut
      ? "Your working day is recorded. Everything is up to date."
      : record
        ? "You’re checked in. Your working time is updating live."
        : state.status === "holiday"
          ? `Enjoy your time off for ${dayInfo.name}.`
          : state.status === "non-working"
            ? "Today is a day off in your company calendar."
            : state.status === "leave"
              ? "You’re on approved leave today. Enjoy your time away."
              : "Here’s your workday at a glance. Check in when you’re ready.";
    const welcome = heading(
      `${M.greeting(now)}, ${user.name.split(" ")[0]}`,
      context,
      el(
        "div",
        { class: "employee-heading-meta" },
        el("span", {}, U.formatDate(today, { weekday: "long" })),
        badge(state.status),
      ),
    );
    welcome.id = "employee-home";
    main.replaceChildren(welcome);
    main.classList.add("employee-workspace-page");
    function facts(items, className = "day-facts") {
      return el(
        "dl",
        { class: className },
        items.map(([label, value]) =>
          el("div", {}, el("dt", {}, label), el("dd", {}, value)),
        ),
      );
    }
    const duration = el("span", {
      class: "duration-value",
      "aria-live": "off",
    });
    const completed = Boolean(record?.checkOut);
    const offDay =
      ["holiday", "non-working", "leave"].includes(state.status) && !record;
    const actionLabel = completed
      ? "Completed for Today"
      : offDay
        ? state.status === "holiday"
          ? "Company Holiday"
          : state.status === "leave"
            ? "On Approved Leave"
            : "Non-working Day"
        : record
          ? "Check Out"
          : "Check In";
    const actionButton = button(
      actionLabel,
      async (event) => {
        const target = event.currentTarget;
        target.disabled = true;
        target.setAttribute("aria-busy", "true");
        try {
          await window.HCMAttendance[record ? "checkOut" : "checkIn"]();
          toast(
            record
              ? "Checked out. Your attendance and working hours are saved."
              : "You’re checked in. Have a good working day.",
          );
          renderCurrent();
          main.focus({ preventScroll: true });
        } catch (error) {
          target.disabled = false;
          target.removeAttribute("aria-busy");
          toast(error.message, true);
        }
      },
      "primary",
      completed ? "check" : "clock",
    );
    actionButton.disabled =
      completed ||
      offDay ||
      (!record && !window.HCMAttendance.checkInWindow(shift, now).allowed);
    const workTitle = completed
      ? "All set for today."
      : record
        ? "Your day is in progress."
        : offDay
          ? "A little room to recharge."
          : "Ready for a good day?";
    const shiftMessage = el("p", {
      class: "workday-window",
      role: "status",
      "aria-live": "polite",
    });
    main.append(
      el(
        "section",
        { class: "workday-panel", "aria-label": "Today’s attendance" },
        el(
          "div",
          { class: "workday-top" },
          el(
            "div",
            {},
            el("p", { class: "eyebrow" }, "TODAY’S WORKING DAY"),
            el("h2", {}, workTitle),
          ),
          el("div", { class: "workday-action" }, actionButton),
        ),
        facts(
          [
            ["Check-in", U.formatTime(record?.checkIn)],
            ["Check-out", U.formatTime(record?.checkOut)],
            [
              record && !completed
                ? "Working time · Live"
                : "Total working time",
              duration,
            ],
            [
              record?.endTime ? "Recorded shift" : "Today’s shift",
              `${record?.endTime ? record.startTime : shift.startTime} — ${record?.endTime || shift.endTime}`,
            ],
          ],
          "workday-facts",
        ),
        shiftMessage,
        el(
          "p",
          { class: "workday-caption" },
          (record?.endTime ? record.customShift : shift.custom) &&
            el("span", { class: "badge badge-custom-shift" }, "Custom shift"),
          `${record?.endTime ? record.graceMinutes : shift.graceMinutes}-minute grace period${dayInfo.type !== "regular" ? ` · ${dayInfo.type === "working" ? "Extra working day" : "Holiday"}: ${dayInfo.name}` : ""}${user.department ? ` · ${user.department}` : ""}`,
        ),
      ),
    );
    function updateShiftControls() {
      const availability = window.HCMAttendance.checkInWindow(
        shift,
        new Date(),
      );
      actionButton.disabled =
        completed || offDay || (!record && !availability.allowed);
      const message = completed
        ? "Your attendance is complete for today."
        : record
          ? `${record.wasLate ? "You checked in after the grace period. " : ""}Check-out remains available after the shift ends.`
          : state.status === "leave"
            ? "You are on approved leave today."
            : availability.message;
      if (shiftMessage.textContent !== message)
        shiftMessage.textContent = message;
      if (!record && !offDay)
        welcome.querySelector(".page-description").textContent = message;
    }
    updateShiftControls();

    function applyForLeave() {
      let modal;
      const form = leaveForm(user, () => modal.close());
      form.classList.remove("card-body");
      const submitControl = form.querySelector('[type="submit"]');
      modal = dialog(
        "Apply for leave",
        "Choose the dates you need. Only company working days count toward your allowance.",
        form,
      );
      form.append(
        el(
          "div",
          { class: "form-actions" },
          button("Cancel", modal.close, "secondary"),
          submitControl,
        ),
      );
    }
    function showLeaveRequests() {
      dialog(
        "Your leave requests",
        "Your requests, decisions, and comments from your admin.",
        table(
          ["Type", "Dates", "Days", "Reason / comment", "Status"],
          leaveRows(window.HCMLeaves.list()),
          empty(
            "No requests yet",
            "Your leave requests will appear here.",
            "calendar",
          ),
        ),
      );
    }
    const pending = leaves.filter((leave) => leave.status === "pending").length;
    const leaveProgress = el("progress", {
      max: Math.max(1, balance.quota),
      value: balance.used,
      "aria-label": `${balance.used} of ${balance.quota} annual leave days used`,
    });
    const leavePanel = card(
      "Time away",
      `${now.getFullYear()} annual paid leave`,
      el(
        "div",
        { class: "card-body leave-balance-panel" },
        el(
          "div",
          { class: "leave-balance-value" },
          el("strong", {}, balance.remaining),
          el("span", {}, "days remaining"),
        ),
        leaveProgress,
        facts(
          [
            ["Annual quota", `${balance.quota} days`],
            ["Approved leave used", `${balance.used} days`],
            ["Pending requests", pending],
          ],
          "leave-balance-facts",
        ),
        button("Apply for Leave", applyForLeave, "primary", "plus"),
        el(
          "p",
          { class: "field-hint" },
          "Pending requests reserve allowance but do not reduce your approved balance.",
        ),
        el(
          "div",
          { class: "leave-recent" },
          el(
            "div",
            { class: "compact-section-title" },
            el("h3", {}, "Recent requests"),
            button("View requests", showLeaveRequests, "secondary"),
          ),
          leaves.length
            ? el(
                "ul",
                { class: "leave-request-list" },
                leaves
                  .slice(0, 3)
                  .map((leave) =>
                    el(
                      "li",
                      {},
                      el(
                        "div",
                        {},
                        el(
                          "span",
                          { class: "capitalize" },
                          `${leave.type} leave`,
                        ),
                        el(
                          "small",
                          { class: "muted" },
                          `${U.formatDate(leave.from, { year: undefined })} – ${U.formatDate(leave.to, { year: undefined })}`,
                        ),
                      ),
                      badge(leave.status),
                    ),
                  ),
              )
            : el("p", { class: "muted small" }, "No leave requests yet."),
        ),
      ),
    );

    const payrollContent = el("div", { class: "card-body payroll-preview" });
    leavePanel.id = "leave-balance";
    const payrollPanel = card(
      "Your pay",
      "A transparent monthly view.",
      payrollContent,
    );
    const insights = el("div", {
      class: "attendance-insights",
      "aria-label": "Monthly attendance insights",
    });
    const monthTitle = el("h3", {
      id: "attendance-month-title",
      "aria-live": "polite",
    });
    const grid = el("div", {
      class: "attendance-calendar-grid",
      role: "grid",
      "aria-labelledby": "attendance-month-title",
      "aria-colcount": "7",
    });
    const detail = el("section", {
      class: "calendar-day-detail",
      tabindex: "0",
      "aria-labelledby": "attendance-day-heading",
    });
    const emptyMonth = el("p", { class: "calendar-empty-note" });
    const recentContent = el("div");
    const recentPanel = card(
      "Recent attendance activity",
      "Saved check-ins for the selected month.",
      recentContent,
    );
    let monthModel;
    let hoursValue;
    let detailDuration;
    let selectedDay;

    function selectDate(date, focus = false) {
      employeeView.selectedDate = date;
      renderMonth(focus ? date : null);
    }
    function shiftMonth(delta) {
      const shifted = new Date(
        employeeView.year,
        employeeView.month - 1 + delta,
        1,
        12,
      );
      if (shifted.getFullYear() < 1900 || shifted.getFullYear() > 9998) return;
      employeeView.year = shifted.getFullYear();
      employeeView.month = shifted.getMonth() + 1;
      employeeView.selectedDate = U.localDate(shifted);
      renderMonth();
    }
    const previousMonth = iconButton("chevronLeft", "Previous month", () =>
      shiftMonth(-1),
    );
    const nextMonth = iconButton("chevronRight", "Next month", () =>
      shiftMonth(1),
    );
    const todayButton = button(
      "Today",
      () => {
        const current = new Date();
        employeeView = {
          year: current.getFullYear(),
          month: current.getMonth() + 1,
          selectedDate: U.localDate(current),
        };
        renderMonth();
      },
      "secondary",
    );
    const controls = el(
      "div",
      { class: "calendar-controls" },
      todayButton,
      previousMonth,
      nextMonth,
    );
    const legend = el(
      "div",
      { class: "calendar-legend", "aria-label": "Attendance legend" },
      [
        ["present", "Present"],
        ["late", "Late"],
        ["half-day", "Half day"],
        ["absent", "Absent"],
        ["leave", "Approved leave"],
        ["non-working", "Weekend"],
        ["scheduled", "Future date"],
        ["holiday", "Holiday"],
      ].map(([status, label]) =>
        el(
          "span",
          { class: `calendar-legend-item status-${status}` },
          el("i", { class: "calendar-dot", "aria-hidden": "true" }),
          label,
        ),
      ),
    );
    const calendarPanel = el(
      "section",
      {
        class: "card attendance-calendar-panel",
        "aria-label": "Attendance calendar",
      },
      el(
        "div",
        { class: "card-header" },
        el(
          "div",
          {},
          el("h2", {}, "Attendance calendar"),
          el("p", { class: "muted" }, "Your month, one working day at a time."),
        ),
      ),
      el("div", { class: "calendar-month-toolbar" }, monthTitle, controls),
      insights,
      el(
        "div",
        { class: "calendar-body" },
        el(
          "div",
          { class: "calendar-weekdays", "aria-hidden": "true" },
          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) =>
            el("span", {}, day),
          ),
        ),
        grid,
        legend,
        emptyMonth,
      ),
      detail,
    );
    calendarPanel.id = "attendance-calendar";
    main.append(
      el(
        "div",
        { class: "employee-dashboard-layout" },
        calendarPanel,
        el(
          "aside",
          { class: "employee-side-panels", "aria-label": "Leave and payroll" },
          leavePanel,
          payrollPanel,
        ),
      ),
      recentPanel,
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
      const cursor = U.parseDate(event.target.dataset.date);
      const weekday = (cursor.getDay() + 6) % 7;
      const delta = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
        Home: -weekday,
        End: 6 - weekday,
      }[event.key];
      cursor.setDate(cursor.getDate() + delta);
      if (cursor.getFullYear() < 1900 || cursor.getFullYear() > 9998) return;
      employeeView.year = cursor.getFullYear();
      employeeView.month = cursor.getMonth() + 1;
      selectDate(U.localDate(cursor), true);
    });
    function renderMonth(focusDate = null) {
      monthModel = M.getMonth(employeeView.year, employeeView.month);
      monthTitle.textContent = U.formatDate(monthModel.from, {
        day: undefined,
        month: "long",
      });
      previousMonth.disabled =
        employeeView.year === 1900 && employeeView.month === 1;
      nextMonth.disabled =
        employeeView.year === 9998 && employeeView.month === 12;
      if (
        !monthModel.days.some((day) => day.date === employeeView.selectedDate)
      )
        employeeView.selectedDate = monthModel.from;
      selectedDay = monthModel.days.find(
        (day) => day.date === employeeView.selectedDate,
      );
      hoursValue = el("strong");
      insights.replaceChildren(
        ...[
          ["Present days", monthModel.summary.presentDays],
          ["Late arrivals", monthModel.summary.lateDays],
          ["Half-days", monthModel.summary.halfDays],
          ["Absent days", monthModel.summary.absentDays],
          ["Working hours", hoursValue],
        ].map(([label, value]) =>
          el(
            "div",
            {
              class: "insight-stat",
              title:
                label === "Present days"
                  ? "Includes late arrivals and half days"
                  : undefined,
            },
            el("span", {}, label),
            value instanceof Node ? value : el("strong", {}, value),
          ),
        ),
      );
      const rows = [];
      for (let index = 0; index < monthModel.cells.length; index += 7) {
        rows.push(
          el(
            "div",
            { role: "row", class: "calendar-week" },
            monthModel.cells.slice(index, index + 7).map((day) => {
              if (!day)
                return el("div", {
                  role: "gridcell",
                  class: "calendar-blank",
                  "aria-hidden": "true",
                });
              const selected = day.date === employeeView.selectedDate;
              const dateButton = el(
                "button",
                {
                  type: "button",
                  class: `calendar-date status-${day.status}${day.isToday ? " is-today" : ""}${selected ? " is-selected" : ""}`,
                  "data-date": day.date,
                  tabindex: selected ? "0" : "-1",
                  "aria-label": `${U.formatDate(day.date, { weekday: "long" })}, ${day.label}${day.calendarType !== "regular" ? `, ${day.calendarName}` : ""}`,
                  "aria-current": day.isToday ? "date" : undefined,
                  "aria-pressed": String(selected),
                  onClick: () => selectDate(day.date, true),
                },
                el("span", { class: "calendar-day-number" }, day.number),
                el(
                  "span",
                  { class: "calendar-cell-status" },
                  el("i", { class: "calendar-dot", "aria-hidden": "true" }),
                  el("span", { class: "calendar-cell-label" }, day.label),
                ),
              );
              return el(
                "div",
                { role: "gridcell", "aria-selected": String(selected) },
                dateButton,
              );
            }),
          ),
        );
      }
      grid.setAttribute("aria-rowcount", String(rows.length));
      grid.replaceChildren(...rows);
      emptyMonth.hidden = monthModel.hasAttendance;
      emptyMonth.textContent =
        "No check-ins in this month yet. The calendar shows your working days, approved leave, and company holidays.";
      detailDuration = el("span");
      detail.replaceChildren(
        el(
          "div",
          { class: "calendar-detail-heading" },
          el(
            "h3",
            { id: "attendance-day-heading" },
            U.formatDate(selectedDay.date, { weekday: "long" }),
          ),
          badge(selectedDay.status),
        ),
        facts([
          ["Check-in", U.formatTime(selectedDay.record?.checkIn)],
          ["Check-out", U.formatTime(selectedDay.record?.checkOut)],
          ["Working time", detailDuration],
        ]),
      );
      if (selectedDay.leave)
        detail.append(
          el(
            "div",
            { class: "calendar-leave-detail" },
            el(
              "strong",
              { class: "capitalize" },
              `${selectedDay.leave.type} leave · Approved`,
            ),
            el("p", {}, selectedDay.leave.reason),
            selectedDay.leave.comment &&
              el(
                "p",
                { class: "muted" },
                `Admin comment: ${selectedDay.leave.comment}`,
              ),
          ),
        );
      else if (!selectedDay.record)
        detail.append(
          el(
            "p",
            { class: "muted small" },
            selectedDay.status === "absent"
              ? "No check-in was recorded on this completed working day."
              : selectedDay.status === "not-employed"
                ? "This date is before your recorded joining date."
                : selectedDay.status === "holiday"
                  ? selectedDay.calendarName
                  : selectedDay.status === "non-working"
                    ? "A regular weekend day. No attendance is required."
                    : selectedDay.future
                      ? "This date is upcoming. It has not been counted as an absence."
                      : "You have not checked in today.",
          ),
        );
      if (selectedDay.calendarType === "working")
        detail.append(
          el(
            "p",
            { class: "field-hint" },
            `Extra working day: ${selectedDay.calendarName}`,
          ),
        );
      const savedShift = selectedDay.record?.endTime
        ? selectedDay.record
        : selectedDay.shift;
      detail.append(
        el(
          "p",
          { class: "field-hint" },
          `${selectedDay.record?.endTime ? "Recorded shift" : "Current schedule"}: ${savedShift.startTime} — ${savedShift.endTime}${selectedDay.record?.endTime ? (selectedDay.record.customShift ? " · Custom shift" : "") : selectedDay.shift.custom ? " · Custom shift" : ""}${selectedDay.shift.isWorkingDay ? "" : " · Non-working day; check-in is closed."}`,
        ),
      );
      const slip = window.HCMPayroll.calculatePayslip(
        user.id,
        employeeView.year,
        employeeView.month,
      );
      const estimated = slip.provisional || monthModel.openRecords > 0;
      payrollContent.replaceChildren(
        el(
          "div",
          { class: "payroll-period" },
          el("strong", {}, monthTitle.textContent),
          el(
            "span",
            { class: "badge" },
            !slip.eligible
              ? "Unavailable"
              : estimated
                ? "Estimate"
                : "Calculated",
          ),
        ),
        facts(
          [
            ["Monthly base salary", U.formatCurrency(slip.salary)],
            [
              estimated ? "Estimated deductions" : "Deductions",
              slip.eligible ? U.formatCurrency(slip.deduction) : "—",
            ],
          ],
          "payroll-preview-facts",
        ),
        el(
          "div",
          { class: "payroll-preview-net" },
          el("span", {}, estimated ? "Estimated net salary" : "Net salary"),
          el(
            "strong",
            {},
            slip.eligible ? U.formatCurrency(slip.netSalary) : "—",
          ),
        ),
        el(
          "p",
          { class: "field-hint" },
          !slip.eligible
            ? "Payroll is available for started months on or after you joined."
            : estimated
              ? "Based on recorded attendance and completed working days. The full monthly base is shown; this is not pay earned to date."
              : "Calculated from the completed month’s saved records.",
        ),
        link(
          slip.eligible ? "View Payslip" : "View current payslip",
          slip.eligible
            ? `payslip.html?month=${monthModel.from.slice(0, 7)}`
            : "payslip.html",
        ),
      );
      const recent = monthModel.days
        .filter((day) => day.record)
        .reverse()
        .slice(0, 5);
      recentContent.replaceChildren(
        table(
          ["Date", "Check-in", "Check-out", "Working time", "Status"],
          recent.map((day) => [
            U.formatDate(day.date),
            U.formatTime(day.record.checkIn),
            U.formatTime(day.record.checkOut),
            day.record.checkOut
              ? M.formatDuration(
                  M.elapsedSeconds(day.record.checkIn, day.record.checkOut),
                )
              : day.isToday
                ? "In progress"
                : "Open check-in",
            badge(day.status),
          ]),
          empty(
            "No attendance activity yet",
            "Your saved check-ins for this month will appear here.",
            "clock",
          ),
        ),
      );
      updateDurations();
      if (focusDate)
        grid
          .querySelector(`[data-date="${focusDate}"]`)
          ?.focus({ preventScroll: true });
    }
    function updateDurations() {
      const current = new Date();
      duration.textContent = record
        ? M.formatDuration(
            M.elapsedSeconds(record.checkIn, record.checkOut, current),
          )
        : "—";
      const totalMinutes = Math.floor(
        M.totalWorkedHours(monthModel, current) * 60,
      );
      hoursValue.textContent = `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
      detailDuration.textContent = selectedDay.record
        ? selectedDay.record.checkOut || selectedDay.isToday
          ? M.formatDuration(
              M.elapsedSeconds(
                selectedDay.record.checkIn,
                selectedDay.record.checkOut,
                current,
              ),
            )
          : "Open check-in"
        : "—";
    }
    renderMonth();
    if (!completed)
      employeeTimer = window.setInterval(() => {
        if (
          A.getCurrentUser()?.id !== user.id ||
          S.getActiveCompanyId() !== companyId
        ) {
          window.clearInterval(employeeTimer);
          return;
        }
        if (U.localDate() !== today) {
          window.location.reload();
          return;
        }
        updateShiftControls();
        if (record && !record.checkOut) updateDurations();
      }, 1000);
  }
  function renderPayslip() {
    window.HCMPayrollWorkspace.render({
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
    });
  }
  function initHelper() {
    const panel = el("section", {
      class: "helper-panel",
      id: "helper-panel",
      hidden: true,
      "aria-label": "Smart Helper",
    });
    const messages = el("div", {
      class: "helper-messages",
      role: "log",
      "aria-live": "polite",
      "aria-relevant": "additions text",
    });
    messages.append(
      el(
        "p",
        { class: "chat-message chat-assistant" },
        "A little help, right here. Ask about your attendance, leave, salary, or workspace.",
      ),
    );
    const input = el("input", {
      id: "helper-question",
      name: "question",
      placeholder: "Ask an HR question…",
      required: true,
      maxlength: 300,
      autocomplete: "off",
    });
    const send = el(
      "button",
      { class: "icon-button", type: "submit", "aria-label": "Send question" },
      icon("arrow"),
    );
    const form = el(
      "form",
      { class: "helper-form" },
      el(
        "label",
        { class: "sr-only", for: "helper-question" },
        "Your HR question",
      ),
      input,
      send,
    );
    const launcher = button(
      "Smart Helper",
      () => open(true),
      "primary",
      "chat",
    );
    launcher.classList.add("helper-launcher");
    launcher.setAttribute("aria-controls", "helper-panel");
    launcher.setAttribute("aria-expanded", "false");
    function open(value) {
      panel.hidden = !value;
      launcher.hidden = value;
      launcher.setAttribute("aria-expanded", String(value));
      if (value) input.focus();
      else launcher.focus();
    }
    panel.append(
      el(
        "div",
        { class: "helper-header" },
        el(
          "div",
          {},
          el("strong", {}, "Smart Helper"),
          el("span", {}, "A simpler answer to everyday HR"),
        ),
        iconButton("close", "Close Smart Helper", () => open(false)),
      ),
      messages,
      form,
    );
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") open(false);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      messages.append(el("p", { class: "chat-message chat-user" }, text));
      input.value = "";
      try {
        messages.append(
          el(
            "p",
            { class: "chat-message chat-assistant" },
            window.HCMHelper.answer(text),
          ),
        );
      } catch (error) {
        messages.append(
          el("p", { class: "chat-message chat-assistant" }, error.message),
        );
      }
      while (messages.children.length > 40) messages.firstElementChild.remove();
      messages.scrollTop = messages.scrollHeight;
    });
    document.body.append(launcher, panel);
  }
  try {
    if (page === "index.html") initAuth();
    else if (
      document.documentElement.dataset.auth === "ready" &&
      A.guardPage(document.documentElement.dataset.roles.split(","))
    ) {
      initShell(A.getCurrentUser());
      const renders = {
        "admin.html": renderAdmin,
        "employees.html": renderEmployees,
        "settings.html": renderSettings,
        "employee.html": renderEmployee,
        "leaves.html": renderLeaves,
        "payslip.html": renderPayslip,
      };
      renderCurrent = renders[page];
      renderCurrent();
      initHelper();
      if (S.getIssues().length)
        toast(
          "Some browser data is malformed. Readable records are shown, but changes are blocked to preserve existing data.",
          true,
        );
    }
  } catch (error) {
    const main = document.querySelector("main");
    main.querySelector(".loading-state")?.remove();
    main.append(
      el(
        "div",
        { class: "notice notice-danger", role: "alert" },
        `Unable to load this workspace: ${error.message}`,
      ),
    );
  }
  function recheck() {
    if (page === "index.html") {
      window.location.reload();
      return;
    }
    document.documentElement.dataset.auth = "pending";
    if (A.guardPage(document.documentElement.dataset.roles.split(",")))
      window.location.reload();
  }
  window.addEventListener("storage", (event) => {
    if (event.key === null || Object.values(S.keys).includes(event.key))
      recheck();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) recheck();
  });
  let date = U.localDate();
  window.setInterval(() => {
    if (U.localDate() !== date) {
      date = U.localDate();
      recheck();
    }
  }, 30000);
})();
