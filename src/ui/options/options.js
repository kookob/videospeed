/**
 * Options page - depends on core VSC modules
 * Import required dependencies that are normally bundled in inject context
 */

// Core utilities and constants - must load first
import '../../utils/constants.js';
import '../../utils/logger.js';

// Storage and settings - depends on utils
import '../../core/storage-manager.js';
import '../../core/settings.js';

// UI helpers
import { createRow } from './row-renderer.js';

// Initialize global namespace for options page
window.VSC = window.VSC || {};

let keyBindings = [];

// Single timer so an older message's timeout can't wipe a newer message.
let statusTimer;

/**
 * Show a message in #status. Empty text hides it.
 * @param {string} text
 * @param {'success'|'error'} [kind]
 * @param {number} [ms] - auto-clear delay; omit to keep the message
 */
function showStatus(text, kind, ms) {
  clearTimeout(statusTimer);
  const status = document.getElementById('status');
  status.textContent = text;
  status.classList.remove('show', 'success', 'error');
  if (!text) {
    return;
  }
  status.classList.add('show');
  if (kind) {
    status.classList.add(kind);
  }
  if (ms) {
    statusTimer = setTimeout(() => showStatus(''), ms);
  }
}

/**
 * Lightweight CSS syntax highlighter for the controller CSS editor.
 * Returns HTML with spans wrapping comments, selectors, properties,
 * values, and braces. Designed for the transparent-textarea overlay
 * pattern — the textarea handles editing, this colors the <pre> behind it.
 */
function highlightCSS(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Tokenize: pull out comments first, then process the rest
  let result = '';
  let pos = 0;

  while (pos < escaped.length) {
    // Comments
    const commentStart = escaped.indexOf('/*', pos);
    if (commentStart === pos) {
      const commentEnd = escaped.indexOf('*/', pos + 2);
      const end = commentEnd === -1 ? escaped.length : commentEnd + 2;
      result += `<span class="css-comment">${escaped.slice(pos, end)}</span>`;
      pos = end;
      continue;
    }

    // Find next comment to know where to stop
    const nextComment = commentStart === -1 ? escaped.length : commentStart;

    // Process non-comment chunk
    const chunk = escaped.slice(pos, nextComment);
    result += chunk
      // Braces
      .replace(/([{}])/g, '<span class="css-brace">$1</span>')
      // Properties (word-chars before colon, inside a block)
      .replace(/([\w-]+)\s*(?=:)/g, '<span class="css-property">$1</span>')
      // Values (after colon, before semicolon or closing brace)
      .replace(/:\s*([^;{}]+)(;)/g, ': <span class="css-value">$1</span>$2')
      // Selectors (text before opening brace, not already wrapped)
      .replace(
        /([^{}><\n][^{}<>]*?)(\s*<span class="css-brace">\{)/g,
        '<span class="css-selector">$1</span>$2'
      );

    pos = nextComment;
  }

  return result;
}

/** Sync textarea content to the highlighted <pre> overlay */
function updateCSSHighlight() {
  const textarea = document.getElementById('controllerCSS');
  const highlight = document.getElementById('cssHighlight');
  if (textarea && highlight) {
    highlight.innerHTML = `${highlightCSS(textarea.value)}\n`;
  }
}

/** Sync scroll position between textarea and highlight overlay */
function syncCSSScroll() {
  const textarea = document.getElementById('controllerCSS');
  const highlight = document.getElementById('cssHighlight');
  if (textarea && highlight) {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }
}

// Action labels — shared by predefined and custom shortcut rows
const ACTION_OPTIONS = [
  ['slower', 'Decrease speed'],
  ['faster', 'Increase speed'],
  ['rewind', 'Rewind'],
  ['advance', 'Advance'],
  ['reset', 'Reset speed'],
  ['fast', 'Preferred speed'],
  ['muted', 'Mute'],
  ['softer', 'Decrease volume'],
  ['louder', 'Increase volume'],
  ['pause', 'Pause'],
  ['mark', 'Set marker'],
  ['jump', 'Jump to marker'],
  ['display', 'Show/hide controller'],
];

// Column spec for shortcut rows (used by createRow)
const SHORTCUT_COLUMNS = [
  { key: 'action', type: 'select', className: 'customDo', options: ACTION_OPTIONS },
  { key: 'keyInput', type: 'text', className: 'customKey', placeholder: 'press a key' },
  { key: 'value', type: 'text', className: 'customValue', placeholder: 'value (0.10)' },
];

// Column spec for site rule rows
const SITE_RULE_COLUMNS = [
  { key: 'pattern', type: 'text', className: 'rulePattern', placeholder: 'youtube.com or /regex/' },
  { key: 'disabled', type: 'checkbox', className: 'ruleDisabled', default: false },
  { key: 'speed', type: 'text', className: 'ruleSpeed', placeholder: '(global)' },
];

/**
 * Find CSS rule blocks that the browser silently dropped.
 * Splits CSS into top-level rule blocks and tries each one individually.
 * @param {string} css - Original CSS text
 * @param {CSSStyleSheet} parsedSheet - Sheet from replaceSync (for count comparison)
 * @returns {string[]} Array of rule-block snippets that failed to parse
 */
function findDroppedRules(css, parsedSheet) {
  // Split into top-level blocks by tracking brace depth
  const blocks = [];
  let depth = 0;
  let start = 0;
  // Strip comments first so braces inside comments don't confuse us
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') {
      depth++;
    } else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) {
        blocks.push(css.substring(start, i + 1).trim());
        start = i + 1;
      }
    }
  }

  // Unclosed brace: the trailing chunk was never added to blocks
  if (depth !== 0) {
    const remainder = css.substring(start).trim();
    if (remainder) {
      const selector = remainder.split('{')[0].trim();
      return [selector || remainder.slice(0, 40)];
    }
  }

  // If total block count matches parsed rule count, nothing was dropped
  if (blocks.length <= parsedSheet.cssRules.length) {
    return [];
  }

  // Try each block individually to find which ones fail
  const dropped = [];
  const probe = new CSSStyleSheet();
  for (const block of blocks) {
    probe.replaceSync(block);
    if (probe.cssRules.length === 0) {
      // Extract the selector part for the message
      const selector = block.split('{')[0].trim();
      dropped.push(selector || block.slice(0, 40));
    }
  }
  return dropped;
}

/**
 * Warn inline about CSS the browser's parser dropped. replaceSync never throws
 * on syntax errors (bad rules are silently discarded), so this is advisory only.
 * @param {string} css - CSS text to check
 */
function validateControllerCSS(css) {
  const textarea = document.getElementById('controllerCSS');
  const msg = document.getElementById('cssValidation');
  textarea.classList.remove('css-warn');
  msg.classList.remove('warn');
  msg.textContent = '';

  if (!css.trim()) {
    return;
  }

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const count = sheet.cssRules.length;

  if (count === 0) {
    textarea.classList.add('css-warn');
    msg.classList.add('warn');
    msg.textContent = 'No CSS rules parsed — check for syntax errors.';
    return;
  }

  // Find rules that the browser silently dropped
  const dropped = findDroppedRules(css, sheet);
  if (dropped.length > 0) {
    textarea.classList.add('css-warn');
    msg.classList.add('warn');
    msg.textContent = `${count} rule${
      count !== 1 ? 's' : ''
    } parsed, ${dropped.length} dropped: ${dropped
      .map((r) => `"${r.slice(0, 40)}${r.length > 40 ? '...' : ''}"`)
      .join(', ')}`;
  }
}

// TODO(v3): Remove keyCodeAliases once all bindings have displayKey field
// and the legacy `key` integer field is dropped from the schema.
const keyCodeAliases = {
  0: 'null',
  null: 'null',
  undefined: 'null',
  32: 'Space',
  37: 'Left',
  38: 'Up',
  39: 'Right',
  40: 'Down',
  96: 'Num 0',
  97: 'Num 1',
  98: 'Num 2',
  99: 'Num 3',
  100: 'Num 4',
  101: 'Num 5',
  102: 'Num 6',
  103: 'Num 7',
  104: 'Num 8',
  105: 'Num 9',
  106: 'Num *',
  107: 'Num +',
  109: 'Num -',
  110: 'Num .',
  111: 'Num /',
  112: 'F1',
  113: 'F2',
  114: 'F3',
  115: 'F4',
  116: 'F5',
  117: 'F6',
  118: 'F7',
  119: 'F8',
  120: 'F9',
  121: 'F10',
  122: 'F11',
  123: 'F12',
  124: 'F13',
  125: 'F14',
  126: 'F15',
  127: 'F16',
  128: 'F17',
  129: 'F18',
  130: 'F19',
  131: 'F20',
  132: 'F21',
  133: 'F22',
  134: 'F23',
  135: 'F24',
  186: ';',
  188: '<',
  189: '-',
  187: '+',
  190: '>',
  191: '/',
  192: '~',
  219: '[',
  220: '\\',
  221: ']',
  222: "'",
};

// Keyboard layout map — resolved once on page load, used for display labels
let layoutMap = null;
(async function initLayoutMap() {
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      layoutMap = await navigator.keyboard.getLayoutMap();
      // Re-render display labels if layout changes mid-session
      navigator.keyboard.addEventListener('layoutchange', async () => {
        layoutMap = await navigator.keyboard.getLayoutMap();
      });
    }
  } catch {
    // getLayoutMap not available — fallback chain handles it
  }
})();

/**
 * Build a display string for a shortcut.
 * @param {string} displayKey - event.key captured at recording time
 * @param {Object} [modifiers] - {ctrl, alt, shift, meta} booleans
 * @returns {string} e.g., "Ctrl + S", "Shift + P", "F10"
 */
function formatShortcutDisplay(displayKey, modifiers) {
  if (!displayKey) {
    return 'null';
  }
  const parts = [];
  if (modifiers) {
    if (modifiers.ctrl) {
      parts.push('Ctrl');
    }
    if (modifiers.alt) {
      parts.push('Alt');
    }
    if (modifiers.shift) {
      parts.push('Shift');
    }
    if (modifiers.meta) {
      parts.push('Meta');
    }
  }
  // Capitalize single-character keys for display
  const label = displayKey.length === 1 ? displayKey.toUpperCase() : displayKey;
  parts.push(label);
  return parts.join(' + ');
}

/**
 * Resolve the best display label for a binding.
 * Fallback chain: layoutMap → displayKey → keyCodeAliases → code → "null"
 */
function resolveDisplayLabel(binding) {
  // Try layout map first (most accurate for current keyboard)
  if (layoutMap && binding.code) {
    const mapped = layoutMap.get(binding.code);
    if (mapped) {
      return formatShortcutDisplay(mapped, binding.modifiers);
    }
  }
  // v2 binding with displayKey
  if (binding.displayKey) {
    return formatShortcutDisplay(binding.displayKey, binding.modifiers);
  }
  // v2 binding with code but no displayKey
  if (binding.code) {
    const derived = window.VSC.Constants.displayKeyFromCode(binding.code);
    return formatShortcutDisplay(derived, binding.modifiers);
  }
  // Legacy v1 binding — fall back to keyCodeAliases
  const kc = binding.keyCode ?? binding.key;
  return keyCodeAliases[kc] || (kc >= 48 && kc <= 90 ? String.fromCharCode(kc) : `Key ${kc}`);
}

/**
 * Auto-size a key input to fit chord labels like "Ctrl + Shift + S".
 * Falls back to 75px minimum for simple keys.
 */
function autoSizeKeyInput(input) {
  const minWidth = 75;
  if (!input.value || input.value.length <= 3) {
    input.style.width = `${minWidth}px`;
    return;
  }
  const span = document.createElement('span');
  span.style.visibility = 'hidden';
  span.style.position = 'absolute';
  span.style.font = getComputedStyle(input).font;
  span.style.whiteSpace = 'nowrap';
  span.textContent = input.value;
  document.body.appendChild(span);
  const textWidth = span.offsetWidth;
  document.body.removeChild(span);
  input.style.width = `${Math.max(minWidth, textWidth + 26)}px`;
}

function recordKeyPress(e) {
  // Special handling for backspace and escape (via event.code)
  if (e.code === 'Backspace') {
    e.target.value = '';
    e.target.code = null;
    e.target.keyCode = null;
    e.target.displayKey = null;
    e.target.modifiers = undefined;
    e.preventDefault();
    e.stopPropagation();
    return;
  } else if (e.code === 'Escape') {
    e.target.value = 'null';
    e.target.code = null;
    e.target.keyCode = null;
    e.target.displayKey = null;
    e.target.modifiers = undefined;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Block blacklisted codes
  if (window.VSC.Constants.BLACKLISTED_CODES.has(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Capture v2 identity
  e.target.code = e.code;
  e.target.keyCode = e.keyCode;

  // Display: use the layout map when available — it shows the actual character
  // printed on the key for the user's current keyboard layout (e.g. "z" for the
  // KeyW physical key on AZERTY). Fall back to displayKeyFromCode for Numpad keys
  // where the layout map returns the same value as the main keyboard (both Enter
  // and NumpadEnter map to "Enter" in the layout map, so we need the explicit
  // "Num Enter" label from displayKeyFromCode to keep them visually distinct).
  const isNumpad = e.code.startsWith('Numpad');
  e.target.displayKey = isNumpad
    ? window.VSC.Constants.displayKeyFromCode(e.code) || e.key
    : layoutMap?.get(e.code) || window.VSC.Constants.displayKeyFromCode(e.code) || e.key;

  // Capture modifiers — only store object if any modifier is active
  const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  e.target.modifiers = hasMod
    ? {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      }
    : undefined;

  // Display formatted shortcut
  e.target.value = formatShortcutDisplay(e.target.displayKey, e.target.modifiers);
  autoSizeKeyInput(e.target);

  // Show contextual warnings for problematic modifier combos
  clearWarning(e.target);
  if (e.ctrlKey && e.altKey) {
    showWarning(
      e.target,
      'This combination may conflict with AltGr input on some keyboard layouts.'
    );
  } else if (e.metaKey) {
    showWarning(e.target, 'Some Cmd/Meta combinations are intercepted by the OS and may not work.');
  }

  e.preventDefault();
  e.stopPropagation();
}

function showWarning(input, message) {
  clearWarning(input);
  const warn = document.createElement('span');
  warn.className = 'shortcut-warning';
  warn.textContent = message;
  warn.style.cssText = 'display:block;color:#c57600;font-size:11px;margin-top:2px;';
  input.parentNode.insertBefore(warn, input.nextSibling);
}

function clearWarning(input) {
  const existing = input.parentNode.querySelector('.shortcut-warning');
  if (existing) {
    existing.remove();
  }
}

function inputFilterNumbersOnly(e) {
  if ((e.inputType === 'insertText' || e.inputType === 'insertFromPaste') && e.data) {
    if (!/^\d+(\.\d*)?$/.test(e.target.value + e.data)) {
      e.preventDefault();
    }
  }
}

/**
 * Populate a shortcut input element with binding data.
 * Sets all v2 fields on the DOM element for round-trip through createKeyBindings.
 */
function setShortcutInput(input, binding) {
  input.code = binding.code;
  input.keyCode = binding.keyCode ?? binding.key;
  input.displayKey = binding.displayKey;
  input.modifiers = binding.modifiers;
  input.value = resolveDisplayLabel(binding);
  autoSizeKeyInput(input);
}

/**
 * Add a shortcut row (custom, not predefined).
 * @param {Object} [data] - Optional initial data { action, value }
 * @returns {HTMLElement} The created row
 */
function add_shortcut(data = {}) {
  const container = document.getElementById('shortcuts-container');
  const row = createRow(container, SHORTCUT_COLUMNS, data, {
    className: 'customs',
    removable: true,
  });
  // Hide value input for actions that don't need values
  const action = data.action || row.querySelector('.customDo').value;
  if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(action)) {
    row.querySelector('.customValue').style.display = 'none';
  }
  return row;
}

/**
 * Add a predefined shortcut row (fixed action, no remove button).
 * @param {Object} data - Binding data { action, value, ... }
 * @returns {HTMLElement} The created row
 */
function add_predefined_shortcut(data) {
  const container = document.getElementById('shortcuts-container');
  const row = createRow(
    container,
    SHORTCUT_COLUMNS,
    { action: data.action },
    {
      className: 'customs',
      id: data.action,
      removable: false,
    }
  );
  // Predefined rows: lock the action dropdown
  const select = row.querySelector('.customDo');
  select.disabled = true;
  // Set key input
  setShortcutInput(row.querySelector('.customKey'), data);
  // Set value input
  const valueInput = row.querySelector('.customValue');
  valueInput.value = data.value;
  // Hide value input for actions that don't need values
  if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(data.action)) {
    valueInput.style.display = 'none';
  }
  return row;
}

function createKeyBindings(item) {
  const action = item.querySelector('.customDo').value;
  const input = item.querySelector('.customKey');
  const value = Number(item.querySelector('.customValue').value);
  const predefined = !!item.id;

  const binding = {
    action: action,
    code: input.code, // PRIMARY — event.code string
    key: input.keyCode, // OLD field name — integer, downgrade compat
    keyCode: input.keyCode, // NEW field name — canonical legacy integer
    displayKey: input.displayKey, // display-friendly from event.key
    value: value,
    predefined: predefined,
  };

  // Only include modifiers when at least one is true
  if (input.modifiers) {
    binding.modifiers = input.modifiers;
  }

  keyBindings.push(binding);
}

// --- Site rule helpers ---

/**
 * Add a site rule row to the container.
 * @param {Object} [data] - { pattern, enabled, speed }
 * @returns {HTMLElement}
 */
function add_site_rule(data = { enabled: true }) {
  const container = document.getElementById('site-rules-container');
  const speedDisplay = data.speed !== null && data.speed !== undefined ? data.speed : undefined;
  return createRow(
    container,
    SITE_RULE_COLUMNS,
    { pattern: data.pattern, disabled: !data.enabled, speed: speedDisplay },
    { className: 'site-rule', removable: true }
  );
}

/**
 * Parse a speed input string.
 * Returns the numeric value, or null if empty/invalid.
 */
function parseSpeed(s) {
  if (typeof s !== 'string') {
    return s ?? null;
  }
  const trimmed = s.trim();
  if (trimmed === '') {
    return null;
  }
  const v = parseFloat(trimmed);
  return isNaN(v) ? null : v;
}

/**
 * Collect site rules from the DOM.
 * @returns {Array<{pattern: string, enabled: boolean, speed: number|null}>}
 */
function collectSiteRules() {
  const container = document.getElementById('site-rules-container');
  return Array.from(container.querySelectorAll('.row.site-rule'))
    .map((row) => ({
      pattern: row.querySelector('.rulePattern').value.trim(),
      enabled: !row.querySelector('.ruleDisabled').checked,
      speed: parseSpeed(row.querySelector('.ruleSpeed').value),
    }))
    .filter((r) => r.pattern);
}

// Validates settings before saving
function validate() {
  const regEndsWithFlags = window.VSC.Constants.regEndsWithFlags;

  // Validate site rules
  const rules = collectSiteRules();
  for (const rule of rules) {
    // Validate regex patterns
    if (rule.pattern.startsWith('/')) {
      try {
        const parts = rule.pattern.split('/');
        if (parts.length < 3) {
          throw 'invalid regex';
        }
        const hasFlags = regEndsWithFlags.test(rule.pattern);
        const flags = hasFlags ? parts.pop() : '';
        const regex = parts.slice(1, hasFlags ? undefined : -1).join('/');
        if (!regex) {
          throw 'empty regex';
        }
        new RegExp(regex, flags);
      } catch {
        showStatus(
          `Error: Invalid site rule regex: "${rule.pattern}". Unable to save.`,
          'error',
          5000
        );
        return false;
      }
    }

    // Validate speed range
    if (rule.speed !== null && rule.speed !== undefined) {
      if (
        rule.speed < window.VSC.Constants.SPEED_LIMITS.MIN ||
        rule.speed > window.VSC.Constants.SPEED_LIMITS.MAX
      ) {
        showStatus(
          `Error: Speed for "${rule.pattern}" must be between ${
            window.VSC.Constants.SPEED_LIMITS.MIN
          } and ${window.VSC.Constants.SPEED_LIMITS.MAX}.`,
          'error',
          5000
        );
        return false;
      }
    }
  }

  return true;
}

// Saves options using VideoSpeedConfig system
async function save_options() {
  if (validate() === false) {
    return;
  }

  showStatus('');

  try {
    keyBindings = [];
    Array.from(document.querySelectorAll('.customs')).forEach((item) => createKeyBindings(item));

    const rememberSpeed = document.getElementById('rememberSpeed').checked;
    const exclusiveKeys = document.getElementById('exclusiveKeys').checked;
    const audioBoolean = document.getElementById('audioBoolean').checked;
    const startHidden = document.getElementById('startHidden').checked;
    const controllerOpacity = Number(document.getElementById('controllerOpacity').value);
    const controllerButtonSize = Number(document.getElementById('controllerButtonSize').value);
    const logLevel = parseInt(document.getElementById('logLevel').value);
    const siteRules = collectSiteRules();
    const customCSS = document.getElementById('controllerCSS').value;

    // Refresh the inline dropped-rule warning (advisory; never blocks save)
    validateControllerCSS(customCSS);

    // Byte-length guard for chrome.storage.sync (8KB per-item limit)
    const cssByteSize = new Blob([customCSS]).size;
    if (cssByteSize > 8192) {
      showStatus(
        `Error: Controller CSS exceeds 8KB storage limit (${Math.round(cssByteSize / 1024)}KB). Reduce CSS size.`,
        'error',
        5000
      );
      return;
    }

    // Use VideoSpeedConfig to save settings (sync storage)
    const settingsToSave = {
      rememberSpeed: rememberSpeed,
      exclusiveKeys: exclusiveKeys,
      audioBoolean: audioBoolean,
      startHidden: startHidden,
      controllerOpacity: controllerOpacity,
      controllerButtonSize: controllerButtonSize,
      logLevel: logLevel,
      keyBindings: keyBindings,
      siteRules: siteRules,
    };

    settingsToSave.customCSS = customCSS;

    const ok = await window.VSC.videoSpeedConfig.save(settingsToSave);

    if (!ok) {
      showStatus('Error: failed to save options to storage', 'error', 3000);
    }
  } catch (error) {
    console.error('Failed to save options:', error);
    showStatus(`Error saving options: ${error.message}`, 'error', 3000);
  }
}

// Restores options using VideoSpeedConfig system
async function restore_options() {
  try {
    // Load settings using VideoSpeedConfig
    await window.VSC.videoSpeedConfig.load();
    const storage = window.VSC.videoSpeedConfig.settings;

    document.getElementById('rememberSpeed').checked = storage.rememberSpeed;
    document.getElementById('exclusiveKeys').checked = storage.exclusiveKeys;
    document.getElementById('audioBoolean').checked = storage.audioBoolean;
    document.getElementById('startHidden').checked = storage.startHidden;
    document.getElementById('controllerOpacity').value = storage.controllerOpacity;
    document.getElementById('controllerButtonSize').value = storage.controllerButtonSize;
    document.getElementById('logLevel').value = storage.logLevel;
    document.getElementById('controllerCSS').value = storage.customCSS ?? '';

    // Render site rules
    const siteRules = storage.siteRules || window.VSC.Constants.DEFAULT_SETTINGS.siteRules;
    const rulesContainer = document.getElementById('site-rules-container');
    // Clear existing rule rows but keep the header
    rulesContainer.querySelectorAll('.row.site-rule').forEach((r) => r.remove());
    for (const rule of siteRules) {
      add_site_rule(rule);
    }

    // Process key bindings — all rows rendered dynamically
    const bindings = storage.keyBindings || window.VSC.Constants.DEFAULT_SETTINGS.keyBindings;

    // Clear existing shortcut rows (handles restore_defaults re-render)
    const shortcutsContainer = document.getElementById('shortcuts-container');
    shortcutsContainer.innerHTML = '';

    for (const item of bindings) {
      if (item.predefined) {
        add_predefined_shortcut(item);
      } else {
        const row = add_shortcut({ action: item.action, value: item.value });
        setShortcutInput(row.querySelector('.customKey'), item);
      }
    }
  } catch (error) {
    console.error('Failed to restore options:', error);
    showStatus(`Error loading options: ${error.message}`, 'error', 3000);
  }
}

async function restore_defaults() {
  try {
    showStatus('Restoring defaults...');

    // Clear all storage
    await window.VSC.StorageManager.clear();

    const defaults = { ...window.VSC.Constants.DEFAULT_SETTINGS, schemaVersion: 2 };
    const ok = await window.VSC.videoSpeedConfig.save(defaults);
    if (!ok) {
      throw new Error('failed to write defaults to storage');
    }

    // Reload the options page (clears and re-renders all shortcut rows)
    await restore_options();

    showStatus('Default options restored', 'success', 2000);
  } catch (error) {
    console.error('Failed to restore defaults:', error);
    showStatus(`Error restoring defaults: ${error.message}`, 'error', 3000);
  }
}

/**
 * Export all settings as a JSON file download.
 */
async function export_settings() {
  try {
    await window.VSC.videoSpeedConfig.load();
    const settings = { ...window.VSC.videoSpeedConfig.settings };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'videospeed-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('Settings exported', 'success', 2000);
  } catch (error) {
    console.error('Failed to export settings:', error);
    showStatus(`Error exporting settings: ${error.message}`, 'error', 3000);
  }
}

/**
 * Import settings from a JSON file. Validates structure before applying.
 */
function import_settings() {
  document.getElementById('importFile').click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  // Reset the input so the same file can be re-selected
  event.target.value = '';

  try {
    const text = await file.text();
    let imported;
    try {
      imported = JSON.parse(text);
    } catch (e) {
      throw new Error('File is not valid JSON', { cause: e });
    }

    if (!imported || typeof imported !== 'object' || !Array.isArray(imported.keyBindings)) {
      throw new Error('File does not look like a Video Speed Controller settings file');
    }

    // Clear existing storage and write the imported settings
    await window.VSC.StorageManager.clear();
    const ok = await window.VSC.videoSpeedConfig.save(imported);
    if (!ok) {
      throw new Error('Failed to write imported settings to storage');
    }

    // Reload settings into the UI (clears and re-renders all rows)
    await restore_options();

    showStatus('Settings imported successfully', 'success', 2000);
  } catch (error) {
    console.error('Failed to import settings:', error);
    showStatus(`Import failed: ${error.message}`, 'error', 4000);
  }
}

function switchTab(tabName) {
  ['settings', 'advanced', 'faq'].forEach((name) => {
    document.getElementById(`tab-${name}`).classList.toggle('active', name === tabName);
    document.getElementById(`panel-${name}`).style.display = name === tabName ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Optional: Set up storage error monitoring for debugging/telemetry
  window.VSC.StorageManager.onError((error, data) => {
    // Log to console for debugging, could also send telemetry
    console.warn('Storage operation failed:', error.message, data);
  });

  await restore_options();

  const saveBtn = document.getElementById('save');

  // Dirty-state tracking: green button when unsaved changes exist,
  // dimmed briefly after save to confirm the action landed.
  function markDirty() {
    saveBtn.classList.add('has-changes');
    saveBtn.classList.remove('saved');
  }
  function markClean() {
    saveBtn.classList.remove('has-changes');
    saveBtn.classList.add('saved');
    setTimeout(() => saveBtn.classList.remove('saved'), 1500);
  }

  // Catch all form changes via delegation (covers dynamic rows too)
  document.body.addEventListener('input', markDirty);
  document.body.addEventListener('change', markDirty);

  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await save_options();
    markClean();
  });

  document.getElementById('add').addEventListener('click', () => {
    add_shortcut();
    markDirty();
  });
  document.getElementById('add-site-rule').addEventListener('click', () => {
    add_site_rule();
    markDirty();
  });

  document.getElementById('restore').addEventListener('click', async (e) => {
    e.preventDefault();
    await restore_defaults();
  });

  document.getElementById('export').addEventListener('click', (e) => {
    e.preventDefault();
    export_settings();
  });

  document.getElementById('import').addEventListener('click', (e) => {
    e.preventDefault();
    import_settings();
  });

  document.getElementById('importFile').addEventListener('change', handleImportFile);

  document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));
  document.getElementById('tab-advanced').addEventListener('click', () => switchTab('advanced'));
  document.getElementById('tab-faq').addEventListener('click', () => switchTab('faq'));

  // Split button dropdown
  const splitMenu = document.getElementById('split-menu');
  document.getElementById('split-toggle').addEventListener('click', () => {
    splitMenu.hidden = !splitMenu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.split-button')) {
      splitMenu.hidden = true;
    }
  });
  // Close dropdown after any menu action
  splitMenu.addEventListener('click', () => {
    splitMenu.hidden = true;
  });

  // CSS editor: live validation (debounced) + syntax highlighting + scroll sync
  const cssTextarea = document.getElementById('controllerCSS');
  let cssValidationTimer;
  cssTextarea.addEventListener('input', () => {
    updateCSSHighlight();
    clearTimeout(cssValidationTimer);
    cssValidationTimer = setTimeout(() => {
      validateControllerCSS(cssTextarea.value);
    }, 300);
  });
  cssTextarea.addEventListener('scroll', syncCSSScroll);

  // Initial highlight + validation
  updateCSSHighlight();
  validateControllerCSS(cssTextarea.value);

  // About and feedback button event listeners
  document.getElementById('about').addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed');
  });

  document.getElementById('feedback').addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed/issues');
  });

  function eventCaller(event, className, funcName) {
    if (!event.target.classList.contains(className)) {
      return;
    }
    funcName(event);
  }

  document.addEventListener('beforeinput', (event) => {
    eventCaller(event, 'customValue', inputFilterNumbersOnly);
  });
  document.addEventListener('keydown', (event) => {
    eventCaller(event, 'customKey', recordKeyPress);
  });
  document.addEventListener('click', (event) => {
    eventCaller(event, 'removeParent', () => {
      event.target.closest('.row').remove();
      markDirty();
    });
  });
  document.addEventListener('change', (event) => {
    eventCaller(event, 'customDo', () => {
      const row = event.target.closest('.row');
      const valueInput = row.querySelector('.customValue');
      if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(event.target.value)) {
        valueInput.style.display = 'none';
        valueInput.value = 0;
      } else {
        valueInput.style.display = 'inline-block';
      }
    });
  });
});
