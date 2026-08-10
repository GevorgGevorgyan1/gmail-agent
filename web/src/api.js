async function get(path, options) {
  const response = await fetch(path, options);

  if (!response.ok) {
    // FastAPI puts the reason in `detail`; fall back to the status if it didn't.
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

export function ask(request, sessionId) {
  return get("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, session_id: sessionId }),
  });
}

export function clearSession(sessionId) {
  return get(`/api/session/${sessionId}`, { method: "DELETE" });
}

export function account() {
  return get("/api/account");
}
