import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt6", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center" style="background: #111118; color: white">
      <Title>Spotistats | Login</Title>
      <div class="w-full max-w-xs mx-4 text-center">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-6" style="background: #1DB954">
          <span class="text-black font-black text-lg">S</span>
        </div>
        <h1 class="text-2xl font-bold mb-2">Welcome back</h1>
        <p class="text-sm mb-8" style="color: rgba(255,255,255,0.4)">Sign in to view your Spotify stats</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full rounded-xl py-3 text-sm font-semibold transition hover:opacity-90"
          style="background: #1DB954; color: black"
        >
          Continue with Spotify
        </button>
      </div>
    </div>
  );
}
