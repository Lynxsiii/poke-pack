/**
 * The friends list and the radio live in the top bar (DESIGN.md: nothing
 * floats over the page). Each one is an icon in the header's .header-tools
 * whose panel drops down under it. On a phone the header has no room, so the
 * icon is hidden and a [data-dock="<name>"] button in the tab bar's More sheet
 * opens the same panel, which then rises from the tab bar (css/theme.css).
 *
 * The panels are popovers now rather than docks that stay on screen, so a
 * press anywhere else or Escape closes them.
 */

/** Put a dock's root element into the header (or the page, if the header slot is missing). */
export function mountDock(root) {
  const slot = document.querySelector(".header-tools") || document.body;
  // Friends sits left of the radio whichever module mounts first, so the tab
  // order matches the order on screen.
  slot.insertBefore(root, root.id === "friends" ? slot.querySelector("#radio") : null);
}

/**
 * Wire the shared behaviour: the More-sheet buttons, closing on a press
 * outside, Escape, and where focus goes.
 * opts: { name, peek, isOpen(), setOpen(open), focusOnOpen: element focused when a More button opens it }
 */
export function bindDock(root, { name, peek, isOpen, setOpen, focusOnOpen }) {
  let opener = null;
  const openers = () => document.querySelectorAll(`[data-dock="${name}"]`);

  openers().forEach((btn) => {
    btn.addEventListener("click", () => {
      opener = btn;
      btn.closest("details")?.removeAttribute("open");
      setOpen(true);
      focusOnOpen?.focus({ preventScroll: true });
    });
  });

  // A press outside closes it; the icon and the More buttons toggle it themselves.
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    const target = e.target;
    if (!(target instanceof Node) || root.contains(target)) return;
    if (target instanceof Element && target.closest(`[data-dock="${name}"]`)) return;
    setOpen(false);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    e.stopPropagation();
    setOpen(false);
    // Back to whatever opened it: the header icon, or on a phone the More tab.
    if (peek.offsetParent) peek.focus();
    else opener?.closest("details")?.querySelector("summary")?.focus();
  });

  // Following a link inside the panel leaves the page it was opened over.
  root.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("a[href]")) setOpen(false);
  });
}
