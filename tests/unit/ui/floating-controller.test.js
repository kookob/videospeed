import { vi } from 'vitest';
import { createMockVideo } from '../../helpers/test-utils.js';

describe('page floating controller', () => {
  let manager, config, actions;
  const controllers = [];

  beforeEach(() => {
    localStorage.clear();
    config = window.VSC.videoSpeedConfig;
    config.settings.startHidden = false;
    config.settings.audioBoolean = true;
    const events = new window.VSC.EventManager(config, null);
    actions = new window.VSC.ActionHandler(config, events);
    manager = new window.VSC.FloatingController(config, actions);
    window.VSC.floatingController = manager;
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) {
      controller.remove();
    }
    actions.eventManager.cleanup();
    manager.destroy();
    window.VSC.floatingController = null;
    document.querySelectorAll('vsc-controller, .test-player, iframe').forEach((el) => el.remove());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function add(paused = true, kind = 'video') {
    const player = document.createElement('div');
    player.className = 'test-player';
    document.body.appendChild(player);
    const video =
      kind === 'audio'
        ? document.createElement('audio')
        : createMockVideo({ paused, readyState: 2 });
    if (kind === 'audio') {
      video.src = 'https://example.com/background.mp3';
      Object.defineProperties(video, {
        paused: { configurable: true, writable: true, value: paused },
        readyState: { configurable: true, value: 2 },
      });
    }
    player.appendChild(video);
    const controller = new window.VSC.VideoController(video, player, config, actions);
    controllers.push(controller);
    return controller;
  }

  function play(controller) {
    controller.video.paused = false;
    controller.video.dispatchEvent(
      controller.video.tagName === 'AUDIO'
        ? new Event('play')
        : { type: 'play', timeStamp: performance.now() }
    );
  }

  it('does not show controls for idle videos; mounts outside player containers', () => {
    const first = add();
    const second = add();
    expect(manager.active).toBeNull();
    expect(first.div.hasAttribute('data-vsc-inactive')).toBe(true);
    expect(second.div.hasAttribute('data-vsc-inactive')).toBe(true);
    expect(first.div.parentNode).toBe(document.documentElement);
    expect(first.div.style.position).toBe('fixed');
  });

  it('leaves pages with no media without any toolbar', () => {
    expect(manager.active).toBeNull();
    expect(manager.host).toBeUndefined();
    expect(manager.controllers.size).toBe(0);
  });

  it('never exposes a toolbar for audio, including autoplay and visibility overrides', () => {
    const audio = add(false, 'audio');
    play(audio);
    audio.div.dataset.vscVisibility = 'show';
    audio.div.classList.add('vsc-show');
    expect(manager.active).toBeNull();
    expect(manager.host).toBeUndefined();
    expect(manager.controllers.has(audio)).toBe(false);
    expect(audio.div.hasAttribute('data-vsc-inactive')).toBe(true);
    // Audio rate/shortcut support is retained independently of its hidden UI.
    const previousRate = audio.video.playbackRate;
    actions.adjustSpeed(audio.video, 0.1, { relative: true });
    expect(audio.video.playbackRate).toBeCloseTo(previousRate + 0.1);
  });

  it('does not let background audio replace the selected video', () => {
    const video = add();
    play(video);
    const audio = add(false, 'audio');
    play(audio);
    expect(manager.active).toBe(video);
    expect(video.div.hasAttribute('data-vsc-inactive')).toBe(false);
    expect(audio.div.hasAttribute('data-vsc-inactive')).toBe(true);
  });

  it.each(['ended', 'emptied'])('hides the toolbar on %s and allows a later replay', (type) => {
    const video = add();
    add(false, 'audio');
    play(video);
    video.video.dispatchEvent({ type });
    expect(manager.active).toBeNull();
    expect(video.div.hasAttribute('data-vsc-inactive')).toBe(true);
    play(video);
    expect(manager.active).toBe(video);
    expect(video.div.hasAttribute('data-vsc-inactive')).toBe(false);
  });

  it('selects only the most recently played video and retains it on pause', () => {
    const first = add();
    const second = add();
    play(first);
    expect(first.div.hasAttribute('data-vsc-inactive')).toBe(false);
    play(second);
    expect(first.div.hasAttribute('data-vsc-inactive')).toBe(true);
    expect(second.div.hasAttribute('data-vsc-inactive')).toBe(false);
    second.video.pause();
    second.video.dispatchEvent({ type: 'pause' });
    expect(manager.active).toBe(second);
    expect(second.div.hasAttribute('data-vsc-inactive')).toBe(false);
  });

  it('recognizes an already playing video on attachment', () => {
    const controller = add(false);
    expect(manager.active).toBe(controller);
  });

  it('speed buttons affect only the selected video, without player click/capture or pausing', () => {
    const first = add();
    const second = add();
    play(first);
    const firstRate = first.video.playbackRate;
    const secondRate = second.video.playbackRate;
    const pause = vi.spyOn(first.video, 'pause');
    const captured = vi.fn();
    first.video.parentNode.addEventListener('click', captured, true);
    first.div.shadowRoot.querySelector('[data-action="faster"]').click();
    expect(first.video.playbackRate).toBeGreaterThan(firstRate);
    expect(second.video.playbackRate).toBe(secondRate);
    expect(captured).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('clamps movement and restores position in a new coordinator', () => {
    const controller = add();
    play(controller);
    manager.move(-100, 100000, true);
    expect(parseFloat(controller.div.style.left)).toBe(0);
    expect(parseFloat(controller.div.style.top)).toBeLessThan(window.innerHeight);
    const stored = JSON.parse(localStorage.getItem('vsc-floating-position'));
    manager.destroy();
    manager = new window.VSC.FloatingController(config, actions);
    window.VSC.floatingController = manager;
    manager.register(controller);
    expect(parseFloat(controller.div.style.left)).toBe(stored.x);
    expect(parseFloat(controller.div.style.top)).toBe(stored.y);
  });

  it('expands hover buttons toward the side with more room', () => {
    const controller = add();
    play(controller);
    expect(controller.div.dataset.vscExpand).toBe('right'); // default: top center
    manager.move(100000, 0);
    expect(controller.div.dataset.vscExpand).toBe('left');
    manager.move(0, 0);
    expect(controller.div.dataset.vscExpand).toBe('right');
  });

  it('supports keyboard movement without changing playback state', () => {
    const controller = add();
    play(controller);
    const before = parseFloat(controller.div.style.left);
    controller.speedIndicator.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        composed: true,
      })
    );
    expect(parseFloat(controller.div.style.left)).toBe(before - 16);
    expect(controller.video.paused).toBe(false);
  });

  it('moves into the fullscreen container and back on exit', () => {
    const controller = add();
    play(controller);
    const container = controller.video.parentNode;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: container });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(controller.div.parentNode).toBe(container);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(controller.div.parentNode).toBe(document.documentElement);
  });

  it('clears an unavailable target without choosing an idle video', () => {
    const first = add();
    add();
    play(first);
    first.remove();
    expect(manager.active).toBeNull();
  });

  it('renders child frame controls in the top document and forwards bounded commands', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const source = frame.contentWindow;
    const send = vi.spyOn(source, 'postMessage');
    manager.receive({
      source,
      data: {
        type: 'vsc-floating',
        kind: 'state',
        available: true,
        speed: 1.5,
        visibility: 'auto',
        hidden: false,
        noSource: false,
      },
    });
    expect(manager.remote.source).toBe(source);
    expect(manager.host.parentNode).toBe(document.documentElement);
    expect(manager.host.shadowRoot.querySelector('.draggable').textContent).toBe('1.50');
    manager.host.shadowRoot.querySelector('[data-action="faster"]').click();
    expect(send).toHaveBeenCalledWith(
      {
        type: 'vsc-floating',
        kind: 'command',
        action: 'faster',
        wheel: false,
      },
      '*'
    );
  });

  it('removes the remote toolbar when its frame is detached', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    manager.receive({
      source: frame.contentWindow,
      data: {
        type: 'vsc-floating',
        kind: 'state',
        available: true,
        speed: 1,
      },
    });
    const host = manager.host;
    const source = frame.contentWindow;
    frame.remove();
    // Browsers report a detached frame's window as closed; jsdom does not.
    Object.defineProperty(source, 'closed', { configurable: true, value: true });
    await Promise.resolve();
    expect(manager.remote).toBeNull();
    expect(host.isConnected).toBe(false);
  });

  it('preserves hide intent and mirrors temporary feedback from a frame', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    manager.receive({
      source: frame.contentWindow,
      data: {
        type: 'vsc-floating',
        kind: 'state',
        available: true,
        speed: 1,
        hidden: true,
        showing: true,
        visibility: 'hide',
      },
    });
    expect(manager.host.dataset.vscVisibility).toBe('hide');
    expect(manager.host.classList.contains('vsc-show')).toBe(true);
  });

  it('ignores unrelated messages and background frame rate updates', () => {
    const local = add();
    play(local);
    manager.receive({
      source: window,
      data: {
        type: 'vsc-floating',
        kind: 'state',
        available: true,
        speed: 2,
      },
    });
    expect(manager.remote).toBeNull();
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    manager.receive({
      source: frame.contentWindow,
      data: {
        type: 'vsc-floating',
        kind: 'state',
        available: true,
        speed: 2,
        updateOnly: true,
      },
    });
    expect(manager.active).toBe(local);
    expect(manager.remote).toBeNull();
  });
});
