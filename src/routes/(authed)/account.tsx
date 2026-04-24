import { Title } from "@solidjs/meta";
import { createQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken } from "~/lib/storage";

type TrackingStatus = {
  enabled: boolean;
  consentedAt: number | null;
  disabledAt: number | null;
  lastPlayedAtMs: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  recent: {
    played_at: string;
    played_at_ms: number;
    name: string;
    album_name: string | null;
    artist_names: string | null;
    image_url: string | null;
    external_url: string | null;
  }[];
};

function formatDate(value: number | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function AccountPage() {
  const [busy, setBusy] = createSignal(false);
  const status = createQuery(() => ({
    queryKey: ["account", "tracking", accessToken()],
    enabled: !isServer && !!accessToken(),
    queryFn: async () => {
      const res = await fetch("/api/account/tracking", {
        headers: { Authorization: accessToken() ?? "" },
      });
      if (!res.ok) throw new Error(`Tracking status failed: ${res.status}`);
      return (await res.json()) as TrackingStatus;
    },
  }));

  async function disableTracking() {
    if (busy()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/tracking", {
        method: "DELETE",
        headers: { Authorization: accessToken() ?? "" },
      });
      if (!res.ok) throw new Error(`Disable tracking failed: ${res.status}`);
      await status.refetch();
    } finally {
      setBusy(false);
    }
  }

  function enableTracking() {
    window.location.href = "/api/account/tracking/login";
  }

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Account</Title>
      <div
        class="flex flex-wrap items-baseline gap-6 mb-8"
        style="border-bottom: 4px solid #0a0a0a; padding-bottom: 1rem"
      >
        <h1 class="text-2xl font-black uppercase tracking-tight">Account</h1>
        <span class="text-xs uppercase tracking-widest" style="color: #999">
          Server Sync
        </span>
      </div>

      <Show
        when={!status.isLoading}
        fallback={
          <p class="text-sm uppercase tracking-widest" style="color: #999">
            LOADING_
          </p>
        }
      >
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <div>
            <div class="mb-6 p-5" style="border: 4px solid #0a0a0a">
              <div
                class="text-xs uppercase tracking-[0.2em] mb-3"
                style="color: #999"
              >
                Listening Tracking
              </div>
              <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none mb-4">
                {status.data?.enabled ? "Enabled" : "Disabled"}
              </h2>
              <p
                class="text-sm max-w-xl mb-6"
                style="color: #555; line-height: 1.7"
              >
                When enabled, Spotistats stores your recently played Spotify
                tracks in our Cloudflare D1 database so server-side stats can be
                queried over time.
              </p>
              <div
                class="grid gap-3 text-xs uppercase tracking-widest mb-6"
                style="color: #666"
              >
                <p>
                  <span class="font-black text-[#0a0a0a]">Consented:</span>{" "}
                  {formatDate(status.data?.consentedAt ?? null)}
                </p>
                <p>
                  <span class="font-black text-[#0a0a0a]">Last Sync:</span>{" "}
                  {formatDate(status.data?.lastSuccessAt ?? null)}
                </p>
                <p>
                  <span class="font-black text-[#0a0a0a]">Newest Listen:</span>{" "}
                  {formatDate(status.data?.lastPlayedAtMs ?? null)}
                </p>
              </div>
              <Show when={status.data?.lastError}>
                {(error) => (
                  <pre
                    class="overflow-auto p-4 text-xs mb-6"
                    style="border: 4px solid #0a0a0a; background: #0a0a0a; color: #f0ede8"
                  >
                    <samp>{error()}</samp>
                  </pre>
                )}
              </Show>
              <Show
                when={status.data?.enabled}
                fallback={
                  <button
                    type="button"
                    onClick={enableTracking}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition hover:bg-[#1DB954] hover:text-black"
                    style="background: #0a0a0a; color: #f0ede8; border: 4px solid #0a0a0a"
                  >
                    Enable Tracking →
                  </button>
                }
              >
                <button
                  type="button"
                  disabled={busy()}
                  onClick={disableTracking}
                  class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                  style="border: 4px solid #0a0a0a"
                >
                  {busy() ? "Disabling_" : "Disable Tracking"}
                </button>
              </Show>
            </div>
          </div>

          <aside>
            <div
              class="text-xs uppercase tracking-[0.2em] mb-3"
              style="color: #999"
            >
              Recent Ingested Songs
            </div>
            <Show
              when={(status.data?.recent.length ?? 0) > 0}
              fallback={
                <p
                  class="text-sm uppercase tracking-widest"
                  style="color: #999"
                >
                  NO DATA YET_
                </p>
              }
            >
              <div>
                <For each={status.data?.recent ?? []}>
                  {(item) => (
                    <a
                      href={item.external_url ?? "#"}
                      target="_blank"
                      rel="noopener"
                      class="flex items-center gap-4 py-3 text-left transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                      style="border-bottom: 3px solid #0a0a0a"
                    >
                      <img
                        src={item.image_url ?? "/assets/placeholder.svg"}
                        alt={item.name}
                        class="h-10 w-10 object-cover shrink-0"
                        style="border: 2px solid #0a0a0a"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-black uppercase tracking-tight truncate">
                          {item.name}
                        </p>
                        <p class="text-xs truncate mt-0.5" style="color: #888">
                          {item.artist_names}
                        </p>
                        <p
                          class="text-[0.65rem] uppercase tracking-widest mt-1"
                          style="color: #999"
                        >
                          {formatDate(item.played_at)}
                        </p>
                      </div>
                    </a>
                  )}
                </For>
              </div>
            </Show>
          </aside>
        </section>
      </Show>
    </main>
  );
}
