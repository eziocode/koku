"use client";

/**
 * Getting koku's styles into the Picture-in-Picture window.
 *
 * A PiP window starts as an empty document that inherits no stylesheets at all,
 * so without this it renders as unstyled HTML in Times New Roman.
 *
 * Nodes are cloned rather than using `adoptedStyleSheets`. Adoption looks
 * appealing — synchronous, no network — but it cannot carry `@import` (and
 * `globals.css` opens with `@import "tailwindcss"`), it re-serialises the entire
 * Tailwind build on every open, it throws `SecurityError` on any cross-origin
 * sheet, and it does not participate in HMR. The bootstrap sheet below already
 * solves the only real problem adoption would have solved, which is the flash.
 *
 * Note: this must never assign `innerHTML` — `scripts/security-audit.mjs` fails
 * the build on it. Everything here goes through createElement/textContent.
 */

const LOADING_ATTRIBUTE = "data-koku-pip-loading";

/** How long to wait for cloned <link> sheets before revealing content anyway. */
const STYLE_BUDGET_MS = 600;

export interface StyleTransplant {
  /** Resolves once cloned sheets have loaded, or the budget elapses. */
  ready: Promise<void>;
  dispose: () => void;
}

/**
 * Paints the correct background immediately and hides content until the real
 * stylesheets land, so the window never flashes unstyled.
 *
 * Values are the literal `@theme` / `.dark` tokens from `globals.css`; they only
 * apply for the few milliseconds before the real sheet arrives.
 */
const BOOTSTRAP_CSS = `
html { color-scheme: light; }
html.dark { color-scheme: dark; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body { background: #fbfaf8; color: #181512; font-family: system-ui, sans-serif; }
html.dark body { background: #11100f; color: #f7f1ea; }
body[${LOADING_ATTRIBUTE}] > * { visibility: hidden; }
`;

/**
 * Corrections for rules that only make sense in a full-page context.
 *
 * Appended last so it wins the cascade. Both of these are real problems, not
 * hypothetical: `globals.css` puts a 26rem radial gradient on `body`, which in a
 * 380px window renders as a lopsided wash, and sets a 16px base that is too
 * large for the space.
 */
const OVERRIDE_CSS = `
body {
  background-image: none !important;
  min-height: 0 !important;
  font-size: 14px;
  line-height: 1.4;
}
#koku-mini-player-root { height: 100vh; display: flex; flex-direction: column; }
::-webkit-scrollbar { width: 0; height: 0; }
`;

function createStyle(target: Document, css: string): HTMLStyleElement {
  const style = target.createElement("style");
  style.textContent = css;
  return style;
}

/** Copies `.dark`, `data-accent`, the font-variable classes, and `lang`. */
function mirrorRoot(source: Document, target: Document) {
  target.documentElement.className = source.documentElement.className;
  target.documentElement.lang = source.documentElement.lang;

  const accent = source.documentElement.getAttribute("data-accent");
  if (accent === null) {
    target.documentElement.removeAttribute("data-accent");
  } else {
    target.documentElement.setAttribute("data-accent", accent);
  }

  target.body.className = source.body.className;
}

function cloneStyleNode(node: Element, target: Document): Element | null {
  if (node instanceof HTMLLinkElement) {
    const link = target.createElement("link");
    link.rel = "stylesheet";
    // `node.href` is already absolute and same-origin (/_next/static/css/*).
    link.href = node.href;
    if (node.media) {
      link.media = node.media;
    }
    if (node.crossOrigin) {
      link.crossOrigin = node.crossOrigin;
    }
    return link;
  }

  if (node instanceof HTMLStyleElement) {
    // The dev/HMR path, and where `next/font` injects its face declarations.
    const style = target.createElement("style");
    style.textContent = node.textContent;
    if (node.media) {
      style.media = node.media;
    }
    return style;
  }

  return null;
}

function whenLoaded(node: Element): Promise<void> {
  if (!(node instanceof HTMLLinkElement)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    node.addEventListener("load", () => resolve(), { once: true });
    node.addEventListener("error", () => resolve(), { once: true });
  });
}

export function transplantStyles(source: Document, target: Document): StyleTransplant {
  target.head.append(createStyle(target, BOOTSTRAP_CSS));
  target.body.setAttribute(LOADING_ATTRIBUTE, "true");

  mirrorRoot(source, target);

  const clones = new Map<Element, Element>();
  const pending: Promise<void>[] = [];

  /* Appended NOW, not after the adoption loop. `adopt` inserts every clone
     *before* this node, and `insertBefore` throws `NotFoundError` when the
     reference child is not already a child of the parent — which aborted the
     whole transplant on the very first sheet and left the window empty. */
  const override = createStyle(target, OVERRIDE_CSS);
  target.head.append(override);

  const adopt = (node: Element) => {
    if (clones.has(node)) {
      return;
    }

    const clone = cloneStyleNode(node, target);
    if (!clone) {
      return;
    }

    clones.set(node, clone);
    // Always before the override sheet, so our corrections stay last.
    target.head.insertBefore(clone, override);
    pending.push(whenLoaded(clone));
  };

  for (const node of source.querySelectorAll('link[rel="stylesheet"], style')) {
    adopt(node);
  }

  /* Theme following. `next-themes` toggles the `dark` class on <html> and
     `applyAccentToDocument` sets/removes `data-accent` on the same node, so a
     single attribute observer on the root element covers both. */
  const themeObserver = new MutationObserver(() => mirrorRoot(source, target));
  themeObserver.observe(source.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-accent", "lang"],
  });
  const bodyObserver = new MutationObserver(() => {
    target.body.className = source.body.className;
  });
  bodyObserver.observe(source.body, { attributes: true, attributeFilter: ["class"] });

  /* HMR following. Without this, editing globals.css under `next dev` leaves the
     PiP window on stale CSS while the main document updates. */
  const headObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (added instanceof Element && added.matches('link[rel="stylesheet"], style')) {
          adopt(added);
        }
      }

      for (const removed of record.removedNodes) {
        if (removed instanceof Element) {
          clones.get(removed)?.remove();
          clones.delete(removed);
        }
      }
    }
  });
  headObserver.observe(source.head, { childList: true });

  const reveal = () => target.body.removeAttribute(LOADING_ATTRIBUTE);

  const ready = Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => {
      target.defaultView?.setTimeout(resolve, STYLE_BUDGET_MS);
    }),
  ]).then(reveal);

  return {
    ready,
    dispose: () => {
      themeObserver.disconnect();
      bodyObserver.disconnect();
      headObserver.disconnect();
      // The cloned nodes die with the window; nothing else to clean up.
    },
  };
}
