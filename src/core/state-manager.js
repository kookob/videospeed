/**
 * Video Speed Controller State Manager
 * Tracks media elements for popup and keyboard commands.
 */

window.VSC = window.VSC || {};

class VSCStateManager {
  constructor() {
    // Map of controllerId → controller instance
    this.controllers = new Map();

    window.VSC.logger?.debug('VSCStateManager initialized');
  }

  /**
   * Register a new controller
   * @param {VideoController} controller - Controller instance to register
   */
  registerController(controller) {
    if (!controller || !controller.controllerId) {
      window.VSC.logger?.warn('Invalid controller registration attempt');
      return;
    }

    // Store controller info for compatibility with tests
    const controllerInfo = {
      controller: controller,
      element: controller.video,
      tagName: controller.video?.tagName,
      videoSrc: controller.video?.src || controller.video?.currentSrc,
      created: Date.now(),
    };

    this.controllers.set(controller.controllerId, controllerInfo);
    window.VSC.logger?.debug(`Controller registered: ${controller.controllerId}`);
  }

  /**
   * Unregister a controller
   * @param {string} controllerId - ID of controller to unregister
   */
  unregisterController(controllerId) {
    if (this.controllers.has(controllerId)) {
      this.controllers.delete(controllerId);
      window.VSC.logger?.debug(`Controller unregistered: ${controllerId}`);
    }
  }

  /**
   * Get all registered media elements
   * @returns {Array<HTMLMediaElement>} Array of media elements
   */
  getAllMediaElements() {
    const elements = [];

    // Skip, but keep, detached media: dropping the registration here without
    // VideoController.remove() would leave video.vsc set, so the same element
    // reinserted later could never be controlled again. remove() unregisters.
    for (const info of this.controllers.values()) {
      const video = info.controller?.video || info.element;
      if (video && video.isConnected) {
        elements.push(video);
      }
    }

    return elements;
  }

  /**
   * Compatibility method - same as unregisterController
   * @param {string} controllerId - ID of controller to remove
   */
  removeController(controllerId) {
    this.unregisterController(controllerId);
  }

  /**
   * Compatibility method - same as getAllMediaElements
   * @returns {Array<HTMLMediaElement>} Array of media elements
   */
  getControlledElements() {
    return this.getAllMediaElements();
  }
}

// Create singleton instance
window.VSC.StateManager = VSCStateManager;
window.VSC.stateManager = new VSCStateManager();

window.VSC.logger?.info('State Manager module loaded');
