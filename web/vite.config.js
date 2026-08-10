import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In development the page is served from here, so /api has to be forwarded to
  // the Python server. In production FastAPI serves dist/ and both share an origin.
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
