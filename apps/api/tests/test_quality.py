from translation_tool.services.quality import score_segment_confidence


def test_short_text_lower_confidence():
    assert score_segment_confidence("Hi", "[en] Hi") < score_segment_confidence(
        "This is a longer segment with more tokens.",
        "[en] This is a longer segment with more tokens.",
    )
