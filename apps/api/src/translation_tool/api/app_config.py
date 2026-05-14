from fastapi import APIRouter, Depends

from translation_tool.api.deps import get_settings
from translation_tool.api.schemas import LanguageOptionOut, TranslationLanguagesOut
from translation_tool.config import Settings
from translation_tool.translation_languages_config import parse_translation_languages_json

router = APIRouter()


@router.get("/translation-languages", response_model=TranslationLanguagesOut)
def translation_languages(settings: Settings = Depends(get_settings)):
    cfg = parse_translation_languages_json(settings.translation_languages_json)
    return TranslationLanguagesOut(
        sources=[LanguageOptionOut(code=o.code, label=o.label) for o in cfg.sources],
        targets=[LanguageOptionOut(code=o.code, label=o.label) for o in cfg.targets],
    )
