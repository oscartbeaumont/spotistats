import { Title } from "@solidjs/meta";
import { HttpStatusCode } from "@solidjs/start";
import { CenteredMessage } from "~/components/CenteredMessage";

export default function NotFound() {
  return (
    <>
      <Title>Not Found</Title>
      <HttpStatusCode code={404} />
      <CenteredMessage title="404: Page Not Found" />
    </>
  );
}
