export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let url = endpoint;
  if (API_BASE) {
    url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  } else {
    url = endpoint.startsWith("/api")
      ? endpoint
      : `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  }

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    // Falls back to the HTTP status line rather than a bare "An error
    // occurred" when the body isn't JSON (e.g. nginx's own error pages for
    // a request it rejected before the API ever saw it, like a body over
    // its client_max_body_size) -- a status-coded message is at least
    // actionable, where a wholly generic one hid the real problem.
    let message = `Request failed (${response.status} ${response.statusText || "Error"})`;
    let data;
    try {
      data = await response.json();
      message = data.message || data.error || message;
    } catch {
      // Not JSON, ignore
    }
    throw new ApiError(response.status, message, data);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const apiClient = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
