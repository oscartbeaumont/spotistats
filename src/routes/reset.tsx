import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { CenteredMessage } from "~/components/CenteredMessage";
import { resetBrowserState } from "~/lib/spotify";

export default function Reset() {
  const navigate = useNavigate();

  onMount(async () => {
    await resetBrowserState();
    alert("Cache Reset!");
    navigate("/login", { replace: true });
  });

  return (
    <>
      <Title>Spotistats | Reset</Title>
      <CenteredMessage title="Resetting..." subtitle="Clearing cached Spotify data." />
    </>
  );
}
