/**
 * DOM utility functions for Video Speed Controller
 */

window.VSC = window.VSC || {};
window.VSC.DomUtils = {};

/**
 * Initialize document when ready
 * @param {Document} document - Document to initialize
 * @param {Function} callback - Callback to run when ready
 */
window.VSC.DomUtils.initializeWhenReady = function (document, callback) {
  if (document.readyState === 'complete') {
    callback(document);
  } else {
    window.addEventListener('load', () => callback(document), { once: true });
  }
};

/**
 * Check if element or its children are video/audio elements
 * Recursively searches through nested shadow DOM structures
 * @param {Element} node - Node to check
 * @param {boolean} audioEnabled - Whether to check for audio elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findMediaElements = function (node, audioEnabled = false) {
  if (!node) {
    return [];
  }

  const mediaElements = [];
  const selector = audioEnabled ? 'video,audio' : 'video';

  // Check the node itself
  if (node && node.matches && node.matches(selector)) {
    mediaElements.push(node);
  }

  // Check children
  if (node.querySelectorAll) {
    mediaElements.push(...Array.from(node.querySelectorAll(selector)));
  }

  // Recursively check shadow roots
  if (node.shadowRoot) {
    mediaElements.push(...window.VSC.DomUtils.findShadowMedia(node.shadowRoot, selector));
  }

  return mediaElements;
};

/**
 * Recursively find media elements in shadow DOM trees
 * @param {ShadowRoot|Document|Element} root - Root to search from
 * @param {string} selector - CSS selector for media elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findShadowMedia = function (root, selector) {
  const results = [];

  // If root is an element with shadowRoot, search in its shadow first
  if (root.shadowRoot) {
    results.push(...window.VSC.DomUtils.findShadowMedia(root.shadowRoot, selector));
  }

  // Add any matching elements in current root (if it's a shadowRoot/document)
  if (root.querySelectorAll) {
    results.push(...Array.from(root.querySelectorAll(selector)));
  }

  // Recursively check all elements with shadow roots
  if (root.querySelectorAll) {
    const allElements = Array.from(root.querySelectorAll('*'));
    allElements.forEach((element) => {
      if (element.shadowRoot) {
        results.push(...window.VSC.DomUtils.findShadowMedia(element.shadowRoot, selector));
      }
    });
  }

  return results;
};

// Global variables available for both browser and testing
