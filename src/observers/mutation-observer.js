/**
 * DOM mutation observer for detecting video elements
 */

window.VSC = window.VSC || {};

class VideoMutationObserver {
  constructor(config, onVideoFound, onVideoRemoved, mediaObserver) {
    this.config = config;
    this.onVideoFound = onVideoFound;
    this.onVideoRemoved = onVideoRemoved;
    this.mediaObserver = mediaObserver;
    this.observer = null;
    // Roots are weakly held so detached shadow trees can be collected; the
    // observers themselves are kept so stop() can disconnect them.
    this.observedShadowRoots = new WeakSet();
    this.shadowObservers = [];
  }

  /**
   * Start observing DOM mutations
   * @param {Document} document - Document to observe
   */
  start(document) {
    this.observer = new MutationObserver((mutations) => {
      // Process mutations when the browser is genuinely idle — no forced timeout.
      // Sites do async post-load init that's sensitive to DOM insertions; a
      // forced timeout can fire during that window.
      requestIdleCallback(() => {
        this.processMutations(mutations);
      });
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method', 'style', 'class'],
      childList: true,
      subtree: true,
    };

    this.observer.observe(document, observerOptions);
    window.VSC.logger.debug('Video mutation observer started');
  }

  /**
   * Process mutation events
   * @param {Array<MutationRecord>} mutations - Mutation records
   * @private
   */
  processMutations(mutations) {
    // Sites emit many style/class records per element per batch; recheck each
    // element once.
    const visibilityTargets = new Set();
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        this.processChildListMutation(mutation);
      } else if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
        visibilityTargets.add(mutation.target);
      } else if (mutation.type === 'attributes') {
        this.processAttributeMutation(mutation);
      }
    });
    visibilityTargets.forEach((element) => this.handleVisibilityChanges(element));
  }

  /**
   * Process child list mutations (added/removed nodes)
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processChildListMutation(mutation) {
    // Handle added nodes
    mutation.addedNodes.forEach((node) => {
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (node === document.documentElement) {
        // Document was replaced (e.g., watch.sling.com uses document.write).
        // Reinitialization is not supported; skip the new root.
        window.VSC.logger.warn('Document replacement detected - full reinitialization needed');
        return;
      }

      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, true);
    });

    // Handle removed nodes
    mutation.removedNodes.forEach((node) => {
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, false);
    });
  }

  /**
   * Process attribute mutations
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processAttributeMutation(mutation) {
    // Apple TV+ player (aria-hidden / data-focus-method records only; style
    // and class records are routed to handleVisibilityChanges).
    if (
      mutation.target.getAttribute('aria-hidden') === 'false' ||
      mutation.target.nodeName === 'APPLE-TV-PLUS-PLAYER'
    ) {
      const videoNodes = window.VSC.DomUtils.findShadowMedia(document, 'video');

      for (const node of videoNodes) {
        // Only add vsc the first time for the apple-tv case
        if (node.vsc && mutation.target.nodeName === 'APPLE-TV-PLUS-PLAYER') {
          continue;
        }

        if (node.vsc) {
          node.vsc.remove();
        }

        this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, true);
      }
    }
  }

  /**
   * Handle visibility changes on elements that might contain videos
   * @param {Element} element - Element that had style/class changes
   * @private
   */
  handleVisibilityChanges(element) {
    // If the element itself is a video
    if (
      element.tagName === 'VIDEO' ||
      (element.tagName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      this.recheckVideoElement(element);
      return;
    }

    // Check if element contains videos
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';
    const videos = element.querySelectorAll ? element.querySelectorAll(mediaTagSelector) : [];

    videos.forEach((video) => {
      this.recheckVideoElement(video);
    });
  }

  /**
   * Re-check if a video element should have a controller attached
   * @param {HTMLMediaElement} video - Video element to recheck
   * @private
   */
  recheckVideoElement(video) {
    if (!this.mediaObserver) {
      return;
    }

    if (video.vsc) {
      // The floating toolbar is independent of player geometry, so a still-valid
      // video needs no update; only retire controllers whose media became invalid.
      if (!this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became invalid, removing controller');
        video.vsc.remove();
      }
    } else {
      // Video doesn't have controller, check if it should get one
      if (this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became valid, attaching controller');
        this.onVideoFound(video, video.parentElement || video.parentNode);
      }
    }
  }

  /**
   * Check if node is or contains video elements
   * @param {Node} node - Node to check
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added, false if removed
   * @private
   */
  checkForVideoAndShadowRoot(node, parent, added) {
    // Only proceed with removal if node is missing from DOM
    // isConnected also sees nodes moved within shadow trees.
    if (!added && node.isConnected) {
      return;
    }

    if (
      node.nodeName === 'VIDEO' ||
      (node.nodeName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      if (added) {
        this.onVideoFound(node, parent);
      } else {
        // Removal also retires a deferred loadeddata listener for media that
        // was discovered before it was ready, so this callback must run even
        // before a VideoController has been attached.
        this.onVideoRemoved(node);
      }
    } else {
      this.processNodeChildren(node, parent, added);
    }
  }

  /**
   * Process children of a node recursively
   * @param {Node} node - Node to process
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added
   * @private
   */
  processNodeChildren(node, parent, added) {
    let children = [];

    // Handle shadow DOM
    if (node.shadowRoot) {
      if (added) {
        this.observeShadowRoot(node.shadowRoot);
      }
      children = Array.from(node.shadowRoot.children);
    }

    // Handle regular children
    if (node.children) {
      children = [...children, ...Array.from(node.children)];
    }

    // Process all children
    for (const child of children) {
      this.checkForVideoAndShadowRoot(child, child.parentNode || parent, added);
    }
  }

  /**
   * Set up observer for shadow root
   * @param {ShadowRoot} shadowRoot - Shadow root to observe
   * @private
   */
  observeShadowRoot(shadowRoot) {
    if (this.observedShadowRoots.has(shadowRoot)) {
      return; // Already observing
    }

    const shadowObserver = new MutationObserver((mutations) => {
      requestIdleCallback(
        () => {
          this.processMutations(mutations);
        },
        { timeout: 500 }
      );
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method'],
      childList: true,
      subtree: true,
    };

    shadowObserver.observe(shadowRoot, observerOptions);
    this.observedShadowRoots.add(shadowRoot);
    this.shadowObservers.push(shadowObserver);

    window.VSC.logger.debug('Shadow root observer added');
  }

  /**
   * Stop observing and clean up
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Shadow observers outlive the main observer unless disconnected; left
    // running they would keep processing mutations after teardown.
    this.shadowObservers.forEach((observer) => observer.disconnect());
    this.shadowObservers = [];
    this.observedShadowRoots = new WeakSet();

    window.VSC.logger.debug('Video mutation observer stopped');
  }
}

// Create singleton instance
window.VSC.VideoMutationObserver = VideoMutationObserver;
