import { createSignal, For, onSettled, Show } from "solid-js";

import { createLoginUrl } from "~/client/auth";
import {
  clearDiscoveryDraft, discoveryError, generateDiscovery, readDiscoveryDraft,
  saveDiscoveryPlaylist, writeDiscoveryDraft, type DiscoveryDraft,
} from "~/client/discovery";
import { getProfile, runSpotify } from "~/client/spotify";
import { discoveryEnabled } from "~/client/features";
import { authStore } from "~/client/storage";
import { PageHeader } from "~/components/PageHeader";
import type { DiscoveryMode, Mood } from "~/lib/discovery";
import { externalHref } from "~/lib/url";
import NotFoundPage from "./NotFound";

const control = "min-w-0 w-full border-[3px] border-[#0a0a0a] px-4 py-3 text-sm font-bold disabled:opacity-50";
const button = `${control} uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]`;

/**
 * The route stays registered, but the flag decides whether the feature exists
 * for this person. Rendering the 404 keeps the rollout honest for everyone
 * else, and it matches how the nav link is hidden.
 */
export default function DiscoverPage() {
  return (
    <Show when={discoveryEnabled()} fallback={<NotFoundPage />}>
      <Discover />
    </Show>
  );
}

function Discover() {
  const [mode, setMode] = createSignal<DiscoveryMode>("blend");
  const [mood, setMood] = createSignal<Mood>("any");
  const [draft, setDraft] = createSignal<DiscoveryDraft | null>(null);
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const hasPermission = () => {
    const session = authStore();
    return session.status === "authenticated" && session.scopes?.includes("playlist-modify-private");
  };
  const editable = () => draft()?.stage === "review" && !busy();
  const persist = (next: DiscoveryDraft) => { writeDiscoveryDraft(next); setDraft(next); };

  onSettled(() => {
    void (async () => {
      try {
        const previous = readDiscoveryDraft();
        if (previous) {
          const session = authStore();
          const profile = await runSpotify(getProfile());
          const current = authStore();
          if (session.status !== "authenticated" || current.status !== "authenticated" || session.accessToken !== current.accessToken) return;
          if (profile.id === previous.ownerId) setDraft(previous);
          else clearDiscoveryDraft();
        }
      } catch (cause) { setError(discoveryError(cause)); }
      finally { setBusy(false); }
    })();
  });

  const generate = async () => {
    if (busy()) return;
    if (draft()?.stage === "creating" && !confirm("Spotify may already have created your playlist. Check Spotify first. Discard this saved attempt and generate another selection?")) return;
    if (draft()?.stage === "filling" && !confirm("Your Spotify playlist exists but may be incomplete. Discard this saved attempt instead of retrying it?")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateDiscovery(mode(), mood());
      persist({ ...result, name: `Spotistats — ${mood() === "any" ? mode() : mood()}`, playlist: null, stage: "review" });
    } catch (cause) { setError(discoveryError(cause)); }
    finally { setBusy(false); }
  };

  const authorize = async () => {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      const current = draft();
      if (current) writeDiscoveryDraft(current);
      window.location.href = await createLoginUrl(window.location.origin, true);
    } catch (cause) { setError(discoveryError(cause)); setBusy(false); }
  };

  const save = async () => {
    const current = draft();
    if (!current || busy()) return;
    setBusy(true);
    setError(null);
    try { await saveDiscoveryPlaylist(current, setDraft); }
    catch (cause) { setError(discoveryError(cause)); }
    finally { setBusy(false); }
  };

  return (
    <main class="app-main p-8 md:p-12">
      <PageHeader title="Discover" eyebrow="Find your next favourite" />
      <p class="mb-8 max-w-3xl text-sm leading-7 text-[#555]">
        New finds, old favourites, or a blend of both. Spotify supplies the music;
        Spotistats selects up to 30 tracks, with at most three per primary artist.
        Nothing is saved to Spotify until you review the list and confirm.
      </p>
      <section aria-label="Discovery options" class="mb-8 grid gap-5 border-4 border-[#0a0a0a] p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label class="grid min-w-0 gap-2 text-xs font-black uppercase tracking-widest">
          Selection
          <select class={`${control} bg-transparent`} value={mode()} disabled={busy()} onChange={(event) => setMode(event.currentTarget.value as DiscoveryMode)}>
            <option value="new">New to your history</option>
            <option value="rediscover">Rediscover</option>
            <option value="blend">Blend</option>
          </select>
        </label>
        <label class="grid min-w-0 gap-2 text-xs font-black uppercase tracking-widest">
          Mood / activity
          <select class={`${control} bg-transparent`} value={mood()} disabled={busy()} onChange={(event) => setMood(event.currentTarget.value as Mood)}>
            <option value="any">Any mood</option>
            <option value="chill">Chill — lower energy</option>
            <option value="focus">Focus — instrumental</option>
            <option value="workout">Workout — energetic, faster</option>
            <option value="upbeat">Upbeat — brighter, energetic</option>
          </select>
        </label>
        <button type="button" class={`${button} bg-[#1DB954]`} disabled={busy()} onClick={() => void generate()}>
          {busy() ? "Working…" : "Generate selection"}
        </button>
      </section>
      <div class="mb-8 max-w-3xl space-y-2 text-xs leading-6 text-[#555]">
        <p>“New” excludes your recorded history and liked songs, not every song you have ever heard or every playlist you follow.</p>
        <p>Rediscovery uses tracks played at least twice, absent for 90 days. <a class="font-bold underline" href="/account">Connect listening stats</a> to build that history.</p>
        <p>Moods use Spotify musical attributes, not inferred emotions. Restricted recommendation or audio-feature access is reported rather than replaced with guessed results. No data is sent to an AI model.</p>
      </div>
      <Show when={error()}>{(message) => <p role="alert" class="mb-6 border-4 border-red-800 p-4 text-sm leading-7">{message()}</p>}</Show>
      <Show when={draft()}>{(value) => (
        <section aria-label="Review selection" class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b-4 border-[#0a0a0a] pb-4">
            <h2 class="text-2xl font-black uppercase tracking-tight">Your selection — {value().tracks.length} tracks</h2>
            <span class="text-xs font-bold uppercase tracking-widest">Music supplied by Spotify</span>
          </div>
          <Show when={value().tracks.length === 0}>
            <p role="status" class="border-[3px] border-dashed border-[#0a0a0a] p-5 text-sm leading-7">No matching tracks. Try another mood or selection. Rediscovery needs repeated listens older than 90 days; we do not fill gaps with unrelated songs.</p>
          </Show>
          <For each={value().tracks}>{(track, index) => (
            <div class="flex items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3">
              <span class="w-6 shrink-0 text-sm font-black">{index() + 1}</span>
              <img class="h-12 w-12 shrink-0 border-2 border-[#0a0a0a] object-cover" src={track.imageUrl ?? "/assets/placeholder.svg"} alt="" />
              <div class="min-w-0 flex-1">
                <a class="block truncate text-sm font-black uppercase underline" href={externalHref(track.externalUrl) ?? "#"} target="_blank" rel="noopener noreferrer">{track.name}</a>
                <p class="truncate text-xs leading-6">{track.artistNames}</p>
                <p class="text-xs leading-6 text-[#555]">{track.reason}</p>
              </div>
              <Show when={editable()}>
                <button type="button" class="shrink-0 text-xs font-bold underline" aria-label={`Remove ${track.name}`} onClick={() => {
                  try { persist({ ...value(), tracks: value().tracks.filter((item) => item.id !== track.id) }); }
                  catch (cause) { setError(discoveryError(cause)); }
                }}>Remove</button>
              </Show>
            </div>
          )}</For>
          <Show when={value().tracks.length > 0}>
            <label class="grid max-w-xl gap-2 text-xs font-black uppercase tracking-widest">
              Playlist name
              <input class={`${control} bg-transparent`} maxlength={100} value={value().name} disabled={!editable()} onInput={(event) => {
                try { persist({ ...value(), name: event.currentTarget.value }); }
                catch (cause) { setError(discoveryError(cause)); }
              }} />
            </label>
            <Show when={!hasPermission()}>
              <p class="max-w-xl text-sm leading-7">Saving needs your permission to create private Spotify playlists. Your selection stays in this tab while you reconnect.</p>
              <button type="button" class={button} disabled={busy()} onClick={() => void authorize()}>Allow private playlists</button>
            </Show>
            <Show when={hasPermission() && (value().stage === "review" || value().stage === "filling")}>
              <button type="button" class={`${button} bg-[#1DB954]`} disabled={busy() || !value().name.trim()} onClick={() => void save()}>
                {busy() ? "Saving…" : value().playlist ? "Retry saving tracks" : "Create private Spotify playlist"}
              </button>
            </Show>
          </Show>
          <Show when={value().stage === "creating"}>
            <p role="status" class="border-4 border-[#0a0a0a] bg-[#fff7c2] p-4 text-sm leading-7">Spotify may have created this playlist, but we do not have its ID. Check your Spotify playlists before generating another selection. We will not repeat creation automatically.</p>
          </Show>
          <Show when={value().playlist}>{(playlist) => (
            <p role="status" class="border-4 border-[#0a0a0a] p-4 text-sm leading-7">
              {value().stage === "saved" ? "Playlist saved. " : "Playlist created; track saving is not confirmed. Retry to replace its tracks without duplicates. "}
              <a class="font-black underline" href={externalHref(playlist().external_urls.spotify) ?? "#"} target="_blank" rel="noopener noreferrer">Open in Spotify ↗</a>
            </p>
          )}</Show>
        </section>
      )}</Show>
    </main>
  );
}
