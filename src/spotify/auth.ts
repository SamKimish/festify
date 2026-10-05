// Spotify Authorization Code flow with PKCE: runs entirely in the browser,
// so the app can be a static site with no client secret.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = [
  'user-top-read',
  'user-library-read',
  'user-follow-read',
  'user-read-recently-played',
];
const TOKEN_KEY = 'festify.token';
const VERIFIER_KEY = 'festify.pkce';

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export const isConfigured = Boolean(CLIENT_ID);

/** The page Spotify sends the user back to. Must be registered in the Spotify dashboard. */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function saveToken(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  const previous = readToken();
  const token: StoredToken = {
    access_token: data.access_token,
    // Spotify doesn't always rotate the refresh token, so keep the old one.
    refresh_token: data.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await sha256Base64Url(verifier),
    scope: SCOPES.join(' '),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  saveToken(await res.json());
}

/**
 * Completes the login if Spotify has just redirected back with ?code=.
 * Returns an error message if the user declined or something went wrong.
 */
export async function handleRedirect(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;

  // Strip the query string so a refresh doesn't replay the code.
  window.history.replaceState({}, '', redirectUri());
  if (error) return error === 'access_denied' ? 'Spotify sign-in was cancelled.' : error;

  const pending = JSON.parse(sessionStorage.getItem(VERIFIER_KEY) ?? 'null') as {
    verifier: string;
    state: string;
  } | null;
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!pending || pending.state !== params.get('state')) {
    return 'Sign-in session expired. Please try again.';
  }
  await tokenRequest({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: redirectUri(),
    code_verifier: pending.verifier,
  });
  return null;
}

export function isLoggedIn(): boolean {
  return readToken() !== null;
}

/** Returns a valid access token, refreshing it if needed. */
export async function getAccessToken(): Promise<string> {
  const token = readToken();
  if (!token) throw new Error('Not logged in');
  if (Date.now() < token.expires_at) return token.access_token;
  if (!token.refresh_token) {
    logout();
    throw new Error('Session expired');
  }
  try {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
  } catch (e) {
    logout();
    throw e;
  }
  return readToken()!.access_token;
}
