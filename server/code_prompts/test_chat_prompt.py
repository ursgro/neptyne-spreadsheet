from pathlib import Path

import yaml

from server.codeassist import load_chat, pretty_dump_prompt


def test_prompt_output(snapshot):
    chat = load_chat(Path(__file__).parent / "chat.yaml")
    snapshot.assert_match(pretty_dump_prompt(chat), "chat.yaml")
