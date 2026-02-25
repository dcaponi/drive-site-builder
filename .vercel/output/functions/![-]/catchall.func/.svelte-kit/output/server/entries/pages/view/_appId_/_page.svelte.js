import { h as head, a as attr, s as stringify } from "../../../../chunks/index2.js";
import { C as ChatBubble } from "../../../../chunks/ChatBubble.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    function reloadApp() {
    }
    head("1et7hiv", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(data.app.name)}</title>`);
      });
    });
    if (data.app.generated_code_doc_id) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<iframe${attr("src", `/serve/${stringify(data.app.id)}`)}${attr("title", data.app.name)} class="svelte-1et7hiv"></iframe> `);
      ChatBubble($$renderer2, { appId: data.app.id, onUpdated: reloadApp });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="not-built svelte-1et7hiv"><h2 class="svelte-1et7hiv">Not built yet</h2> <p>Go to the <a${attr("href", `/app/${stringify(data.app.id)}`)} class="svelte-1et7hiv">app page</a> and click "Build App".</p></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
