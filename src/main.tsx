import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import { SequencePage } from "./ui/SequencePage.tsx";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const isSeqRoute = window.location.pathname === "/__archik/seq" ||
  window.location.pathname.startsWith("/__archik/seq/");

const root = createRoot(rootEl);

if (isSeqRoute) {
  const seqPath = params.get("path") ?? "";
  const fromViewKey = params.get("from");
  root.render(
    <StrictMode>
      <SequencePage path={seqPath} fromViewKey={fromViewKey} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
