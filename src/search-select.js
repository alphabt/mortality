import { el } from "./dom.js";

const normalizedOptionText = new WeakMap();

/** Normalize text for forgiving, case- and diacritic-insensitive matching. */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function optionSearchText(option) {
  const source = [
    option.value,
    option.label,
    option.meta,
    option.displayText,
    option.searchText,
  ]
    .filter(Boolean)
    .join(" ");
  const cached = normalizedOptionText.get(option);
  if (cached?.source === source) return cached.value;
  const value = normalizeSearchText(source);
  normalizedOptionText.set(option, { source, value });
  return value;
}

/** Filter option records while preserving their source order. */
export function filterSearchOptions(options, query) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) return [...options];
  return options.filter((option) => {
    const haystack = optionSearchText(option);
    return terms.every((term) => haystack.includes(term));
  });
}

function optionDisplayText(option) {
  if (!option) return "";
  return (
    option.displayText ??
    [option.label, option.meta].filter(Boolean).join(" \u00b7 ")
  );
}

/**
 * Build an editable WAI-ARIA combobox backed by a top-layer/fixed listbox.
 * The selected value is held separately from the visible query text.
 */
export function createSearchSelect({
  id,
  options,
  currentValue,
  placeholder,
  noResults,
  onSelect = () => {},
  disabled = false,
  inputDir,
}) {
  const records = options.filter(
    (option) =>
      option &&
      typeof option.value === "string" &&
      typeof option.label === "string",
  );
  const selected =
    records.find((option) => option.value === currentValue) ??
    records[0] ??
    null;
  const recordIndexes = new Map(
    records.map((option, index) => [option, index]),
  );
  let selectedValue = selected?.value ?? "";
  let filtered = records;
  let activeIndex = -1;
  let isOpen = false;
  let globalListeners = null;

  const listboxId = `${id}-listbox`;
  const input = el("input", {
    id,
    class: "search-select-input",
    type: "text",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-controls": listboxId,
    "aria-expanded": "false",
    autocomplete: "off",
    autocapitalize: "none",
    spellcheck: "false",
    placeholder,
    disabled,
    dir: inputDir,
  });
  const root = el("div", { class: "search-select" }, input);
  const listbox = el("div", {
    id: listboxId,
    class: "search-select-listbox",
    role: "listbox",
  });
  const empty = el(
    "p",
    {
      class: "search-select-empty",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    },
    noResults,
  );
  const popup = el(
    "div",
    {
      class: "search-select-popup",
      popover: "manual",
      hidden: true,
      dir: document.documentElement.dir || "ltr",
    },
    [listbox, empty],
  );
  document.body.append(popup);

  function selectedRecord() {
    return records.find((option) => option.value === selectedValue) ?? null;
  }

  function restoreSelectedLabel() {
    const record = selectedRecord();
    input.value = record ? optionDisplayText(record) : "";
  }

  function optionId(option) {
    return `${id}-option-${recordIndexes.get(option)}`;
  }

  function scrollActiveIntoView() {
    if (activeIndex < 0 || !filtered[activeIndex]) return;
    document
      .getElementById(optionId(filtered[activeIndex]))
      ?.scrollIntoView?.({ block: "nearest" });
  }

  function renderOptions() {
    listbox.replaceChildren(
      ...filtered.map((option, index) => {
        const attrs = {
          id: optionId(option),
          class: "search-select-option",
          role: "option",
          "aria-selected": String(option.value === selectedValue),
          "aria-label": optionDisplayText(option),
          "data-index": index,
          title: optionDisplayText(option),
        };
        if (option.dir) attrs.dir = option.dir;
        const children = [
          el("span", { class: "search-select-option-label" }, option.label),
        ];
        if (option.meta) {
          children.push(
            el("span", { class: "search-select-option-meta" }, option.meta),
          );
        }
        const node = el("div", attrs, children);
        node.classList.toggle("is-active", index === activeIndex);
        return node;
      }),
    );
    empty.hidden = filtered.length > 0;
    if (activeIndex >= 0 && filtered[activeIndex]) {
      input.setAttribute(
        "aria-activedescendant",
        optionId(filtered[activeIndex]),
      );
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function positionPopup() {
    const rect = input.getBoundingClientRect();
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight =
      document.documentElement.clientHeight || window.innerHeight;
    const gap = 4;
    const edge = 8;
    const width = Math.max(0, Math.min(rect.width, viewportWidth - edge * 2));
    const below = viewportHeight - rect.bottom - gap - edge;
    const above = rect.top - gap - edge;
    const useBelow = below >= 176 || below >= above;
    const available = Math.max(96, useBelow ? below : above);
    const left = Math.min(
      Math.max(edge, rect.left),
      Math.max(edge, viewportWidth - width - edge),
    );

    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${Math.min(320, available)}px`;
    popup.style.left = `${left}px`;
    popup.style.top = useBelow
      ? `${rect.bottom + gap}px`
      : `${Math.max(edge, rect.top - gap - Math.min(320, available))}px`;
  }

  function close({ restore = true } = {}) {
    if (!isOpen) {
      if (restore) restoreSelectedLabel();
      return;
    }
    isOpen = false;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    globalListeners?.abort();
    globalListeners = null;
    if (typeof popup.hidePopover === "function") {
      try {
        popup.hidePopover();
      } catch {
        // The fixed-position fallback below is already sufficient.
      }
    }
    popup.hidden = true;
    if (restore) restoreSelectedLabel();
  }

  function open(nextOptions = records, preferredIndex = null) {
    if (disabled) return;
    filtered = nextOptions;
    const selectedIndex = filtered.findIndex(
      (option) => option.value === selectedValue,
    );
    activeIndex =
      preferredIndex == null
        ? selectedIndex >= 0
          ? selectedIndex
          : filtered.length
            ? 0
            : -1
        : preferredIndex;
    renderOptions();
    if (!isOpen) {
      isOpen = true;
      input.setAttribute("aria-expanded", "true");
      popup.hidden = false;
      if (typeof popup.showPopover === "function") {
        try {
          popup.showPopover();
        } catch {
          // Older engines use the same fixed-position element without top layer.
        }
      }
      globalListeners = new AbortController();
      const { signal } = globalListeners;
      document.addEventListener(
        "pointerdown",
        (event) => {
          if (!root.contains(event.target) && !popup.contains(event.target)) {
            close();
          }
        },
        { capture: true, signal },
      );
      window.addEventListener("resize", positionPopup, { signal });
      window.addEventListener("scroll", positionPopup, { signal });
    }
    positionPopup();
    scrollActiveIntoView();
  }

  function moveActive(index) {
    if (!filtered.length) return;
    const nextIndex = Math.max(0, Math.min(index, filtered.length - 1));
    if (nextIndex === activeIndex) return;
    if (activeIndex >= 0 && filtered[activeIndex]) {
      document
        .getElementById(optionId(filtered[activeIndex]))
        ?.classList.remove("is-active");
    }
    activeIndex = nextIndex;
    document
      .getElementById(optionId(filtered[activeIndex]))
      ?.classList.add("is-active");
    input.setAttribute(
      "aria-activedescendant",
      optionId(filtered[activeIndex]),
    );
    scrollActiveIntoView();
  }

  function choose(option) {
    const changed = option.value !== selectedValue;
    selectedValue = option.value;
    close();
    input.focus();
    if (changed) onSelect(option.value);
  }

  input.addEventListener("input", () => {
    const matches = filterSearchOptions(records, input.value);
    open(matches, matches.length ? 0 : -1);
  });
  input.addEventListener("pointerdown", () => {
    const selectingLabel = input.value === optionDisplayText(selectedRecord());
    if (!isOpen) open();
    if (selectingLabel) requestAnimationFrame(() => input.select());
  });
  input.addEventListener("focus", () => {
    if (input.value === optionDisplayText(selectedRecord())) input.select();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) open();
        else moveActive(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) open(records, records.length - 1);
        else moveActive(activeIndex - 1);
        break;
      case "Home":
        if (isOpen) {
          event.preventDefault();
          moveActive(0);
        }
        break;
      case "End":
        if (isOpen) {
          event.preventDefault();
          moveActive(filtered.length - 1);
        }
        break;
      case "Enter":
        if (isOpen) {
          event.preventDefault();
          const option = filtered[activeIndex];
          if (option) choose(option);
          else close();
        }
        break;
      case "Escape":
        if (isOpen) {
          event.preventDefault();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  });
  input.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (
        !root.contains(document.activeElement) &&
        !popup.contains(document.activeElement)
      ) {
        close();
      }
    });
  });
  listbox.addEventListener("pointermove", (event) => {
    const option = event.target.closest?.('[role="option"]');
    if (option) moveActive(Number(option.dataset.index));
  });
  listbox.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
  });
  listbox.addEventListener("click", (event) => {
    const option = event.target.closest?.('[role="option"]');
    if (option) choose(filtered[Number(option.dataset.index)]);
  });

  restoreSelectedLabel();

  return {
    element: root,
    input,
    get value() {
      return selectedValue;
    },
    restore: restoreSelectedLabel,
    close,
    destroy() {
      close();
      popup.remove();
    },
  };
}
