(() => {
  const STYLE_ID = "bm-chatgpt-plus-style";
  const SHADOW_STYLE_ID = "bm-chatgpt-plus-shadow-style";
  const DEFAULTS = {
    enabled: true,
    widthPercent: 80,
  };
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

  const LEGACY_KEY_CONTAINERS = [
    'main:not(:has([data-composer-positioner])) [data-testid^="conversation-turn"] > div',
    'main:not(:has([data-composer-positioner])) [data-message-author-role] > div',
    "main:not(:has([data-composer-positioner])) article > div",
    "main:not(:has([data-composer-positioner])) .mx-auto",
    'main:not(:has([data-composer-positioner])) [class*="max-w-"]',
    "main:not(:has([data-composer-positioner])) form",
    "main:not(:has([data-composer-positioner])) form > div",
    "main:not(:has([data-composer-positioner])) div:has(> form)",
  ];

  const OCTANE_KEY_CONTAINERS = [
    "[data-web-mobile-conversation]",
    "[data-composer-positioner]",
  ];

  const KEY_CONTAINERS = [...LEGACY_KEY_CONTAINERS, ...OCTANE_KEY_CONTAINERS];

  const FILL_SELECTORS = [
    'main:not(:has([data-composer-positioner])) [data-testid^="conversation-turn"]',
    'main:not(:has([data-composer-positioner])) [data-message-author-role]',
    "main:not(:has([data-composer-positioner])) article",
    "main:not(:has([data-composer-positioner])) .markdown",
    "main:not(:has([data-composer-positioner])) .prose",
    "main:not(:has([data-composer-positioner])) pre",
    "main:not(:has([data-composer-positioner])) table",
    "main:not(:has([data-composer-positioner])) [class*='overflow-x-auto']",
    "[data-message-role]",
    "[data-assistant-markdown]",
  ];

  let settings = { ...DEFAULTS };
  let debounceTimer = 0;
  let nativeWidthPx = 0;
  let nativesCaptured = false;
  const nativeByElement = new WeakMap();
  const nativePaddingByElement = new WeakMap();
  const originalStylesByElement = new Map();
  const composerAncestorPadding = new Map();
  const composerAvailableByElement = new WeakMap();

  const observer = new MutationObserver(() => {
    if (!settings.enabled || usesNativeWidth()) return;
    resetNativeWidths();
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
      "[data-web-mobile-conversation]",
      "[data-composer-positioner]",
      'main [data-testid^="conversation-turn"] > div',
      'main [data-message-author-role] > div',
      "main article > div",
      "main .mx-auto",
      "main form > div",
    ]);
  }

  function isOctaneShell() {
    return !!document.querySelector("[data-web-mobile-conversation], [data-composer-positioner]");
  }

  function layoutScrollbarWidth(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    return Math.max(0, Math.round(el.offsetWidth - el.clientWidth - border));
  }

  function getScrollContainer() {
    return firstMatch([
      "main",
      '[role="main"]',
      '[class*="overflow-y-auto"]',
      '[class*="h-full"]',
    ]) || document.documentElement;
  }

  function scrollbarReserve(el) {
    return layoutScrollbarWidth(el) >= 8 ? 0 : SCROLLBAR_GAP_PX;
  }

  function getContentLaneWidth() {
    const root = document.querySelector("main") || document.documentElement;
    const rootRect = root.getBoundingClientRect();
    let left = rootRect.left;
    let right = rootRect.right;
    const sidebar = document.querySelector("[data-octane-sidebar-pane], aside[data-desktop-sidebar]");
    if (sidebar) {
      const cs = getComputedStyle(sidebar);
      const sideRect = sidebar.getBoundingClientRect();
      if (sideRect.width > 40 && cs.display !== "none" && cs.visibility !== "hidden") {
        const rtl = getComputedStyle(document.documentElement).direction === "rtl";
        if (!rtl) left = Math.max(left, Math.min(sideRect.right, right));
        else right = Math.min(right, Math.max(sideRect.left, left));
      }
    }
    const scroller = document.scrollingElement || document.documentElement;
    return Math.max(0, Math.round(right - left - scrollbarReserve(scroller)));
  }

  function getAvailableWidth(el) {
    if (isOctaneShell()) {
      const laneWidth = getContentLaneWidth();
      // width: min(100%, ...) 的 100% 取決於父層內容區，並非整個 main。
      // 先把終點限制在實際可達的寬度，避免 95% 就碰到父層上限。
      let parent = el?.parentElement;
      while (parent) {
        const cs = getComputedStyle(parent);
        if (cs.display !== "contents" && parent.clientWidth > 0) {
          const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          return Math.min(laneWidth, Math.max(0, parent.clientWidth - padding));
        }
        parent = parent.parentElement;
      }
      return laneWidth;
    }
    const host = getScrollContainer();
    const hostWidth = host?.clientWidth || document.documentElement.clientWidth || 0;
    return Math.max(0, hostWidth - scrollbarReserve(host));
  }

  function resetNativeWidths() {
    nativeWidthPx = 0;
    nativesCaptured = false;
  }

  function captureNativeWidth() {
    if (nativesCaptured && nativeWidthPx > 0) return nativeWidthPx;

    const html = document.documentElement;
    const style = document.getElementById(STYLE_ID);
    const wasWide = html.classList.contains("bmp-wide");
    html.classList.remove("bmp-wide", "bmp-enabled");
    if (style) style.disabled = true;
    clearInline();
    clearShadowStyles(document);

    const seen = new Set();
    for (const selector of KEY_CONTAINERS) {
      queryAll(document, selector).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const measured = el.getBoundingClientRect().width;
        if (measured > 0) nativeByElement.set(el, measured);
        else nativeByElement.delete(el);
        if (el.matches(OCTANE_KEY_CONTAINERS.join(",")) || el.querySelector("form")) {
          const cs = getComputedStyle(el);
          nativePaddingByElement.set(el, {
            start: parseFloat(cs.paddingInlineStart) || 0,
            end: parseFloat(cs.paddingInlineEnd) || 0,
          });
        }
      });
    }

    const column = conversationEl();
    // 0% 只採用當下原版實際尺寸；尚未顯示時等待，不用固定設計寬度代替。
    nativeWidthPx = column ? column.getBoundingClientRect().width : 0;
    nativesCaptured = nativeWidthPx > 0;

    // 輸入框的邊距可能在祖先層；先量測釋放留白後真正可達的終點。
    composerAncestorPadding.clear();
    const composers = queryAll(document, '[data-composer-positioner], main:not(:has([data-composer-positioner])) form');
    for (const composer of composers) {
      let parent = composer.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement &&
        parent.tagName !== "MAIN" && parent.getAttribute("role") !== "main") {
        const cs = getComputedStyle(parent);
        if (cs.display !== "contents" && parent.clientWidth > 0) {
          const padding = {
            start: parseFloat(cs.paddingInlineStart) || 0,
            end: parseFloat(cs.paddingInlineEnd) || 0,
          };
          if ((padding.start || padding.end) && !composerAncestorPadding.has(parent)) {
            composerAncestorPadding.set(parent, padding);
          }
        }
        parent = parent.parentElement;
      }
    }
    for (const parent of composerAncestorPadding.keys()) {
      setImportant(parent, "padding-inline-start", "0px");
      setImportant(parent, "padding-inline-end", "0px");
    }
    for (const composer of composers) {
      composerAvailableByElement.set(composer, getAvailableWidth(composer));
    }
    clearInline();

    if (style) style.disabled = false;
    if (wasWide) html.classList.add("bmp-wide");
    return nativeWidthPx;
  }

  function widthPxFor(native, padding = { start: 0, end: 0 }, available = getAvailableWidth()) {
    const percent = snapWidthPercent(settings.widthPercent);
    const progress = percent / MAX_PERCENT;
    const nativePadding = padding.start + padding.end;
    const nativeContent = native - nativePadding;
    // 從原版內文出發，只分配到可用邊緣之間的剩餘距離。
    const remaining = Math.max(0, available - nativeContent);
    const content = nativeContent + remaining * progress;
    return content + nativePadding * (1 - progress);
  }

  function widthValue() {
    const percent = snapWidthPercent(settings.widthPercent);
    if (percent <= MIN_PERCENT) return null;
    const native = captureNativeWidth();
    return native > 0 ? `${widthPxFor(native)}px` : null;
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
html.bmp-wide main:not(:has([data-composer-positioner])) [data-testid^="conversation-turn"] > div,
html.bmp-wide main:not(:has([data-composer-positioner])) [data-message-author-role] > div,
html.bmp-wide main:not(:has([data-composer-positioner])) article > div,
html.bmp-wide main:not(:has([data-composer-positioner])) .mx-auto,
html.bmp-wide main:not(:has([data-composer-positioner])) [class*="max-w-"],
html.bmp-wide main:not(:has([data-composer-positioner])) form,
html.bmp-wide main:not(:has([data-composer-positioner])) form > div,
html.bmp-wide main:not(:has([data-composer-positioner])) div:has(> form) {
  max-width: none !important;
  width: min(100%, var(--bmp-width)) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
html.bmp-wide main:not(:has([data-composer-positioner])) .markdown,
html.bmp-wide main:not(:has([data-composer-positioner])) .prose,
html.bmp-wide main:not(:has([data-composer-positioner])) pre,
html.bmp-wide main:not(:has([data-composer-positioner])) table,
html.bmp-wide main:not(:has([data-composer-positioner])) [class*="overflow-x-auto"] {
  max-width: 100% !important;
  width: 100% !important;
}
html.bmp-wide main:not(:has([data-composer-positioner])) [class*="overflow-x-auto"] {
  overflow-x: auto !important;
}
html.bmp-wide [data-web-mobile-conversation],
html.bmp-wide [data-composer-positioner] {
  max-width: none !important;
  width: min(100%, var(--bmp-width)) !important;
  min-width: 0 !important;
  margin-inline: auto !important;
  box-sizing: border-box !important;
}
html.bmp-wide [data-assistant-markdown],
html.bmp-wide [data-message-role] {
  max-width: 100% !important;
  width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
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
div:has(> form),
[data-web-mobile-conversation],
[data-composer-positioner] {
  max-width: none !important;
  width: min(100%, ${width}) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.markdown,
.prose,
pre,
table,
[class*="overflow-x-auto"],
[data-assistant-markdown],
[data-message-role] {
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

  function clearShadowStyles(root) {
    root.querySelectorAll("*").forEach((el) => {
      if (!el.shadowRoot) return;
      el.shadowRoot.getElementById(SHADOW_STYLE_ID)?.remove();
      clearShadowStyles(el.shadowRoot);
    });
  }

  function setImportant(el, prop, value) {
    if (!originalStylesByElement.has(el)) originalStylesByElement.set(el, new Map());
    const saved = originalStylesByElement.get(el);
    if (!saved.has(prop)) {
      saved.set(prop, [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    }
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

    const progress = snapWidthPercent(settings.widthPercent) / MAX_PERCENT;
    for (const [parent, padding] of composerAncestorPadding) {
      for (const [side, original] of Object.entries(padding)) {
        setImportant(parent, `padding-inline-${side}`, `${original * (1 - progress)}px`);
      }
    }

    for (const selector of KEY_CONTAINERS) {
      queryAll(root, selector).forEach((el) => {
        const native = nativeByElement.get(el) || captureNativeWidth();
        const padding = nativePaddingByElement.get(el);
        const available = composerAvailableByElement.get(el) ?? getAvailableWidth(el);
        const px = widthPxFor(native, padding, available);
        setImportant(el, "max-width", "none");
        setImportant(el, "width", `min(100%, ${px}px)`);
        setImportant(el, "min-width", "0");
        setImportant(el, "box-sizing", "border-box");
        // 外框和內距一起內插，避免小畫面所有百分比都卡在全寬。
        if (padding) {
          const progress = snapWidthPercent(settings.widthPercent) / MAX_PERCENT;
          for (const [side, original] of Object.entries(padding)) {
            const prop = `padding-inline-${side}`;
            setImportant(el, prop, `${original * (1 - progress)}px`);
          }
        }
      });
    }

    for (const selector of FILL_SELECTORS) {
      queryAll(root, selector).forEach((el) => {
        setImportant(el, "max-width", "100%");
        setImportant(el, "width", "100%");
        setImportant(el, "box-sizing", "border-box");
      });
    }

    queryAll(
      root,
      'main:not(:has([data-composer-positioner])) [data-testid^="conversation-turn"], main:not(:has([data-composer-positioner])) article, main:not(:has([data-composer-positioner])) form'
    ).forEach((el) => {
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

  function clearInline() {
    for (const [el, properties] of originalStylesByElement) {
      for (const [prop, [value, priority]] of properties) {
        if (value) el.style.setProperty(prop, value, priority);
        else el.style.removeProperty(prop);
      }
    }
    originalStylesByElement.clear();
  }

  function apply() {
    const html = document.documentElement;
    if (!html) return;

    observer.disconnect();
    try {
      const percent = snapWidthPercent(settings.widthPercent);
      settings.widthPercent = percent;
      const native = !settings.enabled || usesNativeWidth() || !captureNativeWidth();

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
        clearShadowStyles(document);
        resetNativeWidths();
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
    resetNativeWidths();
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
