import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createResource, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, linkToUri, profileCache, setProfileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = {
  display_name: string;
  uri: string;
  external_urls: { spotify: string };
  followers: { total: number };
  images: { url: string }[];
};

export default function Home() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();

  onMount(() => {
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/login", { replace: true });
  });

  const [profile] = createResource(
    () => (!isServer && accessToken() ? accessToken() : null),
    async () => {
      const cached = profileCache();
      if (cached?.displayName && cached.followers !== undefined) return cached;

      const data = await spotifyFetch<SpotifyProfile>("https://api.spotify.com/v1/me");
      const next = {
        icon: data.images[0]?.url,
        url: linkToUri() ? data.uri : data.external_urls.spotify,
        displayName: data.display_name,
        followers: data.followers.total,
      };
      setProfileCache(next);
      return next;
    },
  );

  const current = () => profile() ?? profileCache();

  return (
    <main class="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-5 text-center">
      <Title>Spotistats | Profile</Title>
      <Show when={current()} fallback={<p class="text-zinc-400">Loading profile...</p>}>
        {user => (
          <section>
            <a href={user().url} target="_blank" rel="noopener" class="inline-block rounded-full outline-none ring-[#1DB954] transition hover:ring-4">
              <img
                id="profile-icon"
                src={user().icon ?? "/assets/placeholder.svg"}
                alt={user().displayName ?? "Spotify profile"}
                class={`mx-auto h-52 w-52 rounded-full object-cover ${user().icon ? "" : "object-scale-down p-12 invert"}`}
              />
            </a>
            <h1 class="mt-8 text-4xl font-normal tracking-tight text-white">{user().displayName}</h1>
            <h2 class="mt-4 text-2xl font-normal text-zinc-300">Followers: {user().followers}</h2>
          </section>
        )}
      </Show>
    </main>
  );
}
