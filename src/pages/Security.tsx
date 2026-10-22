import { LegalLayout } from "~/components/LegalLayout";

/**
 * The security policy.
 *
 * The machine-readable summary is served from `/.well-known/security.txt`,
 * which points back at this page.
 */
export default function SecurityPage() {
  return (
    <LegalLayout title="Security Policy" updated="22 October 2026">
      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Reporting a vulnerability
        </h2>
        <p>
          Please report security issues privately through{" "}
          <a
            href="https://github.com/oscartbeaumont/spotistats/security/advisories/new"
            target="_blank"
            rel="noopener noreferrer"
            class="font-bold underline"
          >
            GitHub's private security advisories
          </a>
          . Do not open a public issue for a suspected vulnerability.
        </p>
        <p class="mt-3">
          Include enough detail to reproduce the problem: the URL, the steps,
          and what you expected to happen. We will acknowledge the report and
          keep you updated as we investigate.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Scope
        </h2>
        <p>In scope:</p>
        <ul class="mt-2 list-disc space-y-2 pl-5">
          <li>
            The Spotistats web app at{" "}
            <code>spotistats.otbeaumont.me</code> and its API.
          </li>
          <li>The source in this repository, including the worker.</li>
          <li>
            Authentication and session handling, including the listening-stats
            OAuth flow.
          </li>
          <li>
            Access to another user's stored listening history or tokens.
          </li>
        </ul>
        <p class="mt-3">Out of scope:</p>
        <ul class="mt-2 list-disc space-y-2 pl-5">
          <li>Spotify's own services and APIs.</li>
          <li>
            Denial of service, spam, or automated traffic against the hosted
            site.
          </li>
          <li>
            Reports from automated scanners without a concrete, exploitable
            finding.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Please don't
        </h2>
        <ul class="list-disc space-y-2 pl-5">
          <li>Access, change or delete data that is not yours.</li>
          <li>Run destructive tests against the hosted service.</li>
          <li>
            Use social engineering, or target the Spotify accounts of others.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-black uppercase tracking-[0.2em]">
          Machine-readable policy
        </h2>
        <p>
          The standard security contact file is served at{" "}
          <a href="/.well-known/security.txt" class="font-bold underline">
            /.well-known/security.txt
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
