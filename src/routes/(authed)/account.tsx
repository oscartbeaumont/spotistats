import { Title } from "@solidjs/meta";
import { createQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";
import { useLocation } from "@solidjs/router";
import { authStore } from "~/lib/storage";
import { SpotifyUnauthenticatedError, statsStatusQueryOptions } from "~/lib/spotify";

function formatDate(value: number | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function AccountPage() {
  const location = useLocation();
  const [busy, setBusy] = createSignal(false);
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const statsReason = () =>
    new URLSearchParams(location.search).get("reason");
  const status = createQuery(() => statsStatusQueryOptions);

  async function disableStats() {
    if (busy()) return;
    setBusy(true);
    try {
      const store = authStore();
      const res = await fetch("/api/account/stats", {
        method: "DELETE",
        headers: {
          Authorization: store.status === "authenticated" ? store.accessToken : "",
        },
      });
      if (res.status === 401) throw new SpotifyUnauthenticatedError();
      if (!res.ok) throw new Error(`Disable stats failed: ${res.status}`);
      await status.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccountData() {
    if (deleteBusy()) return;
    if (!confirm("Delete all Spotistats account data stored by this site? This also stops stats sync.")) return;
    setDeleteBusy(true);
    try {
      const store = authStore();
      const res = await fetch("/api/account/stats?all=1", {
        method: "DELETE",
        headers: {
          Authorization: store.status === "authenticated" ? store.accessToken : "",
        },
      });
      if (res.status === 401) throw new SpotifyUnauthenticatedError();
      if (!res.ok) throw new Error(`Delete account data failed: ${res.status}`);
      await status.refetch();
    } finally {
      setDeleteBusy(false);
    }
  }

  function enableStats() {
    window.location.href = "/account/stats/login";
  }

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Account</Title>
      <div class="flex flex-wrap items-baseline gap-6 mb-8 border-b-4 border-[#0a0a0a] pb-4">
        <h1 class="text-2xl font-black uppercase tracking-tight">Account</h1>
        <span class="text-xs uppercase tracking-widest text-[#999]">
          Stats Sync
        </span>
      </div>

      <Show when={statsReason()}>
        {(reason) => (
          <pre
            class="overflow-auto p-4 text-xs mb-6 text-red-600 border-4 border-[#0a0a0a] bg-[#0a0a0a]"
          >
            <samp>Failed to authenticate: {reason()}</samp>
          </pre>
        )}
      </Show>

      <Show
        when={!status.isLoading}
        fallback={
          <p class="text-sm uppercase tracking-widest text-[#999]">
            LOADING_
          </p>
        }
      >
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <div>
            <div class="mb-6 p-5 border-4 border-[#0a0a0a]">
              <div
                class="text-xs uppercase tracking-[0.2em] mb-3 text-[#999]"
              >
                Listening Stats
              </div>
              <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none mb-4">
                {status.data?.enabled ? "Enabled" : "Disabled"}
              </h2>
              <p
                class="text-sm max-w-xl mb-6 leading-[1.7] text-[#555]"
              >
                When enabled, Spotistats securely stores your recently played Spotify
                tracks so your listening stats can build over time.
              </p>
              <div
                class="grid gap-3 text-xs uppercase tracking-widest mb-6 text-[#666]"
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
                    class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8]"
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
                    onClick={enableStats}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8] hover:bg-[#1DB954] hover:text-black"
                  >
                    Connect Spotify Stats →
                  </button>
                }
              >
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={disableStats}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                  >
                    {busy() ? "Disabling_" : "Disable Stats"}
                  </button>
                </div>
              </Show>
            </div>
            <div class="p-5 border-4 border-red-800">
              <div class="text-xs uppercase tracking-[0.2em] mb-3 text-red-700">
                Danger Zone
              </div>
              <p class="text-sm max-w-xl mb-5 leading-[1.7] text-[#555]">
                Delete all account data stored by Spotistats for this Spotify account. This also stops stats sync.
              </p>
              <button
                type="button"
                disabled={deleteBusy()}
                onClick={deleteAccountData}
                class="font-black text-sm uppercase tracking-widest py-4 px-8 text-red-700 transition disabled:opacity-50 border-4 border-red-800 hover:bg-red-700 hover:text-[#f0ede8]"
              >
                {deleteBusy() ? "Deleting_" : "Delete Site Data"}
              </button>
            </div>
          </div>

          <aside>
            <div
              class="text-xs uppercase tracking-[0.2em] mb-3 text-[#999]"
            >
              Recent Synced Songs
            </div>
            <Show
              when={(status.data?.recent.length ?? 0) > 0}
              fallback={
                <p
                  class="text-sm uppercase tracking-widest text-[#999]"
                >
                  {status.data?.enabled ? "SYNCING STATS_" : "NO DATA YET_"}
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
                      class="flex items-center gap-4 py-3 text-left transition border-b-[3px] border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                    >
                      <img
                        src={item.image_url ?? "/assets/placeholder.svg"}
                        alt={item.name}
                        class="h-10 w-10 object-cover shrink-0 border-2 border-[#0a0a0a]"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-black uppercase tracking-tight truncate">
                          {item.name}
                        </p>
                        <p class="text-xs truncate mt-0.5 text-[#888]">
                          {item.artist_names}
                        </p>
                        <p
                          class="text-[0.65rem] uppercase tracking-widest mt-1 text-[#999]"
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
