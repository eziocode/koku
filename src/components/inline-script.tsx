/**
 * A blocking inline script that runs while the browser parses the HTML.
 *
 * React never executes `<script>` tags it renders on the client and warns when a
 * component produces one, so the tag is emitted as real JavaScript on the server
 * and as inert `text/plain` on the client. The type differs between the two, which
 * is exactly what `suppressHydrationWarning` is for here.
 *
 * Use this only for corrections that must land before first paint — anything that
 * can wait for hydration belongs in a provider.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
