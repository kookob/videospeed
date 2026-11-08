/**
 * Shadow DOM creation and management
 */

window.VSC = window.VSC || {};

class ShadowDOMManager {
  /**
   * Create shadow DOM for video controller
   * @param {HTMLElement} wrapper - Wrapper element
   * @param {Object} options - Configuration options
   * @returns {ShadowRoot} Created shadow root
   */
  static createShadowDOM(wrapper, options = {}) {
    const { speed = '1.00', opacity = 0.3, buttonSize = 14 } = options;

    const shadow = wrapper.attachShadow({ mode: 'open' });

    // Create style element with embedded CSS for immediate styling
    const style = document.createElement('style');
    style.textContent = `
      * {
        line-height: 1.8em;
        font-family: sans-serif;
        font-size: 13px;
      }

      /* The host is a viewport-fixed page toolbar (see floating-controller.js).
         It collapses to the speed badge; buttons overlay beside it on
         hover/focus, so expanding never moves the badge. */
      #controller {
        position: relative;
        background: black;
        color: white;
        border-radius: 6px;
        padding: 6px;
        box-shadow: 0 4px 16px #0005;
        opacity: ${opacity};
        max-width: calc(100vw - 12px);
        box-sizing: border-box;
        cursor: default;
        white-space: nowrap;
      }

      /* Hide the automatic layer without disturbing any explicit override. */
      :host(.vsc-hidden) #controller {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* Explicit show and temporary speed feedback outrank automatic hiding,
         including startHidden and site autohide. */
      :host([data-vsc-visibility="show"]) #controller,
      :host(.vsc-show) #controller {
        display: block !important;
        visibility: visible !important;
        opacity: ${opacity} !important;
      }

      /* Interacting with the toolbar makes it fully opaque. */
      :host(:hover) #controller,
      :host(:focus-within) #controller,
      :host #controller.dragging {
        opacity: 1 !important;
      }

      /* Explicit hide and unavailable media are final: flashes and user show
         overrides must not reveal them. */
      :host([data-vsc-visibility="hide"]) #controller,
      :host(.vsc-nosource) #controller {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* Inactive media must stay hidden even during shortcut feedback. */
      :host([data-vsc-inactive]) #controller {
        display: none !important;
        visibility: hidden !important;
      }

      #controls {
        display: none;
        position: absolute;
        top: 0;
        bottom: 0;
        left: 100%;
        align-items: center;
        padding: 0 6px 0 0;
        background: black;
        border-radius: 6px;
      }

      :host([data-vsc-expand="left"]) #controls {
        left: auto;
        right: 100%;
        padding: 0 0 0 6px;
      }

      :host(:hover) #controls,
      #controller:focus-within #controls,
      #controller.dragging #controls {
        display: flex;
      }

      #controller.dragging {
        cursor: -webkit-grabbing;
      }

      .draggable {
        cursor: -webkit-grab;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.8em;
        height: 1.4em;
        min-height: 32px;
        text-align: center;
        vertical-align: middle;
        box-sizing: border-box;
        touch-action: none;
      }

      .draggable:active {
        cursor: -webkit-grabbing;
      }

      button {
        opacity: 1;
        cursor: pointer;
        color: black;
        background: white;
        font-weight: normal;
        border-radius: 5px;
        padding: 1px 5px 3px 5px;
        min-width: 32px;
        min-height: 32px;
        font-size: inherit;
        line-height: inherit;
        border: 0px solid white;
        font-family: "Lucida Console", Monaco, monospace;
        margin: 0px 2px 2px 2px;
        touch-action: manipulation;
        transition: background 0.2s, color 0.2s;
      }

      button:focus {
        outline: 0;
      }

      button:focus-visible {
        outline: 2px solid #60baff;
        outline-offset: 2px;
      }

      button:hover {
        opacity: 1;
        background: #2196f3;
        color: #ffffff;
      }

      button:active {
        background: #2196f3;
        color: #ffffff;
        font-weight: bold;
      }

      button.rw {
        opacity: 0.65;
      }
    `;
    shadow.appendChild(style);

    // Create controller div
    const controller = document.createElement('div');
    controller.id = 'controller';

    // Create draggable speed indicator
    const draggable = document.createElement('span');
    draggable.setAttribute('data-action', 'drag');
    draggable.className = 'draggable';
    draggable.title = 'Drag to move; double-click to reset speed';
    draggable.style.cssText = `font-size: ${buttonSize}px;`;
    draggable.textContent = speed;
    controller.appendChild(draggable);

    // Create controls span
    const controls = document.createElement('span');
    controls.id = 'controls';
    controls.style.cssText = `font-size: ${buttonSize}px; line-height: ${buttonSize}px;`;

    // Create buttons
    const buttons = [
      { action: 'rewind', text: '«', class: 'rw' },
      { action: 'slower', text: '−', class: '' },
      { action: 'faster', text: '+', class: '' },
      { action: 'advance', text: '»', class: 'rw' },
    ];

    buttons.forEach((btnConfig) => {
      const button = document.createElement('button');
      button.type = 'button';
      const labels = {
        rewind: 'Rewind',
        slower: 'Decrease speed',
        faster: 'Increase speed',
        advance: 'Fast forward',
      };
      button.setAttribute('aria-label', labels[btnConfig.action]);
      button.title = labels[btnConfig.action];
      button.setAttribute('data-action', btnConfig.action);
      if (btnConfig.class) {
        button.className = btnConfig.class;
      }
      button.textContent = btnConfig.text;
      controls.appendChild(button);
    });

    controller.appendChild(controls);
    shadow.appendChild(controller);

    window.VSC.logger.debug('Shadow DOM created for video controller');
    return shadow;
  }

  /**
   * Get controller element from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Controller element
   */
  static getController(shadow) {
    return shadow.querySelector('#controller');
  }

  /**
   * Get draggable speed indicator from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Speed indicator element
   */
  static getSpeedIndicator(shadow) {
    return shadow.querySelector('.draggable');
  }

  /**
   * Update speed display in shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @param {number} speed - New speed value
   */
  static updateSpeedDisplay(shadow, speed) {
    const speedIndicator = this.getSpeedIndicator(shadow);
    if (speedIndicator) {
      speedIndicator.textContent = window.VSC.Constants.formatSpeed(speed);
    }
  }
}

// Create singleton instance
window.VSC.ShadowDOMManager = ShadowDOMManager;
