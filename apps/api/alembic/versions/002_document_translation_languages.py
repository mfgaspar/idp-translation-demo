"""document translation languages

Revision ID: 002_document_translation_languages
Revises: 001_initial_schema
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002_document_translation_languages"
down_revision: str | None = "001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_language", sa.String(length=32), nullable=True))
    op.add_column("documents", sa.Column("target_language", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "target_language")
    op.drop_column("documents", "source_language")
