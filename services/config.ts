
export const getApiUrl = (path: string): string => {
  // VITE_API_BASE_URL should be defined in your environment (e.g., .env.local or Cloud Run vars)
  // Example: https://my-event-app-xyz.a.run.app
  // If not set, it defaults to relative path (useful for local dev or same-domain serving)
  const base = process.env.VITE_API_BASE_URL || '';
  
  // Normalize path to ensure it starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Remove trailing slash from base if present to avoid double slashes
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  return `${cleanBase}${cleanPath}`;
};

export const getApiAuthHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const token = window.localStorage.getItem('eventbuilder_api_token');
  if (!token) {
    return {};
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return {};
  }

  return {
    Authorization: `Bearer ${trimmed}`,
    'x-api-token': trimmed
  };
};
