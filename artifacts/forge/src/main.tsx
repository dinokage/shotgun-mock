import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted (bundled at build time, served from this app's own origin) --
// this deployment runs on office networks with no internet access, so the
// previous Google Fonts <link> in index.html silently failed to load the
// Inter font for every real user on such a network.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { setBaseUrl } from "@workspace/api-client-react";
import { installGlobalErrorReporting } from "./lib/reportError";

const API_BASE = import.meta.env.VITE_API_URL || "";
if (API_BASE) {
  setBaseUrl(API_BASE);
}

// Installed before the app renders, so a crash during the very first render
// is still reported. React's error boundary only sees errors inside the tree;
// this covers everything outside it and every unhandled promise rejection.
installGlobalErrorReporting();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
