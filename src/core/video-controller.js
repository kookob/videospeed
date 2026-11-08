/**
 * Video Controller class for managing individual video elements
 *
 */

window.VSC = window.VSC || {};

class VideoController {
  constructor(target, parent, config, actionHandler, shouldStartHidden = false) {
    // Return existing controller if already attached
    if (target.vsc) {
      return target.vsc;
    }

    this.video = target;
    this.config = config;
    this.actionHandler = actionHandler;
    // Lifecycle decisions come from the document coordinator, which shares
    // desired authority while keeping conflict state keyed by media element.
    // Standalone construction only uses lifecycle reads, so a local fallback
    // remains safe for controller-only tests.
    this.arbitration =
      (actionHandler && actionHandler.eventManager && actionHandler.eventManager.arbitration) ||
      new window.VSC.SpeedArbitration(config, null);
    this.controlsManager = new window.VSC.ControlsManager(actionHandler, config);
    this.shouldStartHidden = shouldStartHidden;

    // Generate unique controller ID for badge tracking
    this.controllerId = this.generateControllerId(target);

    // Transient reset memory (not persisted, instance-specific)
    this.speedBeforeReset = null;
    this.positionBeforeJump = null;

    // Attach controller to video element first (needed for adjustSpeed)
    target.vsc = this;

    // Register with state manager immediately after controller is attached
    if (window.VSC.stateManager) {
      window.VSC.stateManager.registerController(this);
    } else {
      window.VSC.logger.error('StateManager not available during VideoController initialization');
    }

    // Initialize speed
    this.initializeSpeed();

    // Create UI
    this.div = this.initializeControls();
    window.VSC.floatingController?.register(this);

    // Set up event handlers
    this.setupEventHandlers();

    // Set up mutation observer for src changes
    this.setupMutationObserver();

    window.VSC.logger.info('VideoController initialized for video element');
  }

  /**
   * Initialize video speed based on settings.
   *
   * Lifecycle writes execute WRITE + SYNC_UI only — never PERSIST (cell 6,
   * persistence purity I2): re-asserting existing authority must not
   * refresh it or leak an initialization value into storage.
   * @private
   */
  initializeSpeed() {
    // Defer until metadata is loaded — setting playbackRate before the player
    // has initialized can race with the site's own init sequence. Recompute
    // the target at execution time because another player may claim a newer
    // shared authority while this media is still loading.
    if (this.video.readyState < 1) {
      window.VSC.logger.debug('Deferring initializeSpeed until loadedmetadata');
      this.handleLoadedMetadata = () => {
        this.video.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
        this.handleLoadedMetadata = null;
        this.applyLifecycleSpeed('loadedmetadata');
      };
      this.video.addEventListener('loadedmetadata', this.handleLoadedMetadata);
      return;
    }

    this.applyLifecycleSpeed('initializeSpeed');
  }

  /**
   * Execute a lifecycle write only while this controller remains attached.
   * @param {string} eventType
   * @private
   */
  applyLifecycleSpeed(eventType) {
    if (this.video.vsc !== this || !this.actionHandler) {
      return;
    }

    // Mark the (re)initialization moment before deciding whether to write:
    // sites commonly answer this phase with their own playbackRate = 1.0,
    // which must not read as a user's menu choice even when no restore was
    // needed (classifier MEDIA_INIT_GRACE_MS).
    if (eventType === 'initializeSpeed' || eventType === 'loadedmetadata') {
      this.arbitration.classifier?.observeMediaInit(this.video, performance.now());
    }

    const targetSpeed = this.arbitration.lifecycleTarget(this.video);
    if (targetSpeed === null) {
      window.VSC.logger.debug(
        `${eventType}: no authoritative target, leaving playbackRate=${this.video.playbackRate}`
      );
      return;
    }
    if (targetSpeed === this.video.playbackRate) {
      return;
    }

    window.VSC.logger.info(`${eventType}: restoring speed to ${targetSpeed}`);
    this.actionHandler.writeRate(this.video, targetSpeed);
    this.actionHandler.syncIndicator(this.video, targetSpeed);
  }

  /**
   * Initialize video controller UI
   * @returns {HTMLElement} Controller wrapper element
   * @private
   */
  initializeControls() {
    window.VSC.logger.debug('initializeControls Begin');

    const document = this.video.ownerDocument;
    const speed = window.VSC.Constants.formatSpeed(this.video.playbackRate);

    window.VSC.logger.debug(`Speed variable set to: ${speed}`);

    // Custom element wrapper to avoid CSS conflicts. Deliberately left
    // unregistered (no customElements.define): custom-elements-es5-adapter
    // polyfills break native class constructors (#1458), and hyphenated tags
    // work for CSS, querySelector and shadow DOM without registration.
    const wrapper = document.createElement('vsc-controller');

    // Apply all CSS classes at once to prevent race condition flash
    const cssClasses = ['vsc-controller'];

    // Only hide controller if video has no source AND is not ready/functional
    // This prevents hiding controllers for live streams or dynamically loaded videos
    if (!this.video.currentSrc && !this.video.src && this.video.readyState < 2) {
      cssClasses.push('vsc-nosource');
    }

    if (this.config.settings.startHidden || this.shouldStartHidden) {
      cssClasses.push('vsc-hidden');
      window.VSC.logger.debug('Starting controller hidden');
    }
    // When startHidden=false, use natural visibility (no special class needed)

    // Apply all classes at once to prevent visible flash
    wrapper.className = cssClasses.join(' ');

    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      speed: speed,
      opacity: this.config.settings.controllerOpacity,
      buttonSize: this.config.settings.controllerButtonSize,
    });

    // Set up control events
    this.controlsManager.setupControlEvents(shadow, this.video);

    // Store speed indicator reference
    this.speedIndicator = window.VSC.ShadowDOMManager.getSpeedIndicator(shadow);

    // The page-level floating toolbar positions this host; mounting it on
    // <html> keeps it outside the player's click/capture hierarchy.
    document.documentElement.appendChild(wrapper);

    window.VSC.logger.debug('initializeControls End');
    return wrapper;
  }

  /**
   * Set up event handlers for media events
   * @private
   */
  setupEventHandlers() {
    const mediaEventAction = (event) => {
      this.applyLifecycleSpeed(event.type);
    };

    // Bind event handlers. Seek evidence is recorded before the readyState
    // restore guard so initialization-time seeks can explain a 1.0 reset.
    this.handlePlay = (event) => {
      mediaEventAction(event);
      window.VSC.floatingController?.select(this);
    };
    this.handleFloatingRate = () => {
      if (window.VSC.floatingController?.active === this) {
        window.VSC.floatingController.publish(true);
      }
    };
    this.video.addEventListener('ratechange', this.handleFloatingRate);
    this.handleFloatingStop = () => {
      window.VSC.floatingController?.deactivate(this);
    };
    this.video.addEventListener('ended', this.handleFloatingStop);
    this.video.addEventListener('emptied', this.handleFloatingStop);
    this.handleSeekEvidence = (event) => {
      this.arbitration.classifier?.observeSeek(this.video, event.timeStamp);
    };
    this.handleSeek = (event) => {
      this.handleSeekEvidence(event);
      if (event.target.readyState < 2) {
        return;
      }
      mediaEventAction.call(this, event);
    };
    this.handleMediaInit = (event) => {
      this.arbitration.clearEchoTransaction(this.video);
      this.arbitration.classifier?.observeMediaInit(this.video, event.timeStamp);
    };

    // `seeking` covers resets during an active seek; `seeked` refreshes the
    // evidence window after slow seeks while retaining its lifecycle restore.
    // `loadstart` marks a resource boundary on a reused element; ordinary MSE
    // representation switches need not emit it.
    this.video.addEventListener('play', this.handlePlay);
    this.video.addEventListener('seeking', this.handleSeekEvidence);
    this.video.addEventListener('seeked', this.handleSeek);
    this.video.addEventListener('loadstart', this.handleMediaInit);

    window.VSC.logger.debug('Added media event handlers: play, seeking, seeked, loadstart');
  }

  /**
   * Set up mutation observer for src attribute changes
   * @private
   */
  setupMutationObserver() {
    this.targetObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // currentSrc is an IDL property, never an attribute mutation.
        if (mutation.attributeName === 'src') {
          window.VSC.logger.debug('Mutation of A/V element detected');
          const controller = this.div;
          if (!mutation.target.src && !mutation.target.currentSrc) {
            controller.classList.add('vsc-nosource');
          } else {
            controller.classList.remove('vsc-nosource');
          }
          if (window.VSC.floatingController?.active === this) {
            window.VSC.floatingController.publish(true);
          }
        }
      });
    });

    this.targetObserver.observe(this.video, {
      attributeFilter: ['src'],
    });
  }

  /**
   * Remove controller and clean up
   */
  remove() {
    window.VSC.logger.debug('Removing VideoController');

    // A detached controller must not be retained or mutated by a pending
    // visibility flash callback after its media/controller lifecycle ends.
    if (this.div?.flashTimer !== undefined) {
      clearTimeout(this.div.flashTimer);
      this.div.flashTimer = undefined;
    }

    window.VSC.floatingController?.unregister(this);
    if (this.handleFloatingRate) {
      this.video.removeEventListener('ratechange', this.handleFloatingRate);
      this.handleFloatingRate = null;
    }
    if (this.handleFloatingStop) {
      this.video.removeEventListener('ended', this.handleFloatingStop);
      this.video.removeEventListener('emptied', this.handleFloatingStop);
      this.handleFloatingStop = null;
    }

    // Remove DOM element
    if (this.div && this.div.parentNode) {
      this.div.remove();
    }

    // Remove event listeners
    if (this.handlePlay) {
      this.video.removeEventListener('play', this.handlePlay);
      this.handlePlay = null;
    }
    if (this.handleSeek) {
      this.video.removeEventListener('seeked', this.handleSeek);
      this.handleSeek = null;
    }
    if (this.handleSeekEvidence) {
      this.video.removeEventListener('seeking', this.handleSeekEvidence);
      this.handleSeekEvidence = null;
    }
    if (this.handleMediaInit) {
      this.video.removeEventListener('loadstart', this.handleMediaInit);
      this.handleMediaInit = null;
    }
    if (this.handleLoadedMetadata) {
      this.video.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
      this.handleLoadedMetadata = null;
    }

    // Disconnect mutation observer
    if (this.targetObserver) {
      this.targetObserver.disconnect();
    }

    // Remove from state manager
    if (window.VSC.stateManager) {
      window.VSC.stateManager.removeController(this.controllerId);
    }

    // Release per-media conflict/timer/echo state before detaching the
    // controller reference that EventManager uses to identify controlled media.
    this.arbitration.release(this.video);

    // Remove reference from video element
    delete this.video.vsc;

    window.VSC.logger.debug('VideoController removed successfully');
  }

  /**
   * Generate unique controller ID for badge tracking
   * @param {HTMLElement} target - Video/audio element
   * @returns {string} Unique controller ID
   * @private
   */
  generateControllerId(target) {
    const timestamp = Date.now();
    const src = target.currentSrc || target.src || 'no-src';
    const tagName = target.tagName.toLowerCase();

    // Create a simple hash from src for uniqueness
    const srcHash = src.split('').reduce((hash, char) => {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      return hash & hash; // Convert to 32-bit integer
    }, 0);

    const random = Math.floor(Math.random() * 1000);
    return `${tagName}-${Math.abs(srcHash)}-${timestamp}-${random}`;
  }
}

// Create singleton instance
window.VSC.VideoController = VideoController;

// Global variables available for both browser and testing
