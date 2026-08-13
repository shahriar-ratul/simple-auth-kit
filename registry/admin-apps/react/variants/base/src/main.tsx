import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { StoreProvider } from "./stores/store-context";
import { QueryProvider } from "./lib/query-client";
import { ThemeProvider } from "./lib/theme";
import { Toaster } from "./components/ui/sonner";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <QueryProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
          <Toaster position="top-right" closeButton />
        </QueryProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
