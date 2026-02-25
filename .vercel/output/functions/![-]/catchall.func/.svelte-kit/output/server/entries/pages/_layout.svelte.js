import { h as head, a as attr, b as attr_class, d as derived } from "../../chunks/index2.js";
import { p as page } from "../../chunks/index3.js";
import { e as escape_html } from "../../chunks/escaping.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, children } = $$props;
    const isServe = derived(() => page.url.pathname.startsWith("/serve/"));
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Drive Site Builder</title>`);
      });
    });
    if (isServe()) {
      $$renderer2.push("<!--[-->");
      children($$renderer2);
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[!-->");
      if (data.user) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<nav class="nav svelte-12qhfyh"><a href="/dashboard" class="nav-brand svelte-12qhfyh">Drive Site Builder</a> <div class="nav-right svelte-12qhfyh"><img${attr("src", data.user.picture)}${attr("alt", data.user.name)} class="avatar svelte-12qhfyh" referrerpolicy="no-referrer"/> <span class="nav-email svelte-12qhfyh">${escape_html(data.user.email)}</span> <a href="/auth/logout" class="btn-ghost svelte-12qhfyh">Sign out</a></div></nav>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <main${attr_class("svelte-12qhfyh", void 0, { "no-nav": !data.user })}>`);
      children($$renderer2);
      $$renderer2.push(`<!----></main>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
