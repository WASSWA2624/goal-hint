const pendingSelector = "[data-navigation-pending]";

function includesPending(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  return element.matches(pendingSelector) || element.querySelector(pendingSelector) !== null;
}

/** Ignore unrelated page updates before checking navigation across the whole document. */
export function changesPendingNavigation(records: readonly MutationRecord[]): boolean {
  return records.some(record => record.type === "attributes" && record.attributeName === "data-navigation-pending"
    || record.type === "childList" && (Array.from(record.addedNodes).some(includesPending) || Array.from(record.removedNodes).some(includesPending)));
}
