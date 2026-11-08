/**
 * Drag functionality for the floating toolbar
 * Uses pointer events for unified mouse + touch support
 */

window.VSC = window.VSC || {};

class DragHandler {
  /**
   * Drag the floating toolbar via pointer events
   * @param {HTMLVideoElement} video - Video element (or remote-toolbar stand-in)
   * @param {PointerEvent} e - Pointer event
   */
  static handleDrag(video, e) {
    const floating = window.VSC.floatingController;
    if (!floating || (e.button !== undefined && e.button !== 0)) {
      return;
    }
    const controller = video.vsc.div;
    const shadowController = controller.shadowRoot.querySelector('#controller');

    shadowController.classList.add('dragging');

    const initialXY = [e.clientX, e.clientY];
    const initialControllerXY = [
      parseFloat(controller.style.left) || 0,
      parseFloat(controller.style.top) || 0,
    ];

    // Capture pointer so all move/up events route here regardless of position
    const draggable = e.target;
    draggable.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      floating.move(
        initialControllerXY[0] + ev.clientX - initialXY[0],
        initialControllerXY[1] + ev.clientY - initialXY[1]
      );
    };

    const onEnd = () => {
      draggable.removeEventListener('pointermove', onMove);
      draggable.removeEventListener('pointerup', onEnd);
      draggable.removeEventListener('pointercancel', onEnd);

      if (floating.host === controller) {
        floating.move(parseFloat(controller.style.left), parseFloat(controller.style.top), true);
      }
      shadowController.classList.remove('dragging');

      window.VSC.logger.debug('Drag operation completed');
    };

    draggable.addEventListener('pointermove', onMove);
    draggable.addEventListener('pointerup', onEnd);
    draggable.addEventListener('pointercancel', onEnd);

    window.VSC.logger.debug('Drag operation started');
  }
}

window.VSC.DragHandler = DragHandler;
