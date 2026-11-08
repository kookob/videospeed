/**
 * Facebook-specific handler
 */

window.VSC = window.VSC || {};

class FacebookHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Facebook
   * @returns {boolean} True if on Facebook
   */
  static matches() {
    return location.hostname === 'www.facebook.com';
  }

  /**
   * Check if video should be ignored on Facebook
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video) {
    // Ignore story videos and other non-main content
    return (
      video.closest('[data-story-id]') !== null ||
      video.closest('.story-bucket-container') !== null ||
      video.getAttribute('data-video-width') === '0'
    );
  }
}

// Create singleton instance
window.VSC.FacebookHandler = FacebookHandler;
