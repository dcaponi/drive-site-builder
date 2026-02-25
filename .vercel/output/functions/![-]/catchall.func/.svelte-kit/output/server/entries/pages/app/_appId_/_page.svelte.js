import { a as attr, s as stringify, e as ensure_array_like } from "../../../../chunks/index2.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let building = false;
    let feedbacks = [...data.feedbacks];
    let credUsername = data.app.app_username ?? "";
    let credPassword = "";
    let credSaving = false;
    let credentialsActive = !!data.app.app_username;
    $$renderer2.push(`<div class="app-header svelte-p8txvr"><div><a href="/dashboard" class="back svelte-p8txvr">← Dashboard</a> <h1 class="svelte-p8txvr">${escape_html(data.app.name)}</h1> `);
    if (data.app.last_built_at) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="meta svelte-p8txvr">Last built ${escape_html(new Date(data.app.last_built_at).toLocaleString())}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="actions svelte-p8txvr">`);
    if (data.app.generated_code_doc_id) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<a${attr("href", `/serve/${stringify(data.app.id)}`)} target="_blank" class="btn-outline svelte-p8txvr">Open App ↗</a>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button class="btn-primary svelte-p8txvr"${attr("disabled", building, true)}>${escape_html(data.app.generated_code_doc_id ? "Rebuild" : "Build App")}</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="two-col svelte-p8txvr"><section class="card svelte-p8txvr"><h2 class="svelte-p8txvr">Requirements</h2> <pre class="content-preview svelte-p8txvr">${escape_html(data.requirements || "No requirements doc found.")}</pre></section> <section class="card svelte-p8txvr"><h2 class="svelte-p8txvr">Database Schema</h2> `);
    if (data.schema.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="muted svelte-p8txvr">No tables found in the database sheet.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(data.schema);
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let table = each_array[$$index_1];
        $$renderer2.push(`<div class="table-schema svelte-p8txvr"><strong class="svelte-p8txvr">${escape_html(table.name)}</strong> <ul class="svelte-p8txvr"><!--[-->`);
        const each_array_1 = ensure_array_like(table.columns);
        for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
          let col = each_array_1[$$index];
          $$renderer2.push(`<li class="svelte-p8txvr"><code class="svelte-p8txvr">${escape_html(col.name)}</code> <span class="type svelte-p8txvr">${escape_html(col.type)}</span></li>`);
        }
        $$renderer2.push(`<!--]--></ul></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></section></div> `);
    if (data.app.generated_code_doc_id) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<section class="preview-section svelte-p8txvr"><h2 class="svelte-p8txvr">Live Preview</h2> <div class="iframe-wrapper svelte-p8txvr"><iframe${attr("src", `/serve/${stringify(data.app.id)}/content`)}${attr("title", `${stringify(data.app.name)} preview`)} loading="lazy" class="svelte-p8txvr"></iframe></div></section>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <section class="card credentials-section svelte-p8txvr"><h2 class="svelte-p8txvr">Access Control</h2> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <p class="muted svelte-p8txvr" style="margin-bottom:1rem;">`);
    if (credentialsActive) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`This app requires login (<strong>${escape_html(credUsername)}</strong>).`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`No credentials set — anyone with Google access can view this app.`);
    }
    $$renderer2.push(`<!--]--></p> <div class="cred-form svelte-p8txvr"><label class="cred-label svelte-p8txvr">Username <input type="text"${attr("value", credUsername)} placeholder="e.g. viewer" class="svelte-p8txvr"/></label> <label class="cred-label svelte-p8txvr">Password <input type="password"${attr("value", credPassword)} placeholder="Password" class="svelte-p8txvr"/></label> <div class="cred-actions svelte-p8txvr"><button class="btn-primary small svelte-p8txvr"${attr("disabled", !credUsername || !credPassword, true)}>${escape_html("Save credentials")}</button> `);
    if (credentialsActive) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="btn-ghost small svelte-p8txvr"${attr("disabled", credSaving, true)}>Remove</button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div> `);
    if (credentialsActive) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="magic-link-area svelte-p8txvr"><p class="magic-label svelte-p8txvr">Magic link <span class="badge-muted svelte-p8txvr">anyone with this link can access</span></p> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<button class="btn-outline small svelte-p8txvr">Generate magic link</button>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></section> `);
    if (feedbacks.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<section class="card feedback-section svelte-p8txvr"><h2 class="svelte-p8txvr">Edit History <span class="badge svelte-p8txvr">${escape_html(feedbacks.length)}</span></h2> <ul class="feedback-list svelte-p8txvr"><!--[-->`);
      const each_array_2 = ensure_array_like(feedbacks);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let fb = each_array_2[$$index_2];
        $$renderer2.push(`<li class="feedback-item svelte-p8txvr"><div class="fb-content svelte-p8txvr"><span class="fb-summary svelte-p8txvr">${escape_html(fb.summary)}</span> `);
        if (fb.created_at) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="fb-date svelte-p8txvr">${escape_html(new Date(fb.created_at).toLocaleString())}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <button class="fb-delete svelte-p8txvr" aria-label="Delete feedback">✕</button></li>`);
      }
      $$renderer2.push(`<!--]--></ul></section>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
