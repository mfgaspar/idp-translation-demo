import os
import subprocess
import sys
from pathlib import Path


def test_alembic_upgrade_head(tmp_path):
    api_root = Path(__file__).resolve().parents[1]
    db_path = tmp_path / "m.db"
    db_url = f"sqlite:///{db_path}"
    env = {
        **os.environ,
        "DATABASE_URL": db_url,
        "PYTHONPATH": str(api_root / "src"),
    }
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(api_root / "alembic.ini"), "upgrade", "head"],
        cwd=api_root,
        check=True,
        env=env,
    )
