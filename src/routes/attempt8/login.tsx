import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt8", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center relative overflow-hidden" style="background: #020810; color: white">
      <Title>Spotistats | Login</Title>
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute" style="top: -20%; left: -10%; width: 60%; height: 60%; background: radial-gradient(circle, rgba(29,185,84,0.18) 0%, transparent 70%); filter: blur(40px)" />
        <div class="absolute" style="bottom: -20%; right: -10%; width: 60%; height: 60%; background: radial-gradient(circle, rgba(100,220,200,0.12) 0%, transparent 70%); filter: blur(40px)" />
        <div class="absolute" style="top: 40%; left: 50%; transform: translate(-50%,-50%); width: 80%; height: 40%; background: radial-gradient(ellipse, rgba(60,140,255,0.06) 0%, transparent 70%); filter: blur(30px)" />
      </div>
      <div class="relative w-full max-w-sm mx-4 rounded-2xl p-10 text-center" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 8px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6" style="background: linear-gradient(135deg, #1DB954, #0f7a35); box-shadow: 0 4px 20px rgba(29,185,84,0.3)">
          <span class="text-black font-black text-xl">S</span>
        </div>
        <h1 class="text-2xl font-bold mb-2">Spotistats</h1>
        <p class="text-sm mb-8" style="color: rgba(255,255,255,0.4)">Your music, illuminated</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full rounded-xl py-3.5 text-sm font-semibold transition hover:scale-[1.02] active:scale-95"
          style="background: linear-gradient(135deg, #1DB954, #15a040); color: black; box-shadow: 0 4px 15px rgba(29,185,84,0.25)"
        >
          Connect with Spotify
        </button>
      </div>
    </div>
  );
}
