import { h as head, a as attr, s as stringify } from "../../../../chunks/index2.js";
import { C as ChatBubble } from "../../../../chunks/ChatBubble.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, form } = $$props;
    function reloadApp() {
    }
    head("y6nhkv", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(data.app.name)}</title>`);
      });
    });
    if (!data.authed) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="login-wrapper svelte-y6nhkv"><div class="login-card svelte-y6nhkv"><h1 class="svelte-y6nhkv">${escape_html(data.app.name)}</h1> <p class="login-subtitle svelte-y6nhkv">This app is password protected.</p> `);
      if (form?.error) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="login-error svelte-y6nhkv">${escape_html(form.error)}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <form method="POST" action="?/login" class="login-form svelte-y6nhkv"><label class="svelte-y6nhkv"><span class="svelte-y6nhkv">Username</span> <input type="text" name="username" required="" autocomplete="username" class="svelte-y6nhkv"/></label> <label class="svelte-y6nhkv"><span class="svelte-y6nhkv">Password</span> <input type="password" name="password" required="" autocomplete="current-password" class="svelte-y6nhkv"/></label> <button type="submit" class="login-btn svelte-y6nhkv">Sign in</button></form></div></div>`);
    } else if (data.app.generated_code_doc_id) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<iframe${attr("src", `/serve/${stringify(data.app.id)}/content`)}${attr("title", data.app.name)} class="svelte-y6nhkv"></iframe> `);
      ChatBubble($$renderer2, { appId: data.app.id, onUpdated: reloadApp });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="not-built svelte-y6nhkv"><h2 class="svelte-y6nhkv">Not built yet</h2> <p>Go to the <a${attr("href", `/app/${stringify(data.app.id)}`)} class="svelte-y6nhkv">app page</a> and click "Build App".</p></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
