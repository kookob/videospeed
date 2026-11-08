/**
 * Default user-editable controller CSS (the "Controller CSS" setting).
 *
 * The toolbar host is positioned by floating-controller.js with inline
 * !important declarations, so these rules only style visibility. Base host
 * rules live in inject.css (manifest-loaded).
 *
 * Domain selectors use :root[style*='--vsc-domain: "DOMAIN"'] syntax.
 * At injection time, matching domains get the selector stripped (rule
 * applies unconditionally); non-matching rules are removed. No CSS variable
 * is actually set on :root.
 */

export const DEFAULT_CONTROLLER_CSS = `/* YouTube autohide applies while the toolbar is mounted inside the
   fullscreen player; in page mode the toolbar lives outside the player. */
:root[style*='--vsc-domain: "youtube.com"'] .ytp-autohide vsc-controller:not([data-vsc-visibility="show"]):not(.vsc-show) {
  visibility: hidden !important;
  opacity: 0 !important;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

:root[style*='--vsc-domain: "youtube-nocookie.com"'] .ytp-autohide vsc-controller:not([data-vsc-visibility="show"]):not(.vsc-show) {
  visibility: hidden !important;
  opacity: 0 !important;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
`;
