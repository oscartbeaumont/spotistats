import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt9", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center relative overflow-hidden" style="background: #120a1f; color: white; background-image: linear-gradient(rgba(155,0,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(155,0,255,0.07) 1px, transparent 1px); background-size: 40px 40px">
      <Title>Spotistats | Login</Title>
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute" style="top: 20%; left: 20%; width: 40%; height: 40%; background: radial-gradient(circle, rgba(255,45,120,0.15) 0%, transparent 70%); filter: blur(50px)" />
        <div class="absolute" style="bottom: 20%; right: 20%; width: 40%; height: 40%; background: radial-gradient(circle, rgba(155,0,255,0.15) 0%, transparent 70%); filter: blur(50px)" />
      </div>
      <div class="relative w-full max-w-sm mx-4 rounded-2xl p-10 text-center" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,45,120,0.2); box-shadow: 0 0 60px rgba(155,0,255,0.15)">
        <div class="text-4xl font-black mb-1" style="background: linear-gradient(135deg, #ff2d78, #9b00e8, #00f5ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">SPOTISTATS</div>
        <p class="text-xs mb-8 mt-2 tracking-widest" style="color: rgba(255,45,120,0.6)">♪ MUSIC ANALYSIS ♪</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full py-3.5 text-sm font-bold tracking-widest uppercase transition hover:scale-[1.02] active:scale-95"
          style="background: linear-gradient(135deg, #ff2d78, #9b00e8); color: white; border-radius: 0.75rem; box-shadow: 0 4px 20px rgba(155,0,232,0.4)"
        >
          ⟶ Connect Spotify
        </button>
        <p class="mt-6 text-xs" style="color: rgba(255,255,255,0.2)">SYNTHWAVE EDITION</p>
      </div>
    </div>
  );
}
