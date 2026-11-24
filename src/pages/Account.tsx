import { useLocation, useNavigate } from "@solidjs/router";
import {
  action,
  createEffect,
  createMemo,
  createSignal,
  Loading,
  onSettled,
  refresh,
  Show,
  untrack,
} from "solid-js";

import { accountApi } from "~/client/api";
import { capture } from "~/client/analytics";
import { reloadWeeklyStatsAccess } from "~/client/weeklyStats";
import { PageHeader } from "~/components/PageHeader";
import { authorizationNeedsReconnect } from "~/lib/authorization";
import { downloadTextFile } from "~/lib/download";
import { errorMessage } from "~/lib/errors";
import { formatDate } from "~/lib/format";
import { createShortcut } from "~/lib/shortcut";
import { type StatsOutcome, statsOutcome } from "~/lib/statsOutcome";
import { UpstreamError, type TrackingStatus } from "~/api";

/** Fixed reason codes the worker puts on a failed stats handshake. */
const statsFailureMessages = new Map<string, string>([
  ["spotify_denied", "Spotify did not grant access."],
  ["spotify_unavailable", "Spotify was unavailable during the handshake."],
  ["spotify_rejected", "Spotify rejected the authorization request."],
  ["spotify_credentials", "Spotify rejected the app's credentials."],
  ["missing_code", "Spotify did not return an authorization code."],
  ["missing_state", "The Spotify handshake was missing its state."],
  ["invalid_state", "The Spotify handshake expired or was invalid."],
  ["internal_error", "The Spotify handshake failed on the server."],
]);

/** The one-shot outcome banners and the last action failure. */
function AccountNotices(props: {
  statsEnabled: boolean;
  statsDenied: boolean;
  actionError: string | null;
}) {
  return (
    <>
      <Show when={props.statsEnabled}>
        <pre class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#1DB954] text-[#0a0a0a]">
          <samp>
            Listening stats connected. Your recent plays will sync shortly.
          </samp>
        </pre>
      </Show>

      <Show when={props.statsDenied}>
        <pre class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#fff7c2] text-[#3b3200]">
          <samp>
            Spotify did not grant access, so listening stats were not
            connected. If you cancelled the prompt, nothing changed; connect
            again whenever you are ready.
          </samp>
        </pre>
      </Show>

      <Show when={props.actionError}>
        {(value) => (
          <pre class="overflow-auto p-4 text-xs mb-6 text-red-600 border-4 border-[#0a0a0a] bg-[#0a0a0a]">
            <samp>Action failed: {value()}</samp>
          </pre>
        )}
      </Show>
    </>
  );
}

/** The consent dates and count shown while stats are enabled. */
function StatsSummary(props: { status: TrackingStatus }) {
  return (
    <>
      <Show
        when={authorizationNeedsReconnect(
          props.status.consentedAt,
          Date.now(),
        )}
      >
        <div class="mb-6 border-[3px] border-[#0a0a0a] bg-[#fff7c2] p-4 text-sm leading-7 text-[#3b3200]">
          <p class="mb-1 font-black uppercase tracking-tight">
            Spotify authorization expiring
          </p>
          <p>
            Spotify logins last six months. Reconnect before{" "}
            {formatDate(props.status.authorizationExpiresAt)} to keep
            syncing without a gap.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/account/stats/login";
            }}
            class="mt-3 font-black text-sm uppercase tracking-widest py-3 px-6 transition border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8] hover:bg-[#1DB954] hover:text-black"
          >
            Reconnect Spotify Stats →
          </button>
        </div>
      </Show>
      <div class="grid gap-3 text-xs uppercase tracking-widest mb-4 text-[#666]">
        <p>
          <span class="font-black text-[#0a0a0a]">Consented:</span>{" "}
          {formatDate(props.status.consentedAt)}
        </p>
        <p>
          <span class="font-black text-[#0a0a0a]">Last Sync:</span>{" "}
          {formatDate(props.status.lastSuccessAt)}
        </p>
        <p>
          <span class="font-black text-[#0a0a0a]">Newest Listen:</span>{" "}
          {formatDate(props.status.lastPlayedAtMs)}
        </p>
        <p>
          <span class="font-black text-[#0a0a0a]">Listens Tracked:</span>{" "}
          {props.status.listenCount.toLocaleString()}
        </p>
      </div>
      <p class="mb-6 text-xs leading-6 text-[#5c5c5c]">
        Stats sync pauses automatically after 6 months without opening
        the dashboard.
      </p>
    </>
  );
}

/** Connect when off, or disable when on. */
function StatsActions(props: {
  status: TrackingStatus;
  disabling: boolean;
  onDisable: () => void;
}) {
  return (
    <Show
      when={props.status.enabled}
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
          disabled={props.disabling}
          onClick={props.onDisable}
          class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
          title="Shortcut: Shift+D"
        >
          {props.disabling ? "Disabling_" : "Disable Stats (Shift+D)"}
        </button>
      </div>
    </Show>
  );
}

/** The listening-stats card: state, dates, errors and the action. */
function ListeningStatsCard(props: {
  status: TrackingStatus;
  disabling: boolean;
  onDisable: () => void;
}) {
  return (
    <div class="p-5 border-4 border-[#0a0a0a] lg:col-start-1 lg:row-start-1">
      <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#5c5c5c]">
        Listening Stats
      </div>
      <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none mb-4">
        {props.status.enabled ? "Enabled" : "Disabled"}
      </h2>
      <p class="text-sm max-w-xl mb-6 leading-[1.7] text-[#555]">
        When enabled, Spotistats securely stores your recently played
        Spotify tracks so your listening stats can build over time.
      </p>
      <Show
        when={props.status.enabled}
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
        <StatsSummary status={props.status} />
      </Show>
      <Show when={props.status.lastError}>
        {(error) => (
          <pre class="overflow-auto p-4 text-xs mb-6 border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8]">
            <samp>{error()}</samp>
          </pre>
        )}
      </Show>
      <StatsActions
        status={props.status}
        disabling={props.disabling}
        onDisable={props.onDisable}
      />
    </div>
  );
}

/** The JSON/CSV export card. */
function ExportDataCard(props: {
  exporting: "json" | "csv" | null;
  onExport: (format: "json" | "csv") => void;
}) {
  return (
    <div class="p-5 border-4 border-[#0a0a0a] bg-[#f8f5ef] lg:col-start-2 lg:row-start-1">
      <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#5c5c5c]">
        Export Your Data
      </div>
      <h2 class="text-2xl font-black uppercase tracking-tighter leading-none mb-3">
        Your plays, portable
      </h2>
      <p class="text-sm max-w-xl mb-5 leading-[1.7] text-[#555]">
        Download every listen Spotistats has stored for this account:
        track, artists, album, context and timestamp. Exporting does not
        stop sync or change what is stored.
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={props.exporting !== null}
          onClick={() => props.onExport("json")}
          class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
        >
          {props.exporting === "json" ? "Preparing_" : "Download JSON ↓"}
        </button>
        <button
          type="button"
          disabled={props.exporting !== null}
          onClick={() => props.onExport("csv")}
          class="font-black text-sm uppercase tracking-widest py-4 px-8 transition disabled:opacity-50 border-4 border-[#0a0a0a] hover:bg-[#1DB954] hover:text-black"
        >
          {props.exporting === "csv" ? "Preparing_" : "Download CSV ↓"}
        </button>
      </div>
    </div>
  );
}

/** The permanent-delete card. */
function DangerZoneCard(props: { deleting: boolean; onDelete: () => void }) {
  return (
    <div class="p-5 border-4 border-red-800 lg:col-start-1 lg:row-start-2">
      <div class="text-xs uppercase tracking-[0.2em] mb-3 text-red-700">
        Danger Zone
      </div>
      <p class="text-sm max-w-xl mb-5 leading-[1.7] text-[#555]">
        Delete all account data stored by Spotistats for this Spotify
        account. This also stops stats sync.
      </p>
      <button
        type="button"
        disabled={props.deleting}
        onClick={props.onDelete}
        class="font-black text-sm uppercase tracking-widest py-4 px-8 text-red-700 transition disabled:opacity-50 border-4 border-red-800 hover:bg-red-700 hover:text-[#f0ede8]"
      >
        {props.deleting ? "Deleting_" : "Delete Site Data"}
      </button>
    </div>
  );
}

/** The policy links under the account cards. */
function LegalLinks() {
  return (
    <p class="mt-10 text-[0.65rem] uppercase tracking-widest text-[#5c5c5c]">
      <a href="/privacy" class="underline hover:text-[#0a0a0a]">
        Privacy
      </a>
      {" · "}
      <a href="/security" class="underline hover:text-[#0a0a0a]">
        Security
      </a>
    </p>
  );
}

/** The disable, delete and export actions, with their in-flight flags. */
function createAccountActions(refreshStats: () => Promise<TrackingStatus>) {
  const [disabling, setDisabling] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [exporting, setExporting] = createSignal<"json" | "csv" | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const runDisable = action(function* () {
    yield accountApi.disable();
    yield refreshStats();
    reloadWeeklyStatsAccess();
  });

  const runDelete = action(function* () {
    yield accountApi.deleteData();
    yield refreshStats();
    reloadWeeklyStatsAccess();
  });

  const disableStats = async () => {
    if (disabling()) return;
    setDisabling(true);
    setActionError(null);

    try {
      await runDisable();
      capture("stats_sync_disabled", {});
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

      try { sessionStorage.removeItem("spotistats-discovery-draft"); } catch { /* Storage may be blocked. */ }

      capture("account_data_deleted", {});
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const exportListeningData = async (format: "json" | "csv") => {
    if (exporting()) return;
    setExporting(format);
    setActionError(null);

    try {
      if (format === "json") {
        const data = await accountApi.exportJson();
        downloadTextFile(
          "spotistats-listening-data.json",
          JSON.stringify(data, null, 2),
          "application/json",
        );
      } else {
        const csv = await accountApi.exportCsv();
        downloadTextFile("spotistats-listening-data.csv", csv);
      }

      capture("listening_data_exported", { format });
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  return {
    disabling,
    deleting,
    exporting,
    actionError,
    disableStats,
    deleteAccountData,
    exportListeningData,
  };
}

/** Clears a failed handshake's query and throws what the boundary reports. */
function failOnStatsHandshake(result: StatsOutcome | null): void {
  if (typeof window === "undefined" || result?.kind !== "failed") return;

  // A failed stats handshake is a setup problem, not page content. Clear the
  // one-shot query so a boundary retry does not rethrow, then hand the error to
  // the boundary, which shows it and reports it to PostHog. The worker sends a
  // fixed reason code, which keeps the failure diagnosable without leaking the
  // underlying cause.
  window.history.replaceState(
    null,
    "",
    window.location.pathname || "/account",
  );
  // Keep the conversion funnel event; the boundary reports the error itself.
  capture("stats_sync_failed", { reason: result.reason });

  const explanation = result.reason
    ? statsFailureMessages.get(result.reason)
    : undefined;

  const text = `Connecting Spotify listening stats did not complete.${
    explanation ? ` ${explanation}` : ""
  } Try connecting again; if it keeps failing, report this error.`;

  // A Spotify outage is an external condition, not a bug to fix. Throwing the
  // typed upstream error lets the boundary offer a retry and keeps error
  // tracking from filing an issue nobody can act on.
  if (result.reason === "spotify_unavailable") {
    throw new UpstreamError({ service: "spotify", message: text, status: 503 });
  }

  throw new Error(text);
}

export default function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Snapshot the one-shot result before the effect below clears the query. The
  // OAuth callback owns the URL, so read the browser's copy rather than the
  // router's: it stays in step after the clear below.
  const [outcome] = createSignal(
    untrack(() =>
      statsOutcome(typeof window === "undefined" ? "" : window.location.search),
    ),
  );

  // A denied consent screen is the user's choice, not a bug. It gets an
  // explanation on the page instead of the system-error boundary, which would
  // file an issue nobody can act on.
  const statsEnabled = () => outcome()?.kind === "enabled";
  const statsDenied = () => outcome()?.kind === "denied";

  const result = untrack(() => outcome());

  failOnStatsHandshake(result);

  const stats = createMemo(() => accountApi.status());

  // The stats connect flow lands back here with its outcome in the query
  // string. Report each outcome once so the funnel is visible.
  onSettled(() => {
    if (statsEnabled()) capture("stats_sync_enabled", {});
    else if (statsDenied()) capture("stats_sync_denied", {});
  });

  createEffect(
    () => location.search,
    (search) => {
      if (search) navigate("/account", { replace: true });
    },
  );

  const actions = createAccountActions(() => refresh(stats));

  createShortcut(
    ["Shift", "D"],
    () => void actions.disableStats(),
    { preventDefault: false },
  );

  return (
    <main class="app-main p-8 md:p-12">
      <PageHeader title="Account" eyebrow="Stats Sync" />

      <AccountNotices
        statsEnabled={statsEnabled()}
        statsDenied={statsDenied()}
        actionError={actions.actionError()}
      />

      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <div class="contents">
            <ListeningStatsCard
              status={stats()}
              disabling={actions.disabling()}
              onDisable={() => void actions.disableStats()}
            />
            <ExportDataCard
              exporting={actions.exporting()}
              onExport={(format) => void actions.exportListeningData(format)}
            />
            <DangerZoneCard
              deleting={actions.deleting()}
              onDelete={() => void actions.deleteAccountData()}
            />
          </div>
        </section>
      </Loading>

      <LegalLinks />
    </main>
  );
}
