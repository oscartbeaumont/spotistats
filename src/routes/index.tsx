import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, linkToUri, profileCache, setProfileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = {
  id: string;
  display_name: string;
  email?: string;
  uri: string;
  external_urls: { spotify: string };
  followers: { total: number };
  images: { url: string }[];
};

export default function Home() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/login", { replace: true });
  });

  const profile = createQuery(() => ({
    queryKey: ["spotify", "profile", accessToken()],
    enabled: !isServer && mounted() && !!accessToken(),
    queryFn: async () => {
      const cached = profileCache();
      if (cached?.displayName && cached.followers !== undefined) return cached;
      const data = await spotifyFetch<SpotifyProfile>("https://api.spotify.com/v1/me");
      posthog.identify(data.id, { name: data.display_name, email: data.email });
      const next = {
        icon: data.images[0]?.url,
        url: linkToUri() ? data.uri : data.external_urls.spotify,
        displayName: data.display_name,
        followers: data.followers.total,
      };
      setProfileCache(next);
      return next;
    },
  }));

  const current = () => mounted() ? profile.data ?? profileCache() : null;

  return (
    <main class="flex-1 p-8 md:p-16">
      <Title>Spotistats | Profile</Title>
      <Show when={current()} fallback={<p class="text-sm uppercase tracking-widest" style="color: #999">LOADING_</p>}>
        {user => (
          <div class="flex flex-col md:flex-row gap-10 items-start">
            <a href={user().url} target="_blank" rel="noopener">
              <img
                src={user().icon ?? "/assets/placeholder.svg"}
                alt={user().displayName ?? "Profile"}
                class="h-36 w-36 object-cover"
                style="border: 4px solid #0a0a0a"
              />
            </a>
            <div>
              <div class="text-xs uppercase tracking-[0.2em] mb-3" style="color: #999">User Profile</div>
              <h1 class="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-3">{user().displayName}</h1>
              <div class="flex items-center gap-3 mb-8">
                <span class="text-sm font-bold">{user().followers?.toLocaleString()}</span>
                <span class="text-xs uppercase tracking-widest" style="color: #666">followers</span>
              </div>
              <A
                href="/favourites"
                class="inline-block font-black text-sm uppercase px-6 py-3 tracking-wide transition hover:bg-[#1DB954] hover:text-black"
                style="border: 4px solid #0a0a0a"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1DB954"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0a0a0a"; }}
              >
                See Top Music →
              </A>
            </div>
          </div>
        )}
      </Show>
    </main>
  );
}
