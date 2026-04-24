import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { CenteredMessage } from "~/components/CenteredMessage";
import { accessToken } from "~/lib/storage";
import { createLoginUrl } from "~/lib/spotify";

export default function Login() {
  const navigate = useNavigate();

  onMount(() => {
    if (accessToken()) navigate("/", { replace: true });
  });

  return (
    <>
      <Title>Spotistats | Login</Title>
      <CenteredMessage title="Welcome to Spotistats" subtitle="Spotistats is a tool designed to analyse and backup your music on Spotify!">
        <button
          type="button"
          onClick={() => {
            localStorage.clear();
            window.location.href = createLoginUrl(window.location.origin);
          }}
          class="rounded-full bg-[#1DB954] px-8 py-4 text-lg font-black text-[#191414] transition hover:bg-[#108d3b]"
        >
          Login with Spotify
        </button>
      </CenteredMessage>
    </>
  );
}
