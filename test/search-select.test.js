import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSearchSelect,
  filterSearchOptions,
  normalizeSearchText,
} from "../src/search-select.js";

const OPTIONS = [
  {
    value: "America/New_York",
    label: "America / New York",
    meta: "UTC-05:00",
    searchText: "America/New_York",
    dir: "ltr",
  },
  {
    value: "Asia/Tokyo",
    label: "Asia / Tokyo",
    meta: "UTC+09:00",
    dir: "ltr",
  },
  {
    value: "Europe/Paris",
    label: "Europe / Páris",
    meta: "UTC+01:00",
    dir: "ltr",
  },
];
const controls = [];

afterEach(() => {
  controls.splice(0).forEach((control) => control.destroy());
});

function build(overrides = {}) {
  const control = createSearchSelect({
    id: "zone",
    options: OPTIONS,
    currentValue: "Asia/Tokyo",
    placeholder: "Search",
    noResults: "Nothing found",
    ...overrides,
  });
  document.body.append(control.element);
  controls.push(control);
  return control;
}

function keydown(element, key) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

function query(control, value) {
  control.input.value = value;
  control.input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("search normalization", () => {
  it("folds case, diacritics, underscores, and whitespace", () => {
    expect(normalizeSearchText("  PÁRIS_New   York ")).toBe("paris new york");
    expect(normalizeSearchText("Indiana")).toBe("indiana");
  });

  it("matches every query term across option metadata", () => {
    expect(filterSearchOptions(OPTIONS, "ASIA utc+09")).toEqual([OPTIONS[1]]);
    expect(filterSearchOptions(OPTIONS, "paris")).toEqual([OPTIONS[2]]);
    expect(filterSearchOptions(OPTIONS, "America/New_York")).toEqual([
      OPTIONS[0],
    ]);
  });
});

describe("search select", () => {
  it("wires the editable combobox and listbox ARIA pattern", () => {
    const control = build();
    const input = control.input;
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe("zone-listbox");
    expect(control.value).toBe("Asia/Tokyo");
    expect(input.value).toBe("Asia / Tokyo · UTC+09:00");

    keydown(input, "ArrowDown");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("#zone-listbox").getAttribute("role")).toBe(
      "listbox",
    );
    expect(input.getAttribute("aria-activedescendant")).toBe("zone-option-1");
  });

  it("supports arrows, Home, End, and Enter without submitting", () => {
    const onSelect = vi.fn();
    const control = build({ onSelect });
    const input = control.input;

    keydown(input, "ArrowDown");
    keydown(input, "End");
    expect(input.getAttribute("aria-activedescendant")).toBe("zone-option-2");
    const enter = keydown(input, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(control.value).toBe("Europe/Paris");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("Europe/Paris");

    keydown(input, "ArrowDown");
    keydown(input, "Home");
    keydown(input, "Enter");
    expect(control.value).toBe("America/New_York");
  });

  it("opens at the final option with Arrow Up", () => {
    const control = build();
    keydown(control.input, "ArrowUp");
    expect(control.input.getAttribute("aria-expanded")).toBe("true");
    expect(control.input.getAttribute("aria-activedescendant")).toBe(
      "zone-option-2",
    );
  });

  it("leaves closed Enter to the containing form", () => {
    const control = build();
    expect(keydown(control.input, "Enter").defaultPrevented).toBe(false);
  });

  it("does not treat IME confirmation as option selection", () => {
    const onSelect = vi.fn();
    const control = build({ onSelect });
    query(control, "paris");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    control.input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(control.value).toBe("Asia/Tokyo");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects the displayed label on focus so typing replaces it", () => {
    const control = build();
    control.input.focus();
    expect(control.input.selectionStart).toBe(0);
    expect(control.input.selectionEnd).toBe(control.input.value.length);
  });

  it("filters as the user types and keeps the selected value stable", () => {
    const control = build();
    query(control, "new york");
    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(["America / New YorkUTC-05:00"]);
    expect(control.value).toBe("Asia/Tokyo");
  });

  it("shows an accessible empty state for no matches", () => {
    const control = build();
    query(control, "not a real zone");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
    const empty = document.querySelector(".search-select-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.textContent).toBe("Nothing found");
  });

  it("shows the empty state when no options are available", () => {
    const control = build({ options: [], currentValue: "" });
    keydown(control.input, "ArrowDown");
    expect(control.input.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".search-select-empty").hidden).toBe(false);
  });

  it("restores invalid free text on Escape, Tab, and blur", async () => {
    const control = build();
    for (const key of ["Escape", "Tab"]) {
      query(control, "invalid");
      keydown(control.input, key);
      expect(control.input.value).toBe("Asia / Tokyo · UTC+09:00");
      expect(control.value).toBe("Asia/Tokyo");
    }

    query(control, "still invalid");
    control.input.focus();
    control.input.blur();
    await Promise.resolve();
    expect(control.input.value).toBe("Asia / Tokyo · UTC+09:00");
  });

  it("light-dismisses and restores the selected label", () => {
    const control = build();
    query(control, "invalid");
    document.body.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(control.input.getAttribute("aria-expanded")).toBe("false");
    expect(control.input.value).toBe("Asia / Tokyo · UTC+09:00");
  });

  it("selects a pointer or touch result exactly once", () => {
    const onSelect = vi.fn();
    const control = build({ onSelect });
    query(control, "new york");
    document.querySelector('[role="option"]').click();
    expect(control.value).toBe("America/New_York");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("moves the pointer-active state without rebuilding option nodes", () => {
    const control = build();
    keydown(control.input, "ArrowDown");
    const first = document.querySelector("#zone-option-0");
    const third = document.querySelector("#zone-option-2");
    third.dispatchEvent(new Event("pointermove", { bubbles: true }));
    expect(document.querySelector("#zone-option-0")).toBe(first);
    expect(third.classList.contains("is-active")).toBe(true);
    expect(control.input.getAttribute("aria-activedescendant")).toBe(
      "zone-option-2",
    );
  });

  it("does not open when disabled", () => {
    const control = build({ disabled: true });
    expect(control.input.disabled).toBe(true);
    keydown(control.input, "ArrowDown");
    expect(control.input.getAttribute("aria-expanded")).toBe("false");
  });

  it("removes its portalled popup and open listeners on destroy", () => {
    const control = build();
    const abort = vi.spyOn(AbortController.prototype, "abort");
    keydown(control.input, "ArrowDown");
    control.destroy();
    expect(abort).toHaveBeenCalledOnce();
    expect(document.querySelector(".search-select-popup")).toBeNull();
  });
});
