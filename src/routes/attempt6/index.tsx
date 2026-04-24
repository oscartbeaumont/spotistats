import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import posthog from "posthog-js";
import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, clearStoredState, linkToUri, profileCache, setProfileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type SpotifyProfile = { id: string; display_name: string; email?: string; uri: string; external_urls: { spotify: string }; followers: { total: number }; images: { url: string }[]; };

const navLinks = [
  { href: "/attempt6", label: "Profile", icon: "○" },
  { href: "/attempt6/favourites", label: "Favourites", icon: "♥" },
];

export default function Profile() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt6/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt6/login"); };

  return (
    <div class="min-h-screen flex" style="background: #111118; color: white">
      <Title>Spotistats | Profile</Title>
      <aside class="w-56 shrink-0 flex flex-col py-6 px-3" style="background: #0d0d13; border-right: 1px solid rgba(255,255,255,0.05)">
        <div class="flex items-center gap-2 px-3 mb-8">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background: #1DB954">
            <span class="text-black font-black text-xs">S</span>
          </div>
          <span class="font-bold text-sm">Spotistats</span>
        </div>
        <nav class="flex-1 space-y-0.5">
          {navLinks.map(({ href, label, icon }) => (
            <A
              href={href}
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition"
              activeClass=""
              style={href === "/attempt6" ? "background: rgba(255,255,255,0.07); color: white; font-weight: 500" : "color: rgba(255,255,255,0.5)"}
            >
              <span style="font-size: 0.75rem">{icon}</span>
              {label}
            </A>
          ))}
        </nav>
        <Show when={current()}>
          {user => (
            <div class="px-3 pt-4" style="border-top: 1px solid rgba(255,255,255,0.05)">
              <div class="flex items-center gap-2 mb-3">
                <img src={user().icon ?? "/assets/placeholder.svg"} alt="" class="h-7 w-7 rounded-full object-cover" />
                <span class="text-xs font-medium truncate">{user().displayName}</span>
              </div>
              <button onClick={logout} class="w-full text-left text-xs transition hover:opacity-70" style="color: rgba(255,255,255,0.3)">Sign out</button>
            </div>
          )}
        </Show>
      </aside>
      <main class="flex-1 p-10">
        <Show when={current()} fallback={<p class="text-sm animate-pulse" style="color: rgba(255,255,255,0.2)">Loading...</p>}>
          {user => (
            <div>
              <p class="text-xs uppercase tracking-widest mb-6" style="color: rgba(255,255,255,0.3)">Your Profile</p>
              <div class="flex items-center gap-8 mb-10">
                <a href={user().url} target="_blank" rel="noopener">
                  <img src={user().icon ?? "/assets/placeholder.svg"} alt={user().displayName ?? "Profile"} class="h-24 w-24 rounded-2xl object-cover" style="border: 1px solid rgba(255,255,255,0.08)" />
                </a>
                <div>
                  <h1 class="text-3xl font-bold mb-1">{user().displayName}</h1>
                  <p class="text-sm" style="color: rgba(255,255,255,0.4)">{user().followers?.toLocaleString()} followers</p>
                </div>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-lg">
                <A href="/attempt6/favourites" class="rounded-xl p-4 text-sm font-medium transition hover:opacity-80" style="background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.7)">
                  <div class="text-lg mb-1">♥</div>
                  Favourites
                </A>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
