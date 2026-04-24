import { Title } from "@solidjs/meta";
import { spotifyError } from "~/lib/storage";

export default function ErrorPage() {
  const error = () => spotifyError() ?? { title: "Unknown Error", description: "Something went wrong.", code: "No error details were captured." };

  return (
    <main class="mx-auto max-w-5xl px-5 py-8">
      <Title>Spotistats | Error</Title>
      <h1 class="text-4xl font-black">Error <span class="text-[#1DB954]">{error().title}</span></h1>
      <h2 class="mt-4 text-2xl text-zinc-200">{error().description}</h2>
      <p class="mt-5 text-lg text-zinc-300">
        Try <a class="text-[#1DB954] hover:underline" href="/login">logging in again</a> and if that does not fix your issue you can <a class="text-[#1DB954] hover:underline" target="_blank" rel="noopener" href="https://github.com/oscartbeaumont/spotistats/issues/new">report it</a>. Please include the text below to help debug your issue.
      </p>
      <pre class="mt-6 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-200"><samp>{error().code}</samp></pre>
    </main>
  );
}
