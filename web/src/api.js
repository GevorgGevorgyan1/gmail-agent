async function get(path, options) {
  const response = await fetch(path, options);

  if (!response.ok) {
    // FastAPI puts the reason in `detail`; fall back to the status if it didn't.
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

export function ask(request) {
  return get("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
}

export function account() {
  return get("/api/account");
}
