import "clsx";
function ChatBubble($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { appId, onUpdated } = $$props;
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="fab svelte-omjc5c" aria-label="Open edit chat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> <span>Edit</span></button>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  ChatBubble as C
};
