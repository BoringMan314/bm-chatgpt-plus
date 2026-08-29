(() => {
  const STYLE_ID = "bm-chatgpt-plus-style";
  const SHADOW_STYLE_ID = "bm-chatgpt-plus-shadow-style";
  const DEFAULTS = {
    enabled: true,
    widthPercent: 80,
  };
  const NATIVE_WIDTH_PX = 768;
  const SCROLLBAR_GAP_PX = 16;
  const MIN_PERCENT = 0;
  const MAX_PERCENT = 100;
  const STEP_PERCENT = 5;

  function snapWidthPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.widthPercent;
    const snapped = Math.round(n / STEP_PERCENT) * STEP_PERCENT;
    return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, snapped));
  }

  const KEY_CONTAINERS = [
    'main [data-testid^="conversation-turn"] > div',
    'main [data-message-author-role] > div',
    "main article > div",
    "main .mx-auto",
    'main [class*="max-w-"]',
    "main form",
    "main form > div",
    "main div:has(> form)",
  ];

  const FILL_SELECTORS = [
    'main [data-testid^="conversation-turn"]',
    'main [data-message-author-role]',
    "main article",
    "main .markdown",
    "main .prose",
    "main pre",
    "main table",
    "main [class*='overflow-x-auto']",
  ];

  let settings = { ...DEFAULTS };
  let debounceTimer = 0;
  let nativeWidthPx = 0;

  const observer = new MutationObserver(() => {
    if (!settings.enabled || usesNativeWidth()) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(apply, 160);
  });

  function firstMatch(selectors) {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.clientWidth > 0) return el;
      } catch (_error) {
        // Ignore selectors unsupported by older Chromium builds.
      }
    }
    return null;
  }

  function conversationEl() {
    return firstMatch([
      'main [data-testid^="conversation-turn"] > div',
      'main [data-message-author-role] > div',
      "main article > div",
      "main .mx-auto",
      "main form > div",
    ]);
  }

  function getScrollContainer() {
    return firstMatch([
      "main",
      '[role="main"]',
      '[class*="overflow-y-auto"]',
      '[class*="h-full"]',
    ]) || document.documentElement;
  }

  function getAvailableWidth() {
    const host = getScrollContainer();
    const hostWidth = host?.clientWidth || document.documentElement.clientWidth || 0;
    return Math.max(0, hostWidth - SCROLLBAR_GAP_PX);
  }

  function captureNativeWidth() {
    const el = conversationEl();
    if (!el) return nativeWidthPx || NATIVE_WIDTH_PX;
    if (nativeWidthPx > 0) return nativeWidthPx;

    const html = document.documentElement;
    const style = document.getElementById(STYLE_ID);
    html.classList.remove("bmp-wide", "bmp-enabled");
    if (style) style.disabled = true;
    clearInline();
    void el.offsetWidth;

    const measured = Math.round(el.getBoundingClientRect().width);
    const available = getAvailableWidth();
    if (measured >= 280 && measured < available * 0.8) {
      nativeWidthPx = measured;
    } else {
      nativeWidthPx = NATIVE_WIDTH_PX;
    }

    if (style) style.disabled = false;
    return nativeWidthPx || NATIVE_WIDTH_PX;
  }

  function widthValue() {
    const percent = snapWidthPercent(settings.widthPercent);
    if (percent <= MIN_PERCENT) return null;

    const native = captureNativeWidth();
    const available = getAvailableWidth();
    const span = Math.max(0, available - native);
    const t = percent / MAX_PERCENT;
    const px = Math.round(native + span * t);
    return `${Math.max(native, px)}px`;
  }

  function usesNativeWidth() {
    return snapWidthPercent(settings.widthPercent) <= MIN_PERCENT;
  }

  function buildCss() {
    const width = widthValue();
    if (!width) return "";
    return `
html.bmp-wide {
  --bmp-width: ${width};
}
html.bmp-wide main [data-testid^="conversation-turn"] > div,
html.bmp-wide main [data-message-author-role] > div,
html.bmp-wide main article > div,
html.bmp-wide main .mx-auto,
html.bmp-wide main [class*="max-w-"],
html.bmp-wide main form,
html.bmp-wide main form > div,
html.bmp-wide main div:has(> form) {
  max-width: none !important;
  width: min(100%, var(--bmp-width)) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
html.bmp-wide main .markdown,
html.bmp-wide main .prose,
html.bmp-wide main pre,
html.bmp-wide main table,
html.bmp-wide main [class*="overflow-x-auto"] {
  max-width: 100% !important;
  width: 100% !important;
}
html.bmp-wide main [class*="overflow-x-auto"] {
  overflow-x: auto !important;
}
`.trim();
  }

  function buildShadowCss() {
    const width = widthValue();
    if (!width) return "";
    return `
[data-testid^="conversation-turn"] > div,
[data-message-author-role] > div,
article > div,
.mx-auto,
[class*="max-w-"],
form,
form > div,
div:has(> form) {
  max-width: none !important;
  width: min(100%, ${width}) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.markdown,
.prose,
pre,
table,
[class*="overflow-x-auto"] {
  max-width: 100% !important;
  width: 100% !important;
}
[class*="overflow-x-auto"] {
  overflow-x: auto !important;
}
`.trim();
  }

  function ensureDocumentStyle() {
    const root = document.head || document.documentElement;
    if (!root) return;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      root.appendChild(style);
    } else if (style.parentNode !== root) {
      root.appendChild(style);
    }

    const css = buildCss();
    if (style.textContent !== css) style.textContent = css;
  }

  function injectShadowStyles(root) {
    if (!root) return;
    root.querySelectorAll("*").forEach((el) => {
      const shadow = el.shadowRoot;
      if (!shadow) return;

      let style = shadow.getElementById(SHADOW_STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = SHADOW_STYLE_ID;
        shadow.appendChild(style);
      }
      const css = buildShadowCss();
      if (style.textContent !== css) style.textContent = css;
      injectShadowStyles(shadow);
    });
  }

  function setImportant(el, prop, value) {
    if (
      el.style.getPropertyValue(prop) === value &&
      el.style.getPropertyPriority(prop) === "important"
    ) {
      return;
    }
    el.style.setProperty(prop, value, "important");
  }

  function queryAll(root, selector) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function applyInline(root = document) {
    const width = widthValue();
    if (!width) return;

    for (const selector of KEY_CONTAINERS) {
      queryAll(root, selector).forEach((el) => {
        setImportant(el, "max-width", "none");
        setImportant(el, "width", `min(100%, ${width})`);
        setImportant(el, "min-width", "0");
        setImportant(el, "box-sizing", "border-box");
      });
    }

    for (const selector of FILL_SELECTORS) {
      queryAll(root, selector).forEach((el) => {
        setImportant(el, "max-width", "100%");
        setImportant(el, "width", "100%");
        setImportant(el, "box-sizing", "border-box");
      });
    }

    queryAll(root, 'main [data-testid^="conversation-turn"], main article, main form').forEach((el) => {
      relaxNarrowAncestors(el);
    });
  }

  function relaxNarrowAncestors(start) {
    let node = start.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const tag = node.tagName.toLowerCase();
      const maxWidth = getComputedStyle(node).maxWidth;
      if (maxWidth && maxWidth !== "none") {
        const px = parseFloat(maxWidth);
        if (!Number.isNaN(px) && px >= 480 && px < window.innerWidth * 0.92) {
          setImportant(node, "max-width", "none");
          setImportant(node, "width", "100%");
        }
      }

      if (tag === "main" || node.getAttribute("role") === "main") {
        setImportant(node, "max-width", "none");
        break;
      }
      node = node.parentElement;
    }
  }

  function clearInline(root = document) {
    const selectors = [...KEY_CONTAINERS, ...FILL_SELECTORS].join(",");
    queryAll(root, selectors).forEach((el) => {
      ["max-width", "width", "min-width", "box-sizing"].forEach((prop) => {
        el.style.removeProperty(prop);
      });
    });
  }

  function apply() {
    const html = document.documentElement;
    if (!html) return;

    observer.disconnect();
    try {
      const percent = snapWidthPercent(settings.widthPercent);
      settings.widthPercent = percent;
      const native = !settings.enabled || usesNativeWidth();

      if (!native && !nativeWidthPx) captureNativeWidth();

      html.classList.toggle("bmp-disabled", !settings.enabled);
      html.classList.toggle("bmp-wide", settings.enabled && !native);
      html.classList.toggle("bmp-enabled", settings.enabled && !native);

      if (settings.enabled && !native) {
        html.style.setProperty("--bmp-width", widthValue());
        ensureDocumentStyle();
        applyInline();
        injectShadowStyles(document);
      } else {
        html.style.removeProperty("--bmp-width");
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        clearInline();
      }
    } finally {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  function loadSettings(callback) {
    try {
      chrome.storage.sync.get(DEFAULTS, (result) => {
        settings = {
          enabled: result.enabled !== false,
          widthPercent: snapWidthPercent(result.widthPercent),
        };
        callback();
      });
    } catch (_error) {
      settings = { ...DEFAULTS };
      callback();
    }
  }

  loadSettings(apply);

  window.addEventListener("resize", () => {
    if (!settings.enabled || usesNativeWidth()) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(apply, 160);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.widthPercent) settings.widthPercent = snapWidthPercent(changes.widthPercent.newValue);
    apply();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "bmp:update") return;
    if (typeof message.enabled === "boolean") settings.enabled = message.enabled;
    if (typeof message.widthPercent === "number") {
      settings.widthPercent = snapWidthPercent(message.widthPercent);
    }
    apply();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("DOMContentLoaded", apply, { once: true });
  window.addEventListener("load", apply, { once: true });
})();
