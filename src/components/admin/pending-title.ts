/** Keep the server's page title and replace only the live pending-payments prefix. */
export function pendingPaymentTitle(title: string, count: number, payments: boolean) {
  const base = title.replace(payments ? /^(?:\(\d+\) )?Payments · /u : /^\(\d+\) Payments · /u, "");
  return `${count > 0 ? `(${count}) ` : ""}${count > 0 || payments ? "Payments · " : ""}${base}`;
}

/** Metadata can stream after a route or refresh commits. Use the public title setter only when its value changes. */
export function watchPendingPaymentTitle(document: Document, count: number, payments: boolean, current: () => boolean): () => void {
  let active = true;
  const update = () => {
    if (!active || !current() || !document.head.querySelector("title")) return;
    const title = pendingPaymentTitle(document.title, count, payments);
    if (title !== document.title) document.title = title;
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.nodeName === "TITLE" || record.target.parentNode?.nodeName === "TITLE"
      || record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeName === "TITLE"))) update();
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  update();
  return () => { active = false; observer.disconnect(); };
}
