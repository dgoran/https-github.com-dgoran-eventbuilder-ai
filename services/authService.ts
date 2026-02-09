import { getApiUrl } from './config';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface OAuthProviderStatus {
  id: string;
  label: string;
  enabled: boolean;
}

interface RequestMagicLinkPayload {
  email: string;
  mode?: 'login' | 'signup';
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  password?: string;
}

export interface EmailRegistrationStatus {
  exists: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
}

export const checkEmailRegistration = async (email: string): Promise<EmailRegistrationStatus> => {
  const response = await fetch(getApiUrl('/api/auth/email-status'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to check email status');
  }
  return {
    exists: Boolean(body.exists),
    hasPassword: Boolean(body.hasPassword),
    emailVerified: Boolean(body.emailVerified)
  };
};

export const requestMagicLink = async (payload: RequestMagicLinkPayload): Promise<{ debugMagicLinkUrl?: string }> => {
  const response = await fetch(getApiUrl('/api/auth/request-magic-link'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to send magic link');
  }

  return body;
};

export const verifyMagicLink = async (token: string): Promise<AuthUser> => {
  const response = await fetch(getApiUrl('/api/auth/verify-magic-link'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to verify magic link');
  }

  return body.user as AuthUser;
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const response = await fetch(getApiUrl('/api/auth/me'), {
    credentials: 'include'
  });

  if (response.status === 401) {
    return null;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to fetch session');
  }

  return body.user as AuthUser;
};

export const logout = async (): Promise<void> => {
  await fetch(getApiUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include'
  });
};

export const loginWithPassword = async (payload: { email: string; password: string }): Promise<AuthUser> => {
  const response = await fetch(getApiUrl('/api/auth/login-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to sign in with password');
  }
  return body.user as AuthUser;
};

export const getOAuthProviders = async (): Promise<OAuthProviderStatus[]> => {
  const response = await fetch(getApiUrl('/api/auth/oauth/providers'), {
    credentials: 'include'
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to fetch OAuth providers');
  }
  return Array.isArray(body.providers) ? body.providers as OAuthProviderStatus[] : [];
};

export const startOAuthSignIn = (providerId: string, nextPath = '/'): void => {
  const target = getApiUrl(`/api/auth/oauth/${encodeURIComponent(providerId)}/start?next=${encodeURIComponent(nextPath)}`);
  window.location.assign(target);
};
