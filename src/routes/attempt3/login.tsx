import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt3", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center" style="background: #f5f4f0; color: #1a1a1a">
      <Title>Spotistats | Login</Title>
      <div class="w-full max-w-sm mx-4 text-center px-8 py-12">
        <div class="text-4xl font-black tracking-tight mb-2" style="color: #1a1a1a">Spotistats</div>
        <p class="text-sm leading-relaxed mb-10" style="color: #777">Analyse and backup your Spotify music taste.</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="inline-block rounded-full px-8 py-3.5 text-sm font-bold text-white transition hover:opacity-90"
          style="background: #1DB954"
        >
          Login with Spotify
        </button>
        <p class="mt-8 text-xs" style="color: #bbb">We only read your data. Nothing is stored on our servers.</p>
      </div>
    </div>
  );
}
