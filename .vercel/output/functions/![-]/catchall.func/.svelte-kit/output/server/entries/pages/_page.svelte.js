import { e as escape_html } from "../../chunks/escaping.js";
import "clsx";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    $$renderer2.push(`<div class="login-box svelte-1uha8ag"><div class="logo svelte-1uha8ag">🗂️</div> <h1 class="svelte-1uha8ag">Drive Site Builder</h1> <p class="tagline svelte-1uha8ag">Turn Google Drive folders into websites — powered by AI</p> `);
    if (data.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="error-banner svelte-1uha8ag">${escape_html(data.error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <a href="/auth/login" class="btn-google svelte-1uha8ag"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.7 2.4 30.2 0 24 0 14.7 0 6.8 5.5 2.9 13.5l7.9 6.1C12.6 13.4 17.9 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.2-4.5 6.8l7 5.4C43.1 37 46.1 31.3 46.1 24.5z"></path><path fill="#FBBC05" d="M10.8 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.7-4.6L2.3 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.3-6z"></path><path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.5l-7-5.4c-2 1.3-4.5 2.1-7.9 2.1-6.1 0-11.3-4-13.2-9.5l-8.1 6.2C6.8 42.5 14.8 48 24 48z"></path></svg> Sign in with Google</a> <p class="hint svelte-1uha8ag">You'll be asked to grant access to Google Drive, Sheets, and Docs.</p></div>`);
  });
}
export {
  _page as default
};
