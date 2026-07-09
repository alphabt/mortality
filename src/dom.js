// Tiny DOM builder shared by the render code. Building nodes explicitly and
// writing text via textContent keeps every user- or preset-derived value out of
// an HTML parser: nothing is ever assigned to innerHTML, so no string can be
// reinterpreted as markup (and Firefox's reviewer stops flagging unsafe
// innerHTML assignments).

/**
 * Create an element.
 * @param {string} tag  Element name.
 * @param {Object<string, string|number|boolean|null|undefined>} [attrs]
 *   Attributes to set. `class` maps to className; `true` adds a bare boolean
 *   attribute; null/undefined/false are skipped. Everything else is set with
 *   setAttribute (stringified), never parsed as HTML.
 * @param {(Node|string)|(Node|string)[]} [children]  Text and/or nodes to
 *   append. Strings become text nodes, so they can't inject markup.
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (name === "class") node.className = value;
    else if (value === true) node.setAttribute(name, "");
    else node.setAttribute(name, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}
