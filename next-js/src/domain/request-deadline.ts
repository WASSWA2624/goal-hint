/** Bound the whole request, including body reads; callers retain their existing retry policy. */
export function startRequestDeadline(controller: AbortController, timeoutMs = 15_000): () => void {
  const deadline = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
  const dispose = () => {
    clearTimeout(deadline);
    controller.signal.removeEventListener("abort", dispose);
  };
  if (controller.signal.aborted) dispose(); else controller.signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
