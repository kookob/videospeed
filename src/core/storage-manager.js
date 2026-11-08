/**
 * Chrome storage management utilities.
 *
 * Context-aware: uses chrome.storage.sync when available (extension contexts),
 * falls back to CustomEvent bridge with content-bridge.js (MAIN world).
 */

window.VSC = window.VSC || {};

if (!window.VSC.StorageManager) {
  const docEl = document.documentElement;

  /** True when chrome.storage.sync is available (extension contexts). */
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  /**
   * Promise wrapper for chrome.storage.sync callbacks with uniform error
   * reporting (logger + StorageManager.errorCallback).
   * @param {'set'|'remove'|'clear'} method
   * @param {*} arg - Argument for the method (omitted for clear)
   * @param {string} label - Operation name for messages
   * @param {Object} errorContext - Second argument for errorCallback
   * @returns {Promise<void>}
   */
  function chromeCall(method, arg, label, errorContext) {
    return new Promise((resolve, reject) => {
      const done = () => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message;
          const error = new Error(`Storage ${label} failed: ${message}`);
          window.VSC.logger?.error?.(`Chrome storage ${label} failed: ${message}`);
          StorageManager.errorCallback?.(error, errorContext);
          reject(error);
          return;
        }
        resolve();
      };
      if (arg === undefined) {
        chrome.storage.sync[method](done);
      } else {
        chrome.storage.sync[method](arg, done);
      }
    });
  }

  class StorageManager {
    static errorCallback = null;

    /**
     * Register error callback for monitoring storage failures
     * @param {Function} callback - Callback function for errors
     */
    static onError(callback) {
      this.errorCallback = callback;
    }

    /**
     * @param {Object} defaults - Default values
     * @returns {Promise<Object>} Storage data
     */
    static async get(defaults = {}) {
      if (hasChrome) {
        return new Promise((resolve) => {
          chrome.storage.sync.get(defaults, (storage) => {
            window.VSC.logger?.debug?.('StorageManager: settings from chrome.storage');
            resolve(storage);
          });
        });
      }

      // No chrome.storage — request settings from bridge via CustomEvent
      return new Promise((resolve) => {
        const onReady = (e) => {
          docEl.removeEventListener('VSC_SETTINGS_READY', onReady);
          clearTimeout(timeout);
          const detail = e.detail;

          // Missing bridge data means settings authorization is unknown. Fail
          // closed rather than initializing with defaults on a disabled site.
          if (!detail) {
            window.VSC.logger?.error?.('StorageManager: bridge response is null (clone failed?)');
            resolve(null);
            return;
          }

          // Bridge signals abort for blacklisted/disabled sites.
          if (detail.abort) {
            window.VSC.logger?.debug?.('StorageManager: site disabled by bridge');
            resolve(null);
            return;
          }

          // CustomEvents are page-visible and therefore not an authentication
          // boundary. Reject malformed payloads instead of letting `{}` or an
          // unrelated page event silently activate MAIN with defaults.
          if (
            !detail.settings ||
            typeof detail.settings !== 'object' ||
            Array.isArray(detail.settings)
          ) {
            window.VSC.logger?.error?.('StorageManager: invalid settings response from bridge');
            resolve(null);
            return;
          }

          window.VSC.logger?.debug?.('StorageManager: settings from bridge');
          resolve({ ...defaults, ...detail.settings });
        };

        const timeout = setTimeout(() => {
          docEl.removeEventListener('VSC_SETTINGS_READY', onReady);
          window.VSC.logger?.warn?.('StorageManager: settings timeout, aborting initialization');
          resolve(null);
        }, 2000);

        docEl.addEventListener('VSC_SETTINGS_READY', onReady);

        docEl.dispatchEvent(new CustomEvent('VSC_REQUEST_SETTINGS'));
      });
    }

    /**
     * @param {Object} data - Data to store
     * @returns {Promise<void>}
     */
    static async set(data) {
      if (hasChrome) {
        return chromeCall('set', data, 'save', data);
      }

      // Only lastSpeed can cross the trust boundary to chrome.storage
      const keys = Object.keys(data);
      if (keys.length === 1 && keys[0] === 'lastSpeed') {
        const speed = data.lastSpeed;
        if (typeof speed === 'number' && Number.isFinite(speed)) {
          docEl.dispatchEvent(
            new CustomEvent('VSC_WRITE_STORAGE', { detail: { lastSpeed: speed } })
          );
        } else {
          window.VSC.logger?.warn?.('StorageManager.set: invalid lastSpeed value');
        }
      } else {
        window.VSC.logger?.warn?.(
          `StorageManager.set: only lastSpeed bridgeable from MAIN. Keys: ${keys.join(', ')}`
        );
      }

      return Promise.resolve();
    }

    /**
     * Remove keys from storage.
     * @param {Array<string>} keys - Keys to remove
     * @returns {Promise<void>}
     */
    static async remove(keys) {
      // MAIN world has no writable storage beyond the lastSpeed bridge.
      return hasChrome
        ? chromeCall('remove', keys, 'remove', { removedKeys: keys })
        : Promise.resolve();
    }

    /**
     * Clear all storage.
     * @returns {Promise<void>}
     */
    static async clear() {
      return hasChrome
        ? chromeCall('clear', undefined, 'clear', { operation: 'clear' })
        : Promise.resolve();
    }

    /**
     * @param {Function} callback - Callback with changes in chrome.storage.onChanged format
     */
    static onChanged(callback) {
      if (hasChrome) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync') {
            callback(changes);
          }
        });
      } else {
        docEl.addEventListener('VSC_STORAGE_CHANGED', (e) => {
          callback(e.detail);
        });
      }
    }
  }

  window.VSC.StorageManager = StorageManager;
}
