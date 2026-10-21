import { LegalLayout } from "~/components/LegalLayout";

/**
 * The privacy policy.
 *
 * It is a public, indexable route, so it lives outside the authenticated app
 * shell. Keep the copy in step with what `src/server/tracking.ts` actually
 * stores and what `src/client/analytics.ts` reports.
 */
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="22 October 2026">
      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          The short version
        </h2>
        <p>
          Spotistats reads your Spotify account and music so it can show your
          stats and back up your playlists. Listening history is only stored if
          you opt in, and you can delete everything from your account page at
          any time. Spotistats never sees your Spotify password.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          What we collect
        </h2>
        <ul class="list-disc space-y-2 pl-5">
          <li>
            <strong>Your Spotify profile.</strong> When you sign in with
            Spotify, we read your user id, display name, email, follower count
            and avatar so the app can show who is signed in.
          </li>
          <li>
            <strong>Your listening history (opt-in).</strong> If you turn on
            listening stats, the server stores the recently played tracks
            Spotify returns — track, artists, album, timestamp and the context
            it played from — so your stats can build a history Spotify does not
            keep.
          </li>
          <li>
            <strong>Your library, read on demand.</strong> Top tracks, saved
            albums and playlists are fetched directly from Spotify in your
            browser to render the page and to export. They are not stored on the
            server.
          </li>
          <li>
            <strong>Product analytics.</strong> We record anonymous usage events
            (such as which buttons are pressed) and error reports with PostHog.
            Playlist names and track names are not sent.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Where it is stored
        </h2>
        <p>
          Your Spotify access token lives in your browser's{" "}
          <code>localStorage</code> and is sent with your Spotify requests.
          Listening history that you opt into is stored server-side in
          Cloudflare D1, alongside the refresh token needed to sync it.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Cookies
        </h2>
        <p>
          Spotistats sets no tracking cookies. The listening-stats sign-in flow
          sets a single short-lived, HTTP-only <code>spotify_stats_state</code>{" "}
          cookie to protect the OAuth callback against cross-site requests.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          How long we keep it
        </h2>
        <p>
          Listening stats are kept while you have them enabled. Sync pauses
          automatically after six months without opening the dashboard. You can
          turn sync off or delete every stored listen from your{" "}
          <a href="/account" class="font-bold underline">
            account page
          </a>
          ; deletion is immediate and permanent.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Third parties
        </h2>
        <ul class="list-disc space-y-2 pl-5">
          <li>
            <strong>Spotify</strong> provides the account and music data through
            its Web API.
          </li>
          <li>
            <strong>Cloudflare</strong> hosts the site and stores opted-in
            listening history in D1, with queues and cron for the sync.
          </li>
          <li>
            <strong>PostHog</strong> receives the product events and error
            reports described above, through a first-party proxy.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Your controls
        </h2>
        <p>
          You can export everything Spotistats stores for your account as JSON
          or CSV, stop syncing, or delete all stored data. All three are on the
          account page and none of them require contacting us.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Contact
        </h2>
        <p>
          Questions about this policy, or a data request? Open an issue on{" "}
          <a
            href="https://github.com/oscartbeaumont/spotistats/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="font-bold underline"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
