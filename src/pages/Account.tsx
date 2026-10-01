import { Title } from "@solidjs/meta";
import { useLocation, useNavigate } from "@solidjs/router";
import {
  action,
  createEffect,
  createMemo,
  createSignal,
  Loading,
  refresh,
  Show,
  untrack,
} from "solid-js";

import { accountApi } from "~/client/api";
import { describeStatsReason, errorMessage } from "~/lib/errors";
import { formatDate } from "~/lib/format";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";

export default function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Snapshot the one-shot result before the effect below clears the query.
  const snapshot = untrack(() => new URLSearchParams(location.search));
  const [reason] = createSignal(snapshot.get("reason"));
  const [statsResult] = createSignal(snapshot.get("stats"));

  const stats = createMemo(() => accountApi.status());

  createEffect(
    () => location.search,
    (search) => {
      if (search) navigate("/account", { replace: true });
    },
  );

  const [disabling, setDisabling] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const runDisable = action(function* () {
    yield accountApi.disable();
    yield refresh(stats);
  });

  const runDelete = action(function* () {
    yield accountApi.deleteData();
    yield refresh(stats);
  });

  const disableStats = async () => {
    if (disabling()) return;
    setDisabling(true);
    setActionError(null);
    try {
      await runDisable();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDisabling(false);
    }
  };

  const deleteAccountData = async () => {
    if (deleting()) return;
    if (
      !confirm(
        "Delete all Spotistats account data stored by this site? This also stops stats sync.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setActionError(null);
    try {
      await runDelete();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  createShortcut(
    ["Shift", "D"],
    (event) => {
      if (isEditableShortcutTarget(event)) return;
      void disableStats();
    },
    { preventDefault: false },
  );

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Account</Title>
      <div class="flex flex-wrap items-baseline gap-6 mb-8 border-b-4 border-[#0a0a0a] pb-4">
        <h1 class="text-2xl font-black uppercase tracking-tight">Account</h1>
        <span class="text-xs uppercase tracking-widest text-[#5c5c5c]">
          Stats Sync
        </span>
      </div>

      <Show when={statsResult() === "enabled"}>
        <pre class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#1DB954] text-[#0a0a0a]">
          <samp>
            Listening stats connected. Your recent plays will sync shortly.
          </samp>
        </pre>
      </Show>

      <Show when={statsResult() === "failed"}>
        <pre class="overflow-auto p-4 text-xs mb-6 text-red-600 border-4 border-[#0a0a0a] bg-[#0a0a0a]">
          <samp>Failed to connect stats: {describeStatsReason(reason())}</samp>
        </pre>
      </Show>

      <Show when={actionError()}>
        {(value) => (
          <pre class="overflow-auto p-4 text-xs mb-6 text-red-600 border-4 border-[#0a0a0a] bg-[#0a0a0a]">
            <samp>Action failed: {value()}</samp>
          </pre>
        )}
      </Show>

      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <div>
            <div class="mb-6 p-5 border-4 border-[#0a0a0a]">
              <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#5c5c5c]">
                Listening Stats
              </div>
              <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none mb-4">
                {stats().enabled ? "Enabled" : "Disabled"}
              </h2>
              <p class="text-sm max-w-xl mb-6 leading-[1.7] text-[#555]">
                When enabled, Spotistats securely stores your recently played
                Spotify tracks so your listening stats can build over time.
              </p>
              <Show
                when={stats().enabled}
                fallback={
                  <div class="mb-6 border-[3px] border-[#0a0a0a] bg-[#fff7c2] p-4 text-sm leading-7 text-[#3b3200]">
                    <p class="mb-1 font-black uppercase tracking-tight">
                      Listening stats are disabled
                    </p>
                    <p>
                      Connect Spotify stats to sync recent listens and build your
                      dashboard over time.
                    </p>
                  </div>
                }
              >
                <div class="grid gap-3 text-xs uppercase tracking-widest mb-4 text-[#666]">
                  <p>
                    <span class="font-black text-[#0a0a0a]">Consented:</span>{" "}
                    {formatDate(stats().consentedAt)}
                  </p>
                  <p>
                    <span class="font-black text-[#0a0a0a]">Last Sync:</span>{" "}
                    {formatDate(stats().lastSuccessAt)}
                  </p>
                  <p>
                    <span class="font-black text-[#0a0a0a]">Newest Listen:</span>{" "}
                    {formatDate(stats().lastPlayedAtMs)}
                  </p>
                  <p>
                    <span class="font-black text-[#0a0a0a]">Listens Tracked:</span>{" "}
                    {stats().listenCount.toLocaleString()}
                  </p>
                </div>
                <p class="mb-6 text-xs leading-6 text-[#5c5c5c]">
                  Stats sync pauses automatically after 6 months without opening
                  the dashboard.
                </p>
              </Show>
              <Show when={stats().lastError}>
                {(error) => (
                  <pre class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8]">
                    <samp>{error()}</samp>
                  </pre>
                )}
              </Show>
              <Show
                when={stats().enabled}
                fallback={
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/account/stats/login";
                    }}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8] hover:bg-[#1DB954] hover:text-black"
                  >
                    Connect Spotify Stats →
                  </button>
                }
              >
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={disabling()}
                    onClick={disableStats}
                    class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                    title="Shortcut: Shift+D"
                  >
                    {disabling() ? "Disabling_" : "Disable Stats (Shift+D)"}
                  </button>
                </div>
              </Show>
            </div>
            <div class="p-5 border-4 border-red-800">
              <div class="text-xs uppercase tracking-[0.2em] mb-3 text-red-700">
                Danger Zone
              </div>
              <p class="text-sm max-w-xl mb-5 leading-[1.7] text-[#555]">
                Delete all account data stored by Spotistats for this Spotify
                account. This also stops stats sync.
              </p>
              <button
                type="button"
                disabled={deleting()}
                onClick={deleteAccountData}
                class="font-black text-sm uppercase tracking-widest py-4 px-8 text-red-700 transition disabled:opacity-50 border-4 border-red-800 hover:bg-red-700 hover:text-[#f0ede8]"
              >
                {deleting() ? "Deleting_" : "Delete Site Data"}
              </button>
            </div>
          </div>
        </section>
      </Loading>
    </main>
  );
}
