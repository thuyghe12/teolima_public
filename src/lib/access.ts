/**
 * Access token for hosted demos. Opened once as ?token=..., then kept for the tab
 * so the address bar can be shared without it after the first load.
 */
const KEY = 'teolima_access_token';

export function getAccessToken(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    if (fromUrl) {
      sessionStorage.setItem(KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}
