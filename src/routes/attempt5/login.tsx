import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt5", { replace: true }); });

  return (
    <div class="min-h-screen flex" style="background: #0a0a0a; color: white">
      <Title>Spotistats | Login</Title>
      <div class="flex-1 flex flex-col justify-end p-10 md:p-16">
        <div class="max-w-lg">
          <p class="text-xs tracking-[0.3em] uppercase mb-6" style="color: #1DB954">Music Analytics</p>
          <h1 class="font-black leading-none mb-8" style="font-size: clamp(3.5rem, 10vw, 7rem); letter-spacing: -0.03em; line-height: 0.9">SPOTI<br />STATS</h1>
          <p class="text-lg mb-10 max-w-sm" style="color: rgba(255,255,255,0.5); line-height: 1.6">Your Spotify listening history, analysed and visualised in one place.</p>
          <button
            type="button"
            onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
            class="inline-flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition hover:gap-5"
            style="color: #1DB954"
          >
            <span style="display: inline-block; width: 2rem; height: 1px; background: #1DB954" />
            Connect with Spotify
          </button>
        </div>
      </div>
      <div class="hidden md:flex w-px self-stretch my-10" style="background: rgba(255,255,255,0.08)" />
      <div class="hidden md:flex w-72 items-center justify-center p-10" style="border-left: none">
        <div class="text-xs leading-loose tracking-wide" style="color: rgba(255,255,255,0.15)">
          <p>Top Tracks</p>
          <p>Top Artists</p>
          <p>Listening History</p>
          <p>Music Taste</p>
          <p>Recommendations</p>
        </div>
      </div>
    </div>
  );
}
