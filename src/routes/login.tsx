import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { authStore } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Page() {
  const navigate = useNavigate();

  onMount(() => {
    if (authStore().status === "authenticated") navigate("/", { replace: true });
  });

  return (
    <div class="min-h-screen flex flex-col">
      <Title>Spotistats | Login</Title>
      <header
        class="p-5 flex items-center justify-between"
        style="border-bottom: 4px solid #0a0a0a"
      >
        <span class="font-black text-xl tracking-tighter uppercase">
          SPOTISTATS
        </span>
        <span class="text-xs uppercase tracking-widest" style="color: #999">
          v1.0
        </span>
      </header>
      <main class="flex-1 flex items-center p-8 md:p-16">
        <div class="max-w-lg">
          <div
            class="text-xs uppercase tracking-[0.2em] mb-4"
            style="color: #999"
          >
            Access Required
          </div>
          <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">
            LOGIN
          </h1>
          <p
            class="text-sm mb-10 max-w-xs"
            style="color: #555; line-height: 1.7"
          >
            Spotistats analyses your Spotify listening history. Server-side
            tracking is optional and can be managed from your account page.
          </p>
          <button
            type="button"
            onClick={async () => {
              localStorage.clear();
              window.location.href = await createLoginUrl(
                window.location.origin,
              );
            }}
            class="font-black text-sm uppercase tracking-widest py-4 px-8 transition"
            style="background: #0a0a0a; color: #f0ede8; border: 4px solid #0a0a0a"
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = "#1DB954";
              (e.target as HTMLElement).style.borderColor = "#1DB954";
              (e.target as HTMLElement).style.color = "#0a0a0a";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = "#0a0a0a";
              (e.target as HTMLElement).style.borderColor = "#0a0a0a";
              (e.target as HTMLElement).style.color = "#f0ede8";
            }}
          >
            Login via Spotify →
          </button>
        </div>
      </main>
    </div>
  );
}
