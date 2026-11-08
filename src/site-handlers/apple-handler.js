/**
 * Apple TV+ handler
 */

window.VSC = window.VSC || {};

class AppleHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Apple TV+
   * @returns {boolean} True if on Apple TV+
   */
  static matches() {
    return location.hostname === 'tv.apple.com';
  }

  /**
   * Handle special video detection for Apple TV+
   * @param {Document} document - Document object
   * @returns {Array<HTMLMediaElement>} Additional videos found
   */
  detectSpecialVideos(document) {
    // Apple TV+ uses custom elements that may contain videos
    const applePlayer = document.querySelector('apple-tv-plus-player');
    if (applePlayer && applePlayer.shadowRoot) {
      const videos = applePlayer.shadowRoot.querySelectorAll('video');
      return Array.from(videos);
    }
    return [];
  }
}

// Create singleton instance
window.VSC.AppleHandler = AppleHandler;
