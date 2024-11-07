import random
from pathlib import Path

import fire

TEST_DIR = Path(__file__).parent
SUBJECTS_DIR = (
    Path(__file__).parent.parent
    / "excelint-service"
    / "ExceLint-core"
    / "test"
    / "subjects_xlsx"
)


def main(k=5):
    population = {f.name for f in SUBJECTS_DIR.iterdir()}
    chosen = {fn.name for fn in TEST_DIR.glob("batch_*/*")}
    sample = random.sample(sorted(population - chosen), k)
    batches = (
        max(int(f.name.removeprefix("batch_")) for f in TEST_DIR.glob("batch_*")) + 1
    )
    batch_dir = TEST_DIR / f"batch_{batches}"
    batch_dir.mkdir()
    for i, fn in enumerate(sample):
        (batch_dir / fn).symlink_to(SUBJECTS_DIR / fn)


fire.Fire(main)
