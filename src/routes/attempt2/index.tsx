import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, clearStoredState, linkToUri, profileCache, setProfileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = { id: string; display_name: string; email?: string; uri: string; external_urls: { spotify: string }; followers: { total: number }; images: { url: string }[]; };

export default function Profile() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt2/login", { replace: true });
  });

  const profile = createQuery(() => ({
    queryKey: ["spotify", "profile", accessToken()],
    enabled: !isServer && mounted() && !!accessToken(),
    queryFn: async () => {
      const cached = profileCache();
      if (cached?.displayName && cached.followers !== undefined) return cached;
      const data = await spotifyFetch<SpotifyProfile>("https://api.spotify.com/v1/me");
      posthog.identify(data.id, { name: data.display_name, email: data.email });
      const next = { icon: data.images[0]?.url, url: linkToUri() ? data.uri : data.external_urls.spotify, displayName: data.display_name, followers: data.followers.total };
      setProfileCache(next);
      return next;
    },
  }));

  const current = () => mounted() ? profile.data ?? profileCache() : null;
  const logout = () => { clearStoredState(); navigate("/attempt2/login"); };

  return (
    <div class="min-h-screen font-mono" style="background: #000; color: #00ff41">
      <Title>Spotistats | Profile</Title>
      <header class="px-4 py-3 flex items-center justify-between text-xs" style="border-bottom: 1px dashed #00ff4133">
        <span class="font-bold text-sm">[spotistats@terminal ~]$</span>
        <nav class="flex gap-6">
          <A href="/attempt2" class="hover:underline" style="color: #00ff41">./profile</A>
          <A href="/attempt2/favourites" class="hover:underline" style="color: #00ff4166">./favourites</A>
        </nav>
        <button onClick={logout} class="hover:underline" style="color: #ff444499; hover:color: #ff4444">--logout</button>
      </header>
      <main class="max-w-2xl mx-auto px-4 py-12">
        <Show when={current()} fallback={<p class="text-xs" style="color: #00ff4155">$ fetching user profile<span class="animate-pulse">_</span></p>}>
          {user => (
            <div>
              <p class="text-xs mb-6" style="color: #00ff4155">$ cat ~/.spotistats/profile.json</p>
              <div class="flex gap-6 items-start">
                <img
                  src={user().icon ?? "/assets/placeholder.svg"}
                  alt={user().displayName ?? "Profile"}
                  class="h-24 w-24 rounded object-cover shrink-0"
                  style="border: 1px solid #00ff4133; filter: grayscale(20%) sepia(50%) hue-rotate(90deg)"
                />
                <div>
                  <pre class="text-sm leading-relaxed">{`{
  "display_name": "${user().displayName}",
  "followers": ${user().followers?.toLocaleString()},
  "status": "AUTHENTICATED"
}`}</pre>
                </div>
              </div>
              <div class="mt-10 text-xs" style="color: #00ff4155">
                <p>$ ls commands/</p>
                <p class="mt-2">
                  <A href="/attempt2/favourites" class="hover:underline" style="color: #00ff41">favourites/</A>
                  {"  "}profile/ (current)
                </p>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
