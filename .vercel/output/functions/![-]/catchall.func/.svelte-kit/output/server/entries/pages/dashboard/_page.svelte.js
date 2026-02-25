import { e as ensure_array_like, a as attr, s as stringify, b as attr_class } from "../../../chunks/index2.js";
import { e as escape_html } from "../../../chunks/escaping.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, form } = $$props;
    $$renderer2.push(`<div class="header svelte-x1i5gj"><div><h1 class="svelte-x1i5gj">Your Apps</h1> `);
    if (data.rootFolderName) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="root-label svelte-x1i5gj">Drive root: 📁 ${escape_html(data.rootFolderName)}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <button class="btn-primary svelte-x1i5gj">+ Register App</button></div> `);
    if (data.driveError) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="banner error svelte-x1i5gj"><strong>Google Drive error:</strong> ${escape_html(data.driveError)} <br/><a href="/auth/logout" style="color:inherit;text-decoration:underline">Sign out and try again →</a></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (data.apps.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="empty svelte-x1i5gj"><p class="svelte-x1i5gj">No apps registered yet.</p> <p class="svelte-x1i5gj">Create a folder in your Google Drive with a requirements doc and a database spreadsheet, then register it here.</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="grid svelte-x1i5gj"><!--[-->`);
    const each_array = ensure_array_like(data.apps);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let app = each_array[$$index];
      $$renderer2.push(`<a${attr("href", `/app/${stringify(app.id)}`)} class="card svelte-x1i5gj"><div class="card-icon svelte-x1i5gj">🌐</div> <div class="card-body svelte-x1i5gj"><h2 class="svelte-x1i5gj">${escape_html(app.name)}</h2> <p class="meta svelte-x1i5gj">`);
      if (app.last_built_at) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`Last built ${escape_html(new Date(app.last_built_at).toLocaleDateString())}`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Not yet built`);
      }
      $$renderer2.push(`<!--]--></p></div> <div${attr_class(`card-status ${stringify(app.generated_code_doc_id ? "live" : "pending")}`, "svelte-x1i5gj")}>${escape_html(app.generated_code_doc_id ? "Live" : "Pending")}</div></a>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
