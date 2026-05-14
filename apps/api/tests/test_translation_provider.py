import httpx

from translation_tool.config import Settings
from translation_tool.services.translation_provider import (
    MockTranslationProvider,
    OpenAICompatibleProvider,
    TranslationRequest,
    TranslationUpstreamError,
)


def test_mock_translates_prefix():
    p = MockTranslationProvider()
    out = p.translate(
        [
            TranslationRequest(segment_id="s1", text="你好", source_language="zh", target_language="en"),
        ]
    )
    assert out[0].segment_id == "s1"
    assert out[0].translated_text.startswith("[en]")
    assert out[0].model_id == "mock"
    assert out[0].detected_source_language is None


def test_openai_compatible_parses_json_response():
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={
                "model": "test-model",
                "choices": [
                    {
                        "message": {
                            "content": '{"detected_source_language":"fr","translations":[{"segment_id":"s1","translated_text":"Hello there"}]}',
                        }
                    }
                ],
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="secret",
    )
    p = OpenAICompatibleProvider(s, client=client)
    out = p.translate([TranslationRequest(segment_id="s1", text="Bonjour", source_language="auto", target_language="en")])
    assert out[0].translated_text == "Hello there"
    assert out[0].detected_source_language == "fr"


def test_openai_compatible_parses_legacy_tab_lines():
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={"model": "test-model", "choices": [{"message": {"content": "s1\tHello there"}}]},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="secret",
    )
    p = OpenAICompatibleProvider(s, client=client)
    out = p.translate([TranslationRequest(segment_id="s1", text="Bonjour", source_language="auto", target_language="en")])
    assert out[0].translated_text == "Hello there"
    assert out[0].detected_source_language is None


def test_openai_compatible_azure_style_request():
    captured: dict = {}

    def handler(request: httpx.Request):
        captured["url"] = str(request.url)
        captured["api_key"] = request.headers.get("api-key")
        captured["auth"] = request.headers.get("authorization")
        import json

        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(
            200,
            json={
                "model": "azure-dep",
                "choices": [
                    {
                        "message": {
                            "content": '{"translations":[{"segment_id":"s1","translated_text":"Hi"}]}',
                        }
                    }
                ],
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="https://myresource.openai.azure.com/openai/deployments/my-deployment",
        llm_api_key="azure-secret",
        llm_model="gpt-4o-mini",
        llm_auth_scheme="api_key",
        llm_api_version="2024-02-01",
        llm_include_model_in_body=False,
    )
    p = OpenAICompatibleProvider(s, client=client)
    out = p.translate([TranslationRequest(segment_id="s1", text="Hola", source_language="auto", target_language="en")])
    assert out[0].translated_text == "Hi"
    assert out[0].detected_source_language is None
    assert "api-version=2024-02-01" in captured["url"]
    assert captured["url"].endswith("/chat/completions?api-version=2024-02-01")
    assert captured["api_key"] == "azure-secret"
    assert captured["auth"] is None
    assert "model" not in captured["body"]


def test_openai_compatible_http_error_wraps_translation_upstream():
    def handler(request: httpx.Request):
        return httpx.Response(
            401,
            json={"error": {"message": "invalid subscription key"}},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="x",
    )
    p = OpenAICompatibleProvider(s, client=client)
    try:
        p.translate([TranslationRequest(segment_id="s1", text="a", source_language="en", target_language="de")])
    except TranslationUpstreamError as e:
        assert "401" in str(e)
        assert "invalid subscription" in str(e).lower()
    else:
        raise AssertionError("expected TranslationUpstreamError")


def test_openai_compatible_bad_response_shape():
    def handler(request: httpx.Request):
        return httpx.Response(200, json={"choices": []})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="x",
    )
    p = OpenAICompatibleProvider(s, client=client)
    try:
        p.translate([TranslationRequest(segment_id="s1", text="a", source_language="en", target_language="de")])
    except TranslationUpstreamError as e:
        assert "missing choices" in str(e).lower()
    else:
        raise AssertionError("expected TranslationUpstreamError")


def test_openai_compatible_http_error_wraps_translation_upstream():
    def handler(request: httpx.Request):
        return httpx.Response(
            401,
            json={"error": {"message": "invalid subscription key"}},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="x",
    )
    p = OpenAICompatibleProvider(s, client=client)
    try:
        p.translate([TranslationRequest(segment_id="s1", text="a", source_language="en", target_language="de")])
    except TranslationUpstreamError as e:
        assert "401" in str(e)
        assert "invalid subscription" in str(e).lower()
    else:
        raise AssertionError("expected TranslationUpstreamError")


def test_openai_compatible_bad_response_shape():
    def handler(request: httpx.Request):
        return httpx.Response(200, json={"choices": []})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    s = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="http://example.invalid/v1",
        llm_api_key="x",
    )
    p = OpenAICompatibleProvider(s, client=client)
    try:
        p.translate([TranslationRequest(segment_id="s1", text="a", source_language="en", target_language="de")])
    except TranslationUpstreamError as e:
        assert "missing choices" in str(e).lower()
    else:
        raise AssertionError("expected TranslationUpstreamError")
