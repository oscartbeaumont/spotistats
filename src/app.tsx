import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createSignal, ErrorBoundary, onMount } from "solid-js";
import { isServer } from "solid-js/web";
import { consumeSpotifyCallback } from "~/lib/spotify";
import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        String(error) !== "Error: Spotistats: 401 Unauthorized" &&
        failureCount < 3,
    },
  },
});

if (!isServer) (window as any).__TANSTACK_QUERY_CLIENT__ = queryClient;

export default function App() {
  return (
    <Router
      root={(props) => {
        const navigate = useNavigate();

        onMount(() => {
          void consumeSpotifyCallback().then((consumed) => {
            if (consumed)
              navigate(window.location.pathname || "/", { replace: true });
          });
        });

        return (
          <QueryClientProvider client={queryClient}>
            <MetaProvider>
              <Title>Spotistats</Title>
              <Meta
                name="description"
                content="Spotistats is a tool designed to analyse and backup your music on Spotify!"
              />

              <ErrorBoundary fallback={(error) => <AppError error={error} />}>
                {props.children}
              </ErrorBoundary>
            </MetaProvider>
          </QueryClientProvider>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}

function AppError(props: { error?: Error } = {}) {
  const [copied, setCopied] = createSignal(false);
  const errorText = () =>
    `${props.error?.message ?? "Unknown Error"}\n\n${props.error?.stack ?? ""}`;

  return (
    <main class="p-8 md:p-16 max-w-3xl">
      <Title>Spotistats | Error</Title>
      <div class="text-xs uppercase tracking-[0.2em] mb-3" style="color: #999">
        System Error
      </div>
      <p class="text-sm mb-6" style="color: #555">
        Try{" "}
        <a class="font-bold hover:underline" href="/login">
          logging in again
        </a>{" "}
        or{" "}
        <a
          class="font-bold hover:underline"
          target="_blank"
          rel="noopener"
          href="https://github.com/oscartbeaumont/spotistats/issues/new"
        >
          report this issue
        </a>
        . Include the details below.
      </p>
      <pre
        class="overflow-auto p-4 text-xs"
        style="border: 4px solid #0a0a0a; background: #0a0a0a; color: #f0ede8"
      >
        <samp>{errorText()}</samp>
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(errorText());
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        class="mt-4 border-4 border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
      >
        {copied() ? "Copied" : "Copy Error"}
      </button>
    </main>
  );
}
