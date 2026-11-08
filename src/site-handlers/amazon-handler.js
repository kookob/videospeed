/**
 * Amazon Prime Video handler
 */

window.VSC = window.VSC || {};

class AmazonHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Amazon
   * @returns {boolean} True if on Amazon
   */
  static matches() {
    return (
      location.hostname === 'www.amazon.com' ||
      location.hostname === 'www.primevideo.com' ||
      location.hostname.includes('amazon.') ||
      location.hostname.includes('primevideo.')
    );
  }

  /**
   * Check if video should be ignored on Amazon
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video) {
    // Don't reject videos that are still loading
    if (video.readyState < 2) {
      return false;
    }

    // Ignore product preview videos that are too small
    const rect = video.getBoundingClientRect();
    return rect.width < 200 || rect.height < 100;
  }
}

// Create singleton instance
window.VSC.AmazonHandler = AmazonHandler;
