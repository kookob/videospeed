/**
 * YouTube-specific handler
 */

window.VSC = window.VSC || {};

class YouTubeHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to YouTube
   * @param {string} [hostname] - Injectable for tests; defaults to live location
   * @returns {boolean} True if on YouTube
   */
  static matches(hostname = location.hostname) {
    // youtube-nocookie.com is the privacy-enhanced embed host: identical
    // player build, DOM, and control layers. music.youtube.com stays
    // excluded — different player shell.
    return hostname === 'www.youtube.com' || hostname === 'www.youtube-nocookie.com';
  }

  // YouTube autohide is handled by domain-scoped light-DOM CSS in
  // controller-css-defaults.js. The descendant selector reacts to YouTube's
  // page-owned class without forwarding state through a MutationObserver.

  /**
   * Press-and-hold 2x boost (#1554/#1568): the pointer variant fires a
   * ratechange while the pointer is still down, before any click event
   * exists (PR #1555). The SPACEBAR variant of the same boost armed via
   * legacy any-key-arming — narrowed away by TARGET_RULES — so Space must
   * arm here explicitly (held Space auto-repeats keydown, keeping the
   * gesture window fresh through the hold and across the release reset).
   * Scoped to this handler's matches() hosts: www.youtube.com and the
   * privacy-enhanced embed host, which serve the identical player.
   * (#1581 needs no entry: click-seek resets go to 1.0, and a 1.0 adoption
   * requires STRONG evidence under the classifier's tiered rules.)
   * @returns {Object} Classifier rule activations for YouTube
   */
  getClassifierRules() {
    return YouTubeHandler.CLASSIFIER_RULES;
  }

  /**
   * Associate a gesture in YouTube player chrome with exactly one controlled
   * video. Player controls are overlays/siblings rather than video children,
   * so EventManager's direct composed-path resolution cannot see them.
   *
   * This deliberately recognizes the whole player chrome, including seek
   * controls: it only prevents a click for player A from blessing player B;
   * it does not claim to distinguish a seek from a native speed-menu action.
   * @param {Event} event
   * @param {HTMLMediaElement[]} mediaElements
   * @returns {HTMLMediaElement|null}
   */
  resolveGestureMedia(event, mediaElements) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const matches = mediaElements.filter((video) => this.gestureBelongsToVideo(path, video));
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * @param {EventTarget[]} path
   * @param {HTMLMediaElement} video
   * @returns {boolean}
   * @private
   */
  gestureBelongsToVideo(path, video) {
    const player =
      video.closest?.('.html5-video-player') ||
      video.closest?.('#movie_player') ||
      video.closest?.('.ytp-player-content');
    if (!player) {
      return false;
    }

    const includes = (container) =>
      !!container &&
      path.some((node) => node === container || (node?.nodeType && container.contains(node)));
    if (includes(player)) {
      return true;
    }

    // Embedded players place #player-controls alongside the player in the
    // common parent stacking context. Scope it to that parent so a desktop
    // page's unrelated global ID cannot claim this video.
    const embeddedControls = Array.from(player.parentElement?.children || []).find(
      (child) => child.id === 'player-controls'
    );
    return includes(embeddedControls);
  }

  /**
   * Check if video should be ignored on YouTube
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video) {
    // Ignore thumbnail videos and ads
    return (
      video.classList.contains('video-thumbnail') ||
      video.parentElement?.classList.contains('ytp-ad-player-overlay')
    );
  }

  /**
   * Handle special video detection for YouTube
   * @param {Document} document - Document object
   * @returns {Array<HTMLMediaElement>} Additional videos found
   */
  detectSpecialVideos(document) {
    const videos = [];

    // Look for videos in iframes (embedded players)
    try {
      const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');
      iframes.forEach((iframe) => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc) {
            const iframeVideos = iframeDoc.querySelectorAll('video');
            videos.push(...Array.from(iframeVideos));
          }
        } catch {
          // Cross-origin iframe, ignore
        }
      });
    } catch (e) {
      window.VSC.logger.debug(`Could not access YouTube iframe videos: ${e.message}`);
    }

    return videos;
  }
}

YouTubeHandler.CLASSIFIER_RULES = Object.freeze({ pointerHoldArms: true, spacebarArms: true });

// Create singleton instance
window.VSC.YouTubeHandler = YouTubeHandler;
