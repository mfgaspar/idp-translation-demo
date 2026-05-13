import httpx

from translation_tool.config import Settings
from translation_tool.services.translation_provider import (
    MockTranslationProvider,
    OpenAICompatibleProvider,
    TranslationRequest,
)


def test_mock_translates_prefix():
    p = MockTranslationProvider()
    out = p.translate(
        [
            TranslationRequest(segment_id="s1", text="你好", source_hint="zh"),
        ]
    )
    assert out[0].segment_id == "s1"
    assert out[0].translated_text.startswith("[en]")
    assert out[0].model_id == "mock"


def test_openai_compatible_parses_response():
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={
                "model": "test-model",
                "choices": [{"message": {"content": "s1\tHello there"}}],
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
    out = p.translate([TranslationRequest(segment_id="s1", text="Bonjour", source_hint=None)])
    assert out[0].translated_text == "Hello there"
