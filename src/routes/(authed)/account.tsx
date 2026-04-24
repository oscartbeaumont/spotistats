import { Title } from "@solidjs/meta";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { Show, createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import {
  deleteListeningStatsMutationOptions,
  disableListeningStatsMutationOptions,
  statsStatusQueryOptions,
} from "~/lib/spotify";

function formatDate(value: number | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [statsReason] = createSignal(
    new URLSearchParams(location.search).get("reason"),
  );
  const status = createQuery(() => statsStatusQueryOptions);
  const disableStatsMutation = createMutation(() => ({
    ...disableListeningStatsMutationOptions,
    onSuccess: () => status.refetch(),
  }));
  const deleteStatsMutation = createMutation(() => ({
    ...deleteListeningStatsMutationOptions,
    onSuccess: () => status.refetch(),
  }));

  onMount(() => {
    if (location.search) navigate("/account", { replace: true });
  });

  function deleteAccountData() {
    if (deleteStatsMutation.isPending) return;
    if (!confirm("Delete all Spotistats account data stored by this site? This also stops stats sync.")) return;
    deleteStatsMutation.mutate();
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
              <Show
                when={status.data?.enabled}
                fallback={
                  <div class="mb-6 border-[3px] border-[#0a0a0a] bg-[#fff7c2] p-4 text-sm leading-7 text-[#3b3200]">
                    <p class="mb-1 font-black uppercase tracking-tight">
                      Listening stats are disabled
                    </p>
                    <p>
                      Connect Spotify stats to sync recent listens and build your dashboard over time.
                    </p>
                  </div>
                }
              >
                <div
                  class="grid gap-3 text-xs uppercase tracking-widest mb-4 text-[#666]"
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
                  <p>
                    <span class="font-black text-[#0a0a0a]">Listens Tracked:</span>{" "}
                    {(status.data?.listenCount ?? 0).toLocaleString()}
                  </p>
                </div>
                <p class="mb-6 text-xs leading-6 text-[#777]">
                  Stats sync pauses automatically after 6 months without opening the dashboard.
                </p>
              </Show>
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
                    disabled={disableStatsMutation.isPending}
                    onClick={() => disableStatsMutation.mutate()}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                  >
                    {disableStatsMutation.isPending ? "Disabling_" : "Disable Stats"}
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
                disabled={deleteStatsMutation.isPending}
                onClick={deleteAccountData}
                class="font-black text-sm uppercase tracking-widest py-4 px-8 text-red-700 transition disabled:opacity-50 border-4 border-red-800 hover:bg-red-700 hover:text-[#f0ede8]"
              >
                {deleteStatsMutation.isPending ? "Deleting_" : "Delete Site Data"}
              </button>
            </div>
          </div>
        </section>
      </Show>
    </main>
  );
}
