import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();
  onMount(() => { if (accessToken()) navigate("/attempt2", { replace: true }); });

  return (
    <div class="min-h-screen flex items-center justify-center font-mono" style="background: #000; color: #00ff41">
      <Title>Spotistats | Login</Title>
      <div class="w-full max-w-md mx-4 p-8" style="border: 1px dashed #00ff41">
        <pre class="text-xs mb-6 leading-tight" style="color: #00ff41">{`
  ███████╗██████╗  ██████╗ ████████╗██╗
  ██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝██║
  ███████╗██████╔╝██║   ██║   ██║   ██║
  ╚════██║██╔═══╝ ██║   ██║   ██║   ██║
  ███████║██║     ╚██████╔╝   ██║   ██║
  ╚══════╝╚═╝      ╚═════╝    ╚═╝   ╚═╝`}</pre>
        <p class="text-xs mb-1" style="color: #00ff4199">$ spotistats --version 1.0.0</p>
        <p class="text-xs mb-6" style="color: #00ff4199">$ auth status: <span style="color: #ff4444">UNAUTHENTICATED</span></p>
        <p class="text-sm mb-4">Authentication required to continue.</p>
        <button
          type="button"
          onClick={async () => { localStorage.clear(); window.location.href = await createLoginUrl(window.location.origin); }}
          class="w-full py-3 text-sm font-mono font-bold transition hover:bg-[#00ff41] hover:text-black"
          style="border: 1px solid #00ff41; color: #00ff41"
        >
          &gt; spotify --auth --login
        </button>
      </div>
    </div>
  );
}
