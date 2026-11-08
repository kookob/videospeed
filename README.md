# [Install from Chrome Web Store][chrome-web-store-link]

[![Chrome Web Store][chrome-web-store-version]][chrome-web-store-link] [![Chrome Web Store Users][chrome-web-store-users-badge]][chrome-web-store-link] [![Chrome Web Store Users][chrome-web-store-stars]][chrome-web-store-link]

**Video Speed Controller** gives you fine-grained control over any HTML5 video
or audio element, on any site.

## The science of accelerated playback

**TL;DR** -- faster playback translates to better engagement and retention.

The average adult reads at [250-300 words per minute][wpm-study] (wpm). Speech
averages ~150 wpm; slide presentations often closer to 100 wpm. Given the
choice, most viewers [speed up playback to ~1.3-1.5x][ms-study] to close the
gap. Accelerated viewing [keeps attention longer][byu-study] -- faster delivery
means higher engagement. With practice, many settle at 2x or above and find it
[uncomfortable to return to 1x][mit-study].

[wpm-study]: http://www.paperbecause.com/PIOP/files/f7/f7bb6bc5-2c4a-466f-9ae7-b483a2c0dca4.pdf
[ms-study]: http://research.microsoft.com/en-us/um/redmond/groups/coet/compression/chi99/paper.pdf
[byu-study]: http://www.enounce.com/docs/BYUPaper020319.pdf
[mit-study]: http://alumni.media.mit.edu/~barons/html/avios92.html#beasleyalteredspeech

HTML5 media elements expose a native playback rate API, but most players hide
or artificially limit it. Speed adjustments should be effortless and frequent:
we don't read at a fixed pace, and we shouldn't watch at one either.

## Features

- **Universal** - works on any site with HTML5 media: YouTube, Netflix,
  Coursera, podcasts, local files, etc.
- **Video and audio** - controls both `<video>` and `<audio>` elements.
- **Fine-grained speed** - 0.07x to 16x in configurable increments.
- **Per-site speed rules** - set a default playback speed for specific domains
  (e.g., always 2x on lecture sites).
- **Per-site disable** - turn off the controller on sites where you don't
  want it.
- **Remember speed** - optionally persist your last speed across sessions
  and tabs.
- **Speed fightback** - automatically re-applies your chosen speed when a
  site's player tries to reset it.
- **Page-level floating controls** - one toolbar follows the most recently
  played video, outside the player's click-to-pause area. Drag it
  anywhere in the viewport; its position survives refreshes in the same tab.
- **Fully customizable shortcuts** - remap every key, add modifier combos
  (Ctrl, Shift, Alt), create multiple preferred-speed toggles.
- **Custom controller CSS** - restyle or hide the toolbar per site with your
  own CSS rules (drag it to move it).

## Floating toolbar

The toolbar appears when a video starts playing and keeps that target when paused.
Audio-only pages and pages without video do not display a toolbar; audio speed
shortcuts remain available. The toolbar hides when the selected video ends, is
emptied, or is removed (unless another video is playing).
Idle videos do not each show their own controls. The toolbar stays fixed while
scrolling and shows only the speed badge; hovering or focusing it reveals the
buttons beside it (toward the side with more room) without moving the badge.
Drag the speed badge to move it, or focus it and use the arrow keys. Double-click
or press Enter on the badge to reset speed. Positions are remembered per site
for the current tab (when session storage is available).

Embedded players delegate controls to the top page when the extension is active
there, with a local fallback otherwise. Fullscreen containers use local controls.
Native video-only fullscreen can restrict custom overlays. Page-level floating
positioning replaces the legacy site-specific player offsets.

## Default keyboard shortcuts

- **S** - decrease playback speed
- **D** - increase playback speed
- **R** - reset playback speed to 1.0x
- **Z** - rewind video by 10 seconds
- **X** - advance video by 10 seconds
- **G** - toggle between current and preferred speed
- **V** - show/hide the controller
- **M** - set a marker at current position
- **J** - jump back to the previously set marker

All shortcuts are fully customizable in the extension's settings page. You can
reassign keys, add modifier combinations, and define multiple preferred-speed
shortcuts with different values for quick toggling. Click **Add New** in
settings to create additional bindings. Refresh the page after making changes
for them to take effect.

## License

(MIT License) - Copyright (c) 2014 Ilya Grigorik

[chrome-web-store-version]: https://img.shields.io/chrome-web-store/v/nffaoalbilbmmfgbnbgppjihopabppdk?label=Chrome%20Web%20Store
[chrome-web-store-users-badge]: https://img.shields.io/chrome-web-store/users/nffaoalbilbmmfgbnbgppjihopabppdk
[chrome-web-store-stars]: https://img.shields.io/chrome-web-store/stars/nffaoalbilbmmfgbnbgppjihopabppdk
[github-release-badge]: https://img.shields.io/github/v/release/igrigorik/videospeed
[chrome-web-store-link]: https://chromewebstore.google.com/detail/video-speed-controller/nffaoalbilbmmfgbnbgppjihopabppdk
[github-release-link]: https://github.com/igrigorik/videospeed/releases
