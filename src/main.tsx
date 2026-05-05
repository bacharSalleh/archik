import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import { SequencePage } from "./ui/SequencePage.tsx";
import { UseCasesPage } from "./ui/UseCasesPage.tsx";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const path = window.location.pathname;
const isSeqRoute = path === "/__archik/seq" || path.startsWith("/__archik/seq/");
const isUseCasesRoute =
  path === "/__archik/usecases" || path.startsWith("/__archik/usecases/");

const root = createRoot(rootEl);

if (isSeqRoute) {
  const seqPath = params.get("path") ?? "";
  const fromViewKey = params.get("from");
  root.render(
    <StrictMode>
      <SequencePage path={seqPath} fromViewKey={fromViewKey} />
    </StrictMode>,
  );
} else if (isUseCasesRoute) {
  // ?uc=<id> selects a use case; absence shows the first one.
  const selectedId = params.get("uc");
  root.render(
    <StrictMode>
      <UseCasesPage selectedId={selectedId} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
