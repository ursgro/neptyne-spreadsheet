import re
from pathlib import Path

from server.publish import META_TAG_REGEX


def test_regex_matches_index_html():
    index_html = (
        Path(__file__).parent.parent / "frontend/public/index.html"
    ).read_text()
    matches = re.findall(META_TAG_REGEX, index_html)
    assert len(matches) == 15
