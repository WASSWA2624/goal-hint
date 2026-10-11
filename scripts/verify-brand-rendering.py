"""Verify styled-components server rendering, streaming and private boundaries."""
import codecs
import http.client
import json
import re
import subprocess
import time

from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, write_json
from lib.runtime import main_guard, node_binary

SENTINEL = "brand_styling_secret_sentinel_do_not_ship_015"
PRIVATE_CANARY = "BRAND_STYLING_PRIVATE_ONLY_CANARY"
STREAMED_COPY = "The delayed styled content has arrived."
STREAMED_DECLARATION = "--brand-stream-proof:delivered"


def style_elements(html):
    return [(item.group(1), item.start()) for item in re.finditer(
        r"<style\b[^>]*data-styled(?:[=\s>])[^>]*>([\s\S]*?)</style>", html)]


def assert_styles_unique(html):
    styles = style_elements(html)
    assert styles, "Server HTML must include styled-components CSS."
    markers = set()
    for css, _ in styles:
        for component, names in re.findall(r'data-styled\.g\d+\[id="([^"]+)"\]\{content:"([^"]*)";?\}', css):
            for name in filter(None, names.split(",")):
                key = f"{component}:{name}"
                assert key not in markers, f"Styled rule was emitted more than once: {key}"
                markers.add(key)
    assert len(markers) >= 5, "Expected real shared primitive rules, not an empty registry."
    assert sum(marker.startswith("sc-global-") for marker in markers) == 1, "Root global style must be inserted once."
    assert "".join(css for css, _ in styles).count("body{margin:0;") == 1, "Global body reset duplicated."
    return {"elements": len(styles), "registeredRules": len(markers)}


def assert_private_output_absent(value):
    for private in [SENTINEL, PRIVATE_CANARY, "verifyPrivateBoundary", "createFallbackService",
        "createEvaluationHarness", "createMySqlCostStore"]:
        assert private not in value, f"Private implementation appeared in public output: {private}"


def assert_no_styling_attributes(html):
    markup = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    for tag in re.findall(r"<(?:button|a|input|select|span|div|section|main)(?=[\s>])[^>]*>", markup):
        no_match(r"\s(?:\$[\w-]+|tone|variant|invalid|gap)=", tag, "Styling-only prop leaked: " + tag)


def verify(server, directory):
    response = request(server.origin)
    assert response.status == 200
    initial = response.text
    (directory / "initial.html").write_text(initial, encoding="utf-8")
    for pattern in ["Brand styling acceptance fixture", "Example text field", 'aria-invalid="true"',
        'id="demo-invalid"[^>]*aria-describedby="external-help demo-invalid-hint demo-invalid-error"',
        '<button[^>]*id="demo-disabled"[^>]*disabled=""', r"goal-hint-logo-primary\.svg", "box-sizing:border-box", "font-size:1rem"]:
        match(pattern, initial)
    assert style_elements(initial)[0][1] < initial.index("<main"), "Initial CSS must precede readable content."
    assert STREAMED_DECLARATION not in initial, "Delayed style must not exist on the first route."
    initial_styles = assert_styles_unique(initial)
    assert_private_output_absent(initial)
    assert_no_styling_attributes(initial)

    connection = http.client.HTTPConnection("127.0.0.1", server.port, timeout=20)
    chunks = []
    try:
        connection.request("GET", "/delayed", headers={"User-Agent": "GoalHintBrandAcceptance/1.0"})
        response = connection.getresponse()
        assert response.status == 200
        decoder = codecs.getincrementaldecoder("utf-8")()
        started = time.perf_counter()
        while raw := response.read1(65536):
            chunks.append({"atMilliseconds": round((time.perf_counter() - started) * 1000), "text": decoder.decode(raw)})
        if remainder := decoder.decode(b"", final=True):
            chunks.append({"atMilliseconds": round((time.perf_counter() - started) * 1000), "text": remainder})
    finally:
        connection.close()
    streamed = "".join(chunk["text"] for chunk in chunks)
    (directory / "streamed.html").write_text(streamed, encoding="utf-8")
    write_json(directory / "stream-chunks.json", [{"atMilliseconds": chunk["atMilliseconds"],
        "bytes": len(chunk["text"].encode()), "hasNewStyle": STREAMED_DECLARATION in chunk["text"],
        "hasDelayedElement": 'data-testid="stream-panel"' in chunk["text"]} for chunk in chunks])
    assert len(chunks) >= 2, "A real streamed request must deliver multiple chunks."
    pending, style, content = (streamed.find(value) for value in ["Waiting for the delayed interface example.",
        STREAMED_DECLARATION, 'data-testid="stream-panel"'])
    match(r"<p[^>]*>" + re.escape(STREAMED_COPY) + "</p>", streamed)
    assert 0 <= pending < style, "Fallback must arrive before new delayed style."
    assert 0 <= style < content, "Streamed style must precede the content that uses it."
    assert streamed.count(STREAMED_DECLARATION) == 1, "Delayed style emitted more than once."
    streamed_styles = assert_styles_unique(streamed)
    assert_private_output_absent(streamed)
    assert_no_styling_attributes(streamed)
    browser_chunks = list((directory / ".next/static").rglob("*.js"))
    assert browser_chunks, "Production browser chunks required for boundary check."
    for path in browser_chunks:
        assert_private_output_absent(path.read_text(encoding="utf-8"))
    result = {"initialStyles": initial_styles, "streamedStyles": streamed_styles, "responseChunks": len(chunks),
        "browserChunks": len(browser_chunks), "privateCanaryAbsent": True, "transientPropsAbsent": True}
    write_json(directory / "verification.json", result)
    print("Brand rendering verification passed: " + json.dumps(result))


def main():
    args = parse_args("brand")
    assert subprocess.check_output([node_binary(), "--version"], text=True).strip() == "v24.18.1", "Use pinned Node.js 24.18.1."
    directory = create_fixture("brand")
    env = environment(AI_API_KEY=SENTINEL)
    print(f"Building production brand fixture: {directory}", flush=True)
    build_fixture(directory, env=env)
    with Server(directory, env=env) as server:
        verify(server, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
