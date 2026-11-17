/** Types for the virtual modules provided by `@solidjs/vite-plugin` start mode. */

declare module "virtual:solid-ssr-handler" {
  /** A JSON value, the only data an extra request-event field may carry. */
  export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { readonly [key: string]: JsonValue };

  export interface SolidHandlerOptions {
    /** Extra fields added to the request event, for example `nativeEvent`. */
    event?: Readonly<Record<string, JsonValue>>;
  }

  /**
   * Renders a page request with the app, or returns the `Response` an authored
   * server entry or `start.middleware` produced.
   */
  export function handleRequest(
    request: Request,
    options?: SolidHandlerOptions,
  ): Promise<Response>;

  const handler: { fetch(request: Request): Promise<Response> };
  export default handler;
}
