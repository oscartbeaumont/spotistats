import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt1", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center" style="background: radial-gradient(ellipse at 50% -10%, rgba(29,185,84,0.22) 0%, #07090f 55%)">
      <Title>Spotistats | Login</Title>
      <div class="w-full max-w-sm mx-4 rounded-3xl p-10 text-center" style="background: rgba(255,255,255,0.04); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.08)">
        <div class="text-[#1DB954] text-5xl font-black tracking-tight">spotistats</div>
        <p class="text-zinc-500 text-sm mt-3 mb-8">Your Spotify stats, beautifully displayed</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full rounded-full bg-[#1DB954] py-3.5 text-sm font-bold text-black transition hover:bg-[#1ed760] hover:scale-[1.02] active:scale-95"
        >
          Continue with Spotify
        </button>
      </div>
    </div>
  );
}
