// Visual Impacto: public Pages address for the current ChatGPT-hosted site.
// This lightweight reverse proxy preserves the live design and asset routes.
// It depends on the original site remaining published.
const UPSTREAM = "https://visual-impacto-estudio.brunopentium.chatgpt.site";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    try {
      const upstream = await fetch(target.toString(), {
        method: request.method,
        redirect: "follow",
        headers: {
          "Accept": request.headers.get("Accept") || "*/*",
          "Accept-Language": request.headers.get("Accept-Language") || "pt-BR"
        }
      });
      const headers = new Headers(upstream.headers);
      headers.delete("set-cookie");
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      headers.delete("content-encoding");
      headers.set("x-visual-impacto-proxy", "cloudflare-pages");

      const contentType = headers.get("content-type") || "";
      if (request.method === "GET" && contentType.includes("text/html")) {
        const html = (await upstream.text()).split(UPSTREAM).join(incoming.origin);
        headers.set("cache-control", "public, max-age=120");
        return new Response(html, { status: upstream.status, headers });
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return new Response("A Visual Impacto está temporariamente indisponível.", {
        status: 502,
        headers: {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store"}
      });
    }
  }
};
