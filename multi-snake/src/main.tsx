import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpacetimeRoot } from "./SpacetimeRoot.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpacetimeRoot />
  </StrictMode>,
);
