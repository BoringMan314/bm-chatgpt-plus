const DEFAULTS = {
  enabled: true,
  widthPercent: 80,
};
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
const STEP_PERCENT = 5;

function snapWidthPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.widthPercent;
  const snapped = Math.round(n / STEP_PERCENT) * STEP_PERCENT;
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, snapped));
}

const enabledEl = document.getElementById("enabled");
const widthEl = document.getElementById("width");
const widthLabel = document.getElementById("widthLabel");

function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.title = t("extName");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const message = t(el.dataset.i18n);
    if (message) el.textContent = message;
  });
}

function setWidthLabel(value) {
  widthLabel.textContent = `${value}%`;
}

function notifyTabs(settings) {
  chrome.tabs.query(
    {
      url: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      discarded: false,
    },
    (tabs) => {
      for (const tab of tabs) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "bmp:update",
            ...settings,
          })
          .catch(() => {});
      }
    }
  );
}

function persist() {
  const settings = {
    enabled: enabledEl.checked,
    widthPercent: snapWidthPercent(widthEl.value),
  };
  document.body.classList.toggle("disabled", !settings.enabled);
  setWidthLabel(settings.widthPercent);
  chrome.storage.sync.set(settings, () => notifyTabs(settings));
}

applyI18n();

chrome.storage.sync.get(DEFAULTS, (result) => {
  enabledEl.checked = result.enabled !== false;
  widthEl.value = String(snapWidthPercent(result.widthPercent));
  document.body.classList.toggle("disabled", !enabledEl.checked);
  setWidthLabel(widthEl.value);
});

let persistTimer = 0;
enabledEl.addEventListener("change", persist);
widthEl.addEventListener("input", () => {
  setWidthLabel(widthEl.value);
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persist, 120);
});
widthEl.addEventListener("change", persist);

