/**
 * Unit tests for YouTubeHandler host matching.
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';

describe('YouTubeHandler', () => {
  beforeEach(() => {
    installChromeMock();
    resetMockStorage();
  });

  afterEach(() => {
    cleanupChromeMock();
  });

  it('matches www.youtube.com and the privacy-enhanced embed host only', () => {
    const Handler = window.VSC.YouTubeHandler;
    expect(Handler.matches('www.youtube.com')).toBe(true);
    expect(Handler.matches('www.youtube-nocookie.com')).toBe(true);
    expect(Handler.matches('music.youtube.com')).toBe(false);
    expect(Handler.matches('example.com')).toBe(false);
  });
});
