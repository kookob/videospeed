/**
 * One visible, viewport-anchored controller per document. Media controllers keep
 * their own speed/lifecycle state; only the last played video's UI is exposed.
 * Audio keeps its speed/shortcut support but never creates a visible toolbar.
 * Embedded players delegate their UI to the top document via a small protocol.
 * Messages carry commands, never source URLs or arbitrary executable code.
 */
window.VSC = window.VSC || {};

class FloatingController {
  constructor(config, actionHandler) {
    this.config = config;
    this.actionHandler = actionHandler;
    this.controllers = new Set();
    this.active = null;
    this.remote = null;
    this.delegated = false;
    this.position = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem('vsc-floating-position'));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        this.position = saved;
      }
    } catch {
      // Storage may be unavailable on sandboxed/private pages.
    }
    this.onResize = () => this.layout();
    this.onFullscreen = () => {
      this.mount();
      this.publish();
    };
    this.onMessage = (event) => this.receive(event);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onFullscreen);
    window.addEventListener('message', this.onMessage);
    this.onPageHide = () => {
      const active = this.active;
      this.active = null;
      this.publish();
      this.active = active;
    };
    this.onPageShow = () => {
      this.mount();
      this.publish();
    };
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    // Re-layout on show/hide (a hidden toolbar measures 0x0) and mirror the
    // state to the top document when running in a frame.
    this.stateObserver = new MutationObserver(() => {
      this.layout();
      this.publish(true);
    });
  }

  register(controller) {
    controller.div.dataset.vscInactive = '';
    this.styleHost(controller.div);
    // Mark audio inactive before returning: its underlying media controller
    // still exists for shortcuts, but flashes/visibility overrides cannot
    // expose its UI or let background audio replace the selected video.
    if (controller.video.tagName !== 'VIDEO') {
      return;
    }
    this.controllers.add(controller);
    // Do not show controls for every idle/preloaded video.
    if (!controller.video.paused && !controller.video.ended) {
      this.select(controller);
    }
  }

  select(controller) {
    if (!this.controllers.has(controller)) {
      return;
    }
    if (this.active) {
      this.active.div.dataset.vscInactive = '';
    }
    this.clearRemote();
    this.active = controller;
    this.stateObserver.disconnect();
    this.stateObserver.observe(controller.div, {
      attributes: true,
      attributeFilter: ['class', 'data-vsc-visibility'],
    });
    if (!this.config.settings.startHidden) {
      controller.div.classList.remove('vsc-hidden');
    }
    this.mount();
    this.publish();
  }

  unregister(controller) {
    this.controllers.delete(controller);
    this.deactivate(controller);
  }

  deactivate(controller) {
    if (this.active !== controller) {
      return;
    }
    controller.div.dataset.vscInactive = '';
    this.active = null;
    this.stateObserver.disconnect();
    this.publish();
    // Only fall back to another actually playing element, not an idle preview.
    const playing = [...this.controllers].find(
      (c) => c !== controller && !c.video.paused && !c.video.ended
    );
    if (playing) {
      this.select(playing);
    }
  }

  styleHost(host) {
    // Inline important declarations keep site and user CSS from repositioning
    // the host. The host occupies just the toolbar, never a page overlay.
    for (const [key, value] of Object.entries({
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: 'max-content',
      height: 'max-content',
      margin: '0',
      padding: '0',
      transform: 'none',
      'z-index': '2147483647',
    })) {
      host.style.setProperty(key, value, 'important');
    }
  }

  get host() {
    return this.remote?.host || this.active?.div;
  }

  mount() {
    const host = this.host;
    if (!host) {
      return;
    }
    const fullscreen = document.fullscreenElement;
    // A child frame's ordinary UI is rendered by the top document. In frame
    // fullscreen use the local toolbar because top-document overlays are hidden.
    const delegated = this.delegated && !fullscreen;
    if (delegated) {
      host.dataset.vscInactive = '';
    } else {
      delete host.dataset.vscInactive;
    }
    const parent = fullscreen || document.documentElement;
    if (host.parentNode !== parent) {
      parent.appendChild(host);
    }
    this.layout();
  }

  layout() {
    const host = this.host;
    if (!host) {
      return;
    }
    const inner = host.shadowRoot.querySelector('#controller');
    const rect = inner.getBoundingClientRect();
    // Hidden toolbars measure 0x0; fall back to the collapsed badge size.
    const width = rect.width || 52;
    const height = rect.height || 44;
    // client* excludes page scrollbars; inner* includes them (fallback for jsdom).
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const maxX = Math.max(0, vw - width - 12);
    const maxY = Math.max(0, vh - height - 12);
    const x = Math.max(0, Math.min(this.position?.x ?? maxX, maxX));
    const y = Math.max(0, Math.min(this.position?.y ?? vh * 0.3, maxY));
    host.style.setProperty('left', `${x}px`, 'important');
    host.style.setProperty('top', `${y}px`, 'important');
    // Expand hover buttons toward the roomier side so they stay on screen.
    host.dataset.vscExpand = x + width / 2 > vw / 2 ? 'left' : 'right';
  }

  move(x, y, save = false) {
    if (!this.host || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    this.position = { x, y };
    this.layout();
    if (save) {
      // Persist the clamped coordinates, not an offscreen pointer position.
      this.position = { x: parseFloat(this.host.style.left), y: parseFloat(this.host.style.top) };
      try {
        sessionStorage.setItem('vsc-floating-position', JSON.stringify(this.position));
      } catch {
        /* Optional persistence. */
      }
    }
  }

  publish(updateOnly = false) {
    if (window === window.top) {
      return;
    }
    const c = this.active;
    window.top.postMessage(
      {
        type: 'vsc-floating',
        kind: 'state',
        available: !!c && !document.fullscreenElement,
        updateOnly,
        speed: c?.video.playbackRate,
        visibility: c?.div.dataset.vscVisibility || 'auto',
        hidden: !!c?.div.classList.contains('vsc-hidden'),
        showing: !!c?.div.classList.contains('vsc-show'),
        noSource: !!c?.div.classList.contains('vsc-nosource'),
      },
      '*'
    );
  }

  receive(event) {
    const message = event.data;
    if (!message || message.type !== 'vsc-floating') {
      return;
    }
    if (window !== window.top) {
      if (event.source !== window.top) {
        return;
      }
      if (message.kind === 'release') {
        this.delegated = false;
        this.mount();
        return;
      }
      if (message.kind === 'ack') {
        this.delegated = true;
        this.mount();
        return;
      }
      if (message.kind !== 'command' || !this.active) {
        return;
      }
      const actions = ['faster', 'slower', 'reset', 'rewind', 'advance'];
      if (!actions.includes(message.action)) {
        return;
      }
      const value = message.wheel ? 0.1 : this.config.getKeyBinding(message.action);
      this.actionHandler.executeAction(message.action, value, this.active.video);
      this.publish();
      return;
    }
    // Accept only descendant frame windows, not unrelated windows/tabs.
    if (message.kind !== 'state' || !this.isChildFrame(event.source)) {
      return;
    }
    if (!message.available) {
      if (this.remote?.source === event.source) {
        this.clearRemote();
        // Mirror deactivate(): fall back to a local video that is still playing.
        if (this.active && !this.active.video.paused && !this.active.video.ended) {
          this.mount();
        }
      }
      return;
    }
    if (!Number.isFinite(message.speed) || message.speed <= 0) {
      return;
    }
    // ratechange from a background frame must not steal the current target.
    if (this.remote?.source !== event.source && message.updateOnly) {
      return;
    }
    event.source.postMessage({ type: 'vsc-floating', kind: 'ack' }, '*');
    if (this.active) {
      this.active.div.dataset.vscInactive = '';
    }
    if (this.remote?.source !== event.source) {
      this.createRemote(event.source);
    }
    const host = this.remote.host;
    host.dataset.vscVisibility = message.visibility;
    host.classList.toggle('vsc-hidden', !!message.hidden);
    host.classList.toggle('vsc-show', !!message.showing);
    host.classList.toggle('vsc-nosource', message.noSource);
    window.VSC.ShadowDOMManager.updateSpeedDisplay(host.shadowRoot, message.speed);
    this.mount();
  }

  isChildFrame(source) {
    const visit = (parent, depth = 0) => {
      if (depth > 20) {
        return false;
      }
      try {
        for (let i = 0; i < parent.frames.length; i++) {
          const child = parent.frames[i];
          if (child === source || visit(child, depth + 1)) {
            return true;
          }
        }
      } catch {
        /* Cross-origin frame tree access can be restricted. */
      }
      return false;
    };
    return source && source !== window && visit(window);
  }

  createRemote(source) {
    this.clearRemote();
    const host = document.createElement('vsc-controller');
    this.styleHost(host);
    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(host, {
      opacity: this.config.settings.controllerOpacity,
      buttonSize: this.config.settings.controllerButtonSize,
    });
    const video = { vsc: { div: host }, classList: host.classList };
    const send = (action, wheel = false) =>
      source.postMessage(
        {
          type: 'vsc-floating',
          kind: 'command',
          action,
          wheel,
        },
        '*'
      );
    new window.VSC.ControlsManager(
      {
        runAction: (action, value, event) => {
          if (action === 'drag') {
            window.VSC.DragHandler.handleDrag(video, event);
          } else {
            send(action);
          }
        },
        adjustSpeed: (target, delta) => send(delta > 0 ? 'faster' : 'slower', true),
      },
      this.config
    ).setupControlEvents(shadow, video);
    this.remote = { source, host };
    // Runs after every DOM mutation batch, so avoid the full frame-tree walk:
    // a removed frame's window reports closed (readable cross-origin).
    this.frameObserver = new MutationObserver(() => {
      if (this.remote?.source.closed) {
        this.clearRemote();
      }
    });
    this.frameObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  clearRemote() {
    this.frameObserver?.disconnect();
    this.frameObserver = null;
    this.remote?.host.remove();
    this.remote = null;
  }

  destroy() {
    this.remote?.source.postMessage({ type: 'vsc-floating', kind: 'release' }, '*');
    // Tell the parent to discard a toolbar owned by this frame.
    this.active = null;
    this.publish();
    this.clearRemote();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    window.removeEventListener('message', this.onMessage);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.stateObserver.disconnect();
    this.controllers.clear();
  }
}

window.VSC.FloatingController = FloatingController;
