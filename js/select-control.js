(function () {
  "use strict";
  let active = null;
  let sequence = 0;
  document.addEventListener("pointerdown", (event) => {
    if (active && !active.root.contains(event.target)) active.close();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (active && !active.popup.contains(event.target)) active.close();
    },
    true,
  );
  window.addEventListener("resize", () => active?.close());
  function create(ui, label, name, options, value = "", config = {}) {
    const { el, icon } = ui;
    const id = `field-${name}`,
      uid = `huma-select-${++sequence}`;
    const input = el(
      "select",
      {
        id: `${id}-native`,
        class: "select-native",
        name,
        tabindex: "-1",
        "aria-hidden": "true",
        required: Boolean(config.required),
      },
      options.map(([key, text]) =>
        el("option", { value: key, selected: key === value }, text),
      ),
    );
    const text = el("span", { class: "select-value", id: `${uid}-value` });
    const trigger = el(
      "button",
      {
        id,
        type: "button",
        role: "combobox",
        class: "select-trigger",
        "aria-label": label,
        "aria-describedby": `${uid}-value`,
        "aria-haspopup": "listbox",
        "aria-controls": uid,
        "aria-expanded": "false",
        "aria-required": String(Boolean(config.required)),
      },
      text,
      icon("chevrons"),
    );
    const popup = el("div", {
      id: uid,
      class: "select-popup",
      role: "listbox",
      "aria-label": label,
    });
    const nativePopover = typeof popup.showPopover === "function";
    if (nativePopover) popup.setAttribute("popover", "auto");
    else popup.hidden = true;
    const error = el("p", {
      class: "select-error",
      id: `${uid}-error`,
      role: "alert",
      hidden: true,
    });
    const root = el(
      "div",
      { class: "field select-field" },
      el("label", { for: id }, label),
      el("div", { class: "select-control" }, input, trigger, popup),
      error,
    );
    let opened = false,
      cursor = 0,
      buffer = "",
      typedAt = 0;
    const available = () =>
      [...input.options].filter((option) => !option.disabled);
    function sync() {
      const option = input.selectedOptions[0];
      text.textContent = option?.textContent || "Select an option";
      trigger.disabled = input.disabled;
      trigger.classList.toggle(
        "is-placeholder",
        !input.value && config.required,
      );
      trigger.title = option?.textContent || "";
      if (input.validity.valid) {
        error.hidden = true;
        trigger.removeAttribute("aria-invalid");
        trigger.removeAttribute("aria-errormessage");
      }
    }
    function close() {
      opened = false;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      if (nativePopover) {
        if (popup.matches(":popover-open")) popup.hidePopover();
      } else popup.hidden = true;
      if (active?.root === root) active = null;
    }
    function highlight() {
      const nodes = [...popup.querySelectorAll('[role="option"]')];
      nodes.forEach((node, index) =>
        node.classList.toggle("is-active", index === cursor),
      );
      if (nodes[cursor]) {
        trigger.setAttribute("aria-activedescendant", nodes[cursor].id);
        nodes[cursor].scrollIntoView({ block: "nearest" });
      }
    }
    function choose(index, focus = true) {
      const option = available()[index];
      if (!option) return;
      const changed = input.value !== option.value;
      input.value = option.value;
      close();
      sync();
      if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
      if (changed) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    function open() {
      if (trigger.disabled || !available().length) return;
      if (active) active.close();
      const list = available();
      cursor = Math.max(
        0,
        list.findIndex((option) => option.value === input.value),
      );
      popup.replaceChildren(
        ...list.map((option, index) =>
          el(
            "div",
            {
              id: `${uid}-option-${index}`,
              class: "select-option",
              role: "option",
              "aria-selected": String(option.value === input.value),
              onPointermove: () => {
                cursor = index;
                highlight();
              },
              onClick: () => choose(index),
              title: option.textContent,
            },
            el("span", {}, option.textContent),
            option.value === input.value && icon("check"),
          ),
        ),
      );
      const rect = trigger.getBoundingClientRect(),
        width = Math.min(window.innerWidth - 24, Math.max(240, rect.width));
      const expected = Math.min(list.length * 42 + 12, 272);
      const below = window.innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const useAbove = below < expected && above > below;
      const height = Math.max(40, Math.min(expected, useAbove ? above : below));
      Object.assign(popup.style, {
        width: `${width}px`,
        maxHeight: `${height}px`,
        left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
        top: `${useAbove ? Math.max(12, rect.top - height - 6) : rect.bottom + 6}px`,
      });
      opened = true;
      active = { root, popup, close };
      trigger.setAttribute("aria-expanded", "true");
      if (nativePopover) popup.showPopover();
      else popup.hidden = false;
      highlight();
    }
    trigger.addEventListener("click", () => (opened ? close() : open()));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && opened) {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "Tab") {
        if (opened) choose(cursor, false);
        return;
      }
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (opened) choose(cursor);
        else open();
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (!opened) {
          open();
          if (event.key === "Home") cursor = 0;
          else if (event.key === "End") cursor = available().length - 1;
        } else
          cursor =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? available().length - 1
                : (cursor +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    available().length) %
                  available().length;
        highlight();
        return;
      }
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const now = Date.now();
        buffer = now - typedAt > 700 ? event.key : buffer + event.key;
        typedAt = now;
        if (!opened) open();
        const match = available().findIndex((option) =>
          option.textContent
            .toLocaleLowerCase()
            .startsWith(buffer.toLocaleLowerCase()),
        );
        if (match >= 0) {
          cursor = match;
          highlight();
        }
      }
    });
    trigger.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) close();
    });
    popup.addEventListener("pointerdown", (event) => event.preventDefault());
    popup.addEventListener("toggle", (event) => {
      if (event.newState === "closed") {
        opened = false;
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-activedescendant");
        if (active?.root === root) active = null;
      }
    });
    input.addEventListener("change", sync);
    input.addEventListener("invalid", (event) => {
      event.preventDefault();
      error.textContent = `Choose ${label.toLowerCase()}.`;
      error.hidden = false;
      trigger.setAttribute("aria-invalid", "true");
      trigger.setAttribute("aria-errormessage", error.id);
      trigger.focus();
    });
    new MutationObserver(sync).observe(input, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    root.refreshSelect = sync;
    sync();
    return root;
  }
  window.HCMSelect = Object.freeze({ create });
})();
