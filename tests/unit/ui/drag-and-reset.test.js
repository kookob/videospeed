/**
 * Tests for unified pointer-based drag and double-click-to-reset
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';
import { createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
let mockDOM;

describe('DragAndReset', () => {
  beforeEach(() => {
    installChromeMock();
    resetMockStorage();
    mockDOM = createMockDOM();

    if (window.VSC && window.VSC.stateManager) {
      window.VSC.stateManager.controllers.clear();
    }
    if (window.VSC && window.VSC.siteHandlerManager) {
      window.VSC.siteHandlerManager.initialize(document);
    }
  });

  afterEach(() => {
    cleanupChromeMock();
    if (window.VSC && window.VSC.stateManager) {
      window.VSC.stateManager.controllers.clear();
    }
    document.querySelectorAll('video, audio').forEach((el) => el.remove());
    if (mockDOM) {
      mockDOM.cleanup();
    }
  });

  // --- DragHandler tests ---

  it('DragHandler.handleDrag moves the floating toolbar with pointer capture', async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();
    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);
    const floating = new window.VSC.FloatingController(config, actionHandler);
    window.VSC.floatingController = floating;

    try {
      const mockVideo = createMockVideo({ paused: false, readyState: 2 });
      mockDOM.container.appendChild(mockVideo);
      const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);
      floating.move(100, 100);

      const shadowController = controller.div.shadowRoot.querySelector('#controller');
      const draggable = controller.div.shadowRoot.querySelector('.draggable');
      let captured = false;
      draggable.setPointerCapture = () => {
        captured = true;
      };

      const pointer = (type, x, y) => {
        const event = new Event(type);
        event.clientX = x;
        event.clientY = y;
        event.pointerId = 1;
        event.button = 0;
        Object.defineProperty(event, 'target', { value: draggable });
        return event;
      };

      window.VSC.DragHandler.handleDrag(mockVideo, pointer('pointerdown', 10, 10));
      expect(captured).toBe(true);
      expect(shadowController.classList.contains('dragging')).toBe(true);

      draggable.dispatchEvent(pointer('pointermove', 30, 50));
      expect(parseFloat(controller.div.style.left)).toBe(120);
      expect(parseFloat(controller.div.style.top)).toBe(140);

      draggable.dispatchEvent(pointer('pointerup', 30, 50));
      expect(shadowController.classList.contains('dragging')).toBe(false);
      expect(JSON.parse(localStorage.getItem('vsc-floating-position'))).toEqual({
        x: 120,
        y: 140,
      });
      controller.remove();
    } finally {
      floating.destroy();
      window.VSC.floatingController = null;
      localStorage.clear();
    }
  });

  // --- Double-click-to-reset tests ---

  it('ControlsManager sets up dblclick handler on draggable', async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();
    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const mockVideo = createMockVideo();
    mockDOM.container.appendChild(mockVideo);
    const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

    // Change speed away from 1.0
    mockVideo.playbackRate = 2.0;
    if (mockVideo.vsc.speedIndicator) {
      mockVideo.vsc.speedIndicator.textContent = '2.00';
    }

    // Track if reset was called
    let resetCalled = false;
    const origRunAction = actionHandler.runAction.bind(actionHandler);
    actionHandler.runAction = (action, value, e) => {
      if (action === 'reset') {
        resetCalled = true;
      }
      return origRunAction(action, value, e);
    };

    // Dispatch dblclick on the draggable
    const draggable = controller.div.shadowRoot.querySelector('.draggable');
    const dblClickEvent = new Event('dblclick', { bubbles: true, cancelable: true });
    Object.defineProperty(dblClickEvent, 'target', { value: draggable, writable: true });
    draggable.dispatchEvent(dblClickEvent);

    expect(resetCalled).toBe(true);
  });

  it('Draggable element has touch-action: none in style', async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();
    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const mockVideo = createMockVideo();
    mockDOM.container.appendChild(mockVideo);
    const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

    // Check that the shadow DOM style contains touch-action: none for .draggable
    const style = controller.div.shadowRoot.querySelector('style');
    expect(style.textContent.includes('touch-action: none')).toBe(true);
  });
});
