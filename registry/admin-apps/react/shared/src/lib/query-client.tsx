import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** One `QueryClient` per browser tab, created lazily so it survives Fast Refresh but never leaks across requests in an SSR context. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
