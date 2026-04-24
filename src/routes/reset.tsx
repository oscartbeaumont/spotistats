import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { resetBrowserState } from "~/lib/spotify";

export default function Reset() {
  const navigate = useNavigate();

  onMount(async () => {
    await resetBrowserState();
    alert("Cache Reset!");
    navigate("/login", { replace: true });
  });

  return (
    <div class="min-h-screen flex flex-col">
      <Title>Spotistats | Reset</Title>
      <header class="p-5 flex items-center justify-between" style="border-bottom: 4px solid #0a0a0a">
        <span class="font-black text-xl tracking-tighter uppercase">SPOTISTATS</span>
      </header>
      <main class="flex-1 flex items-center p-8 md:p-16">
        <div>
          <div class="text-xs uppercase tracking-[0.2em] mb-4" style="color: #999">Please Wait</div>
          <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">RESETTING_</h1>
          <p class="mt-6 text-sm" style="color: #555">Clearing cached Spotify data...</p>
        </div>
      </main>
    </div>
  );
}
