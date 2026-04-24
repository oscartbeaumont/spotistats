import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt4", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center" style="background: #06060f">
      <Title>Spotistats | Login</Title>
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20" style="background: radial-gradient(circle, #ff2d78, transparent 70%); filter: blur(60px)" />
        <div class="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-20" style="background: radial-gradient(circle, #00f5ff, transparent 70%); filter: blur(60px)" />
      </div>
      <div class="relative w-full max-w-sm mx-4 p-8 text-center" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,45,120,0.3); box-shadow: 0 0 40px rgba(255,45,120,0.1), inset 0 0 40px rgba(255,45,120,0.02)">
        <div class="text-4xl font-black mb-1" style="color: #ff2d78; text-shadow: 0 0 20px rgba(255,45,120,0.5)">SPOTISTATS</div>
        <div class="text-xs mb-8 tracking-widest uppercase" style="color: #00f5ff88">// system access portal</div>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full py-3 text-sm font-bold tracking-widest uppercase transition"
          style="border: 1px solid #ff2d78; color: #ff2d78; background: rgba(255,45,120,0.08); box-shadow: 0 0 20px rgba(255,45,120,0.15)"
          onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(255,45,120,0.2)"; (e.target as HTMLElement).style.boxShadow = "0 0 30px rgba(255,45,120,0.3)"; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(255,45,120,0.08)"; (e.target as HTMLElement).style.boxShadow = "0 0 20px rgba(255,45,120,0.15)"; }}
        >
          ⟶ Connect Spotify
        </button>
      </div>
    </div>
  );
}
