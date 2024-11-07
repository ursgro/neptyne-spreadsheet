import ast
import enum
import json
import logging
import os
import re
import sys
import time
import typing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import tiktoken
import yaml
from anthropic import AI_PROMPT, HUMAN_PROMPT, AsyncAnthropic
from tornado.httpclient import AsyncHTTPClient
from tornado.simple_httpclient import HTTPTimeoutError
from vertexai.language_models import CodeChatModel
from yaml import Dumper, Node

from neptyne_kernel.cell_address import Address, Range
from neptyne_kernel.expression_compiler import (
    compile_expression,
    is_cell,
    reformat_code,
)
from neptyne_kernel.neptyne_protocol import SheetData
from neptyne_kernel.tyne_model.cell import NotebookCell
from neptyne_kernel.tyne_model.sheet import Sheet
from neptyne_kernel.tyne_model.table_for_ai import (
    TableForAI,
    ai_tables_for_sheet,
    grid_to_values,
)

if typing.TYPE_CHECKING:
    from server.tyne_info import SheetCellUpdate

API_KEY = os.getenv("OPENAI_API_KEY")
CELL_SEPARATOR = "|"
ROW_SEPARATOR = "\n"
CODE_MODEL = ["code-davinci-002", "code-cushman-001"][0]
CODE_SUGGEST_SEPARATOR = "#~#~#~#~#~#"
USER_ROLE = "user"
ASSISTANT_ROLE = "assistant"
REPL_REPLY_TOKENS = 2048
CHAT_GPT_MAX_TOKENS = 16384 - 2000
GPT_35_TURBO = "gpt-3.5-turbo-1106"
GPT_4O = "gpt-4o"

ai_logger = logging.getLogger("aiLogger")


@dataclass
class ReplCodeAssistReply:
    code_pane: str
    repl: str = ""
    cells_to_update: list[tuple[str, str]] = field(default_factory=list)
    extra: str = ""
    ai_prompt: str = ""
    ai_response: str = ""
    run_time_secs: float = 0


class AIBackend(enum.Enum):
    local_llama = 1
    chatgpt3_5 = 2
    chatgpt4 = 3
    claude = 4
    google = 5


def str_presenter(dumper: Dumper, data: str) -> Node:
    """configures yaml for dumping multiline strings
    Ref: https://stackoverflow.com/questions/8640959/how-can-i-control-what-scalar-form-pyyaml-uses-for-my-data"""
    if data.count("\n") > 0:  # check for multiline string
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(str, str_presenter)


def pretty_dump_prompt(chat: list[dict]) -> str:
    return yaml.dump([{step["role"]: step["content"]} for step in chat])


def find_inserted_lines(new_text: str, org_text: str) -> list[int]:
    new_lines = new_text.splitlines()
    org_lines = org_text.splitlines()
    changed_lines = []
    new_line_idx = 0
    org_line_idx = 0
    while new_line_idx < len(new_lines) and org_line_idx < len(org_lines):
        if new_lines[new_line_idx] != org_lines[org_line_idx]:
            changed_lines.append(new_line_idx)
        else:
            org_line_idx += 1
        new_line_idx += 1
    if new_line_idx < len(new_lines):
        changed_lines.extend(range(new_line_idx, len(new_lines)))

    return changed_lines


async def open_ai_call(
    prompt_or_messages: str | list[dict[str, str]],
    *,
    max_tokens: int,
    temperature: int = 0,
    model: str = "text-davinci-002",
    api_endpoint: str = "https://api.openai.com/v1/completions",
    stop: list | None = None,
    suffix: str | None = None,
) -> str | None:
    http_client = AsyncHTTPClient()

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if isinstance(prompt_or_messages, str):
        payload["prompt"] = prompt_or_messages
    else:
        payload["messages"] = prompt_or_messages
    if stop:
        payload["stop"] = stop
    if suffix:
        payload["suffix"] = suffix
    json_data = json.dumps(payload)
    try:
        response = await http_client.fetch(
            api_endpoint,
            raise_error=False,
            method="POST",
            body=json_data,
            headers=headers,
            request_timeout=60,
        )
    except HTTPTimeoutError:
        print("request timed out")
        return "Let's try this again, I seem to be having capacity issues."
    result = json.loads(response.body)
    if error := result.get("error"):
        raise ValueError(error["message"])

    if not result.get("choices"):
        return None
    choice = result["choices"][0]
    if "text" in choice:
        res = choice["text"]
    elif "message" in choice:
        res = choice["message"]["content"]
    else:
        return None
    return res


async def simple_code_edit(
    user_prompt: str,
    code_panel: str,
    backend: AIBackend = AIBackend.chatgpt3_5,
    max_tokens: int = 1024,
) -> ReplCodeAssistReply:
    parts = user_prompt.rsplit("::", 1)
    if len(parts) > 1:
        prompt, specified_backend = parts
        if specified_backend in AIBackend.__members__:
            backend = AIBackend[specified_backend]
            user_prompt = prompt

    if code_panel:
        prompt = (
            f"Modify this code:\n\n{code_panel}\n\n"
            f"Complying with these instructions:\n\n{user_prompt}\n\n"
            "DO NOT delete any code that is unchanged."
        )
    else:
        prompt = user_prompt

    prompt = (
        "Return ONLY code. Don't show me how to call it."
        " Start the code with ``` and end with ```."
        " With that:\n\n" + prompt
    )

    start_time = time.time()

    if backend == AIBackend.local_llama:
        url = "http://localhost:8000/v1/engines/copilot-codex/completions"
        headers = {
            "accept": "application/json",
            "Content-Type": "application/json",
        }
        data = {
            "prompt": f"\n\n### Instructions:\n{prompt}\n\n### Response:\n",
            "stop": ["###"],
            "max_tokens": max_tokens,
        }

        http_client = AsyncHTTPClient()
        response = await http_client.fetch(
            url, method="POST", headers=headers, body=json.dumps(data)
        )
        res_data = json.loads(response.body)
        code = res_data["choices"][0]["text"]
    elif backend == AIBackend.claude:
        anthropic = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        completion = await anthropic.completions.create(
            model="claude-instant-1",
            max_tokens_to_sample=max_tokens,
            prompt=f"{HUMAN_PROMPT}{prompt}{AI_PROMPT}",
        )
        code = completion.completion.strip()
    elif backend == AIBackend.google:
        parameters = {
            "temperature": 0,
            "max_output_tokens": max_tokens,
        }

        code_chat_model = CodeChatModel.from_pretrained("codechat-bison@001")
        chat = code_chat_model.start_chat()

        response = await chat.send_message_async(
            prompt,
            **parameters,
        )
        code = (await response).text  # type: ignore
    elif backend == AIBackend.chatgpt3_5 or backend == AIBackend.chatgpt4:
        code = await open_ai_call(
            [{"role": USER_ROLE, "content": prompt}],
            api_endpoint="https://api.openai.com/v1/chat/completions",
            model="gpt-4" if backend == AIBackend.chatgpt4 else GPT_35_TURBO,
            max_tokens=max_tokens,
            stop=[],
        )
    else:
        raise ValueError(f"Unknown backend {backend}")
    code_lines = code.splitlines()

    collecting = False
    result_lines = []
    for line in code_lines:
        if line.startswith("```"):
            collecting = not collecting
            if not collecting:
                break
        elif collecting:
            result_lines.append(line)

    return ReplCodeAssistReply(
        code_pane="\n".join(result_lines),
        repl="",
        cells_to_update=[],
        extra="",
        ai_prompt=prompt,
        ai_response=code,
        run_time_secs=time.time() - start_time,
    )


def split_sheet_writes(
    codex_code: str, sheets: dict[int, Sheet]
) -> tuple[list[str], list["SheetCellUpdate"]]:
    cell_updates: list[SheetCellUpdate] = []
    result_lines = []
    for line in codex_code.splitlines():
        if ":=" in line:
            cell_code: str
            cell_id, cell_code = line.split(":=", 1)
            if is_cell(cell_id.strip()):
                address = Address.from_a1(cell_id)
                if sheet := sheets.get(address.sheet):
                    n_cols, n_rows = sheet.grid_size
                    if address.column < n_cols and address.row < n_rows:
                        cell_updates.append(
                            (Address.from_a1(cell_id), cell_code.strip(), None, None)
                        )
                        continue
        result_lines.append(line)
    return result_lines, cell_updates


@dataclass
class ChatTag:
    name: str
    content: str = ""
    properties: dict[str, str] = field(default_factory=dict)

    def __str__(self) -> str:
        props = " ".join(f"{k}={{{v}}}" for k, v in self.properties.items())
        if props:
            props = " " + props
        return f"<|{self.name}{props}|>{self.content}</|{self.name}|>"


def ai_table_to_tag(table: TableForAI) -> ChatTag:
    name = repr(table.sheet_name)
    return ChatTag(
        "table",
        properties={
            "sheet": name,
            "range": str(table.range),
            "columns": str(table.columns),
        },
    )


def create_message(
    role: str, content: str, *, tags: list[ChatTag] | None = None
) -> dict[str, Any]:
    if tags:
        content += "\n\n" + "\n".join(str(tag) for tag in tags)
    return {
        "role": role,
        "content": content.strip(),
    }


def table_dict_to_tag(table: dict[str, Any]) -> ChatTag:
    return ai_table_to_tag(
        TableForAI(
            sheet_name=table["sheet"],
            range=Range.from_a1(table["range"]),
            columns=[tuple(next(iter(col.items()))) for col in table["columns"]],  # type: ignore
        )
    )


TIKTOKEN_ENCODING = None


def tokens_for_string(string: str, model: str = GPT_35_TURBO) -> int:
    global TIKTOKEN_ENCODING
    if TIKTOKEN_ENCODING is None:
        TIKTOKEN_ENCODING = tiktoken.encoding_for_model(model)
    return len(TIKTOKEN_ENCODING.encode(string))


def num_tokens_from_messages(messages: list[dict], model: str = GPT_35_TURBO) -> int:
    """From https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb"""
    global TIKTOKEN_ENCODING
    if TIKTOKEN_ENCODING is None:
        TIKTOKEN_ENCODING = tiktoken.encoding_for_model(model)
    num_tokens = 0
    for message in messages:
        num_tokens += (
            4  # every message follows <im_start>{role/name}\n{content}<im_end>\n
        )
        for key, value in message.items():
            num_tokens += tokens_for_string(value)
            if key == "name":  # if there's a name, the role is omitted
                num_tokens += -1  # role is always required and always 1 token
    num_tokens += 2  # every reply is primed with <im_start>assistant
    return num_tokens


def extract_user_tags(message: dict[str, Any]) -> list[ChatTag]:
    user_tags = []
    if "code" in message:
        user_tags.append(ChatTag("code", content=reformat_code(message["code"])[0]))
    if "tables" in message:
        for table in message["tables"]:
            user_tags.append(table_dict_to_tag(table))
    if "sheet" in message:
        user_tags.append(
            ChatTag(
                "sheet",
                properties={
                    "sheet": message["sheet"],
                },
            )
        )
    return user_tags


def extract_response_tags(message: dict[str, Any]) -> list[ChatTag]:
    response = message["response"]
    response_tags = []
    if "code" in response:
        response_tags.append(
            ChatTag("code", content=reformat_code(response["code"])[0])
        )
    if "run" in response:
        response_tags.append(ChatTag("run", content=response["run"]))
    if "cells" in response:
        for cell in response["cells"]:
            response_tags.append(
                ChatTag(
                    "cell",
                    content=cell["value"],
                    properties={
                        "addr": cell["address"],
                    },
                )
            )
    return response_tags


def load_chat(path: Path) -> list[dict[str, Any]]:
    raw = yaml.safe_load(path.read_text())
    chat: list[dict[str, Any]] = [create_message("system", raw["system"])]
    for message in raw["dialog"]:
        try:
            chat.append(
                create_message(
                    USER_ROLE,
                    message["prompt"],
                    tags=extract_user_tags(message),
                ),
            )
            if isinstance(message["response"], str):
                chat.append(create_message(ASSISTANT_ROLE, message["response"]))
            else:
                chat.append(
                    create_message(
                        ASSISTANT_ROLE, "", tags=extract_response_tags(message)
                    )
                )
        except (KeyError, TypeError) as e:
            print(message)
            raise e
    return chat


def ai_history(cells: list[NotebookCell]) -> list[dict]:
    res = []
    for cell in cells:
        if cell.metadata is None:
            continue
        ai_prompt = cell.metadata.get("ai_prompt")
        ai_response = cell.metadata.get("ai_response")
        if ai_prompt is None or ai_response is None:
            continue
        res.append(create_message(USER_ROLE, ai_prompt))
        res.append(
            create_message(ASSISTANT_ROLE, ai_response),
        )
    return res


async def repl_code_assist(
    prompt: str,
    prev_code_pane: str,
    ai_tables: list[TableForAI],
    current_sheet_name: str,
    history: list[dict] | None = None,
    gs_mode: bool = False,
) -> ReplCodeAssistReply:
    if gs_mode:
        res = await simple_code_edit(prompt, prev_code_pane)
        return res
    chat = load_chat(
        Path(__file__).parent
        / "code_prompts"
        / ("chat_gsheet.yaml" if gs_mode else "chat.yaml")
    )

    tags = [ChatTag("code", content=prev_code_pane)]

    table_tag_budget = 150
    for table in sorted(ai_tables, key=lambda t: len(str(t.columns))):
        tag = ai_table_to_tag(table)
        tag_tokens = tokens_for_string(str(tag))
        if tag_tokens <= table_tag_budget:
            tags.append(tag)
            table_tag_budget -= tag_tokens

    tags.append(ChatTag("sheet", content=current_sheet_name))

    user_message = create_message(USER_ROLE, prompt, tags=tags)
    chat.append(user_message)

    tokens = num_tokens_from_messages(chat, model=GPT_4O)

    if history:
        end_of_history = len(history) - 1
        while end_of_history >= 1:
            history_tokens = num_tokens_from_messages(
                [history[end_of_history], history[end_of_history - 1]], model=GPT_4O
            )
            if tokens + history_tokens > CHAT_GPT_MAX_TOKENS - REPL_REPLY_TOKENS:
                break
            if (
                history[end_of_history - 1]["content"]
                and history[end_of_history]["content"]
            ):
                chat.insert(len(chat) - 1, history[end_of_history - 1])
                chat.insert(len(chat) - 1, history[end_of_history])
                tokens += history_tokens
            end_of_history -= 2

    open_ai_response_text = await open_ai_call(
        chat,
        api_endpoint="https://api.openai.com/v1/chat/completions",
        model=GPT_4O,
        max_tokens=REPL_REPLY_TOKENS,
        stop=[],
    )
    ai_logger.info(
        json.dumps(
            {"user_message": user_message["content"], "response": open_ai_response_text}
        ),
        extra={"labels": {"type": "repl_code_assist"}},
    )

    if not open_ai_response_text:
        return ReplCodeAssistReply(prev_code_pane)

    repl_lines = []
    code_panel_code = []
    cells_to_update = []

    response_tags = [*extract_tags(open_ai_response_text)]
    for tag_name, tag_attrs, tag_content, _start, _end in response_tags:
        if tag_name == "run":
            repl_lines.append(tag_content)
        elif tag_name == "code":
            code_panel_code.append(tag_content)
        elif tag_name == "cell" and tag_content and "addr" in tag_attrs:
            cells_to_update.append((tag_attrs["addr"], tag_content))

    extra = open_ai_response_text
    for _name, _attrs, _content, start, end in reversed(response_tags):
        extra = extra[:start] + extra[end:]
    extra = extra.strip()

    return ReplCodeAssistReply(
        "\n".join(code_panel_code).strip() if code_panel_code else prev_code_pane,
        repl="\n".join(repl_lines),
        cells_to_update=cells_to_update,
        extra=extra,
        ai_prompt=user_message["content"],
        ai_response=open_ai_response_text,
    )


def parse_tag_attrs(attrs: str) -> typing.Iterator[tuple[str, str]]:
    attrs = attrs.strip()
    while attrs:
        if "=" not in attrs:
            raise ValueError(f"Expected =, got {attrs}")

        name, rest = attrs.split("=", 1)

        if not rest.startswith("{"):
            raise ValueError(f"Expected {{, got {rest}")

        rest = rest[1:]
        opens = [0]
        for i, char in enumerate(rest):
            if char == "{":
                opens.append(i)
            elif char == "}":
                if not opens:
                    raise ValueError(f"Unexpected }} in {rest}")
                opens.pop()
                if not opens:
                    break
        else:
            raise ValueError(f"Expected }} in {rest}")
        yield name, rest[:i]
        attrs = rest[i + 1 :].strip()


def parse_tag(open_tag: str) -> tuple[str, dict[str, str]]:
    tag = open_tag[len("<|") : -len("|>")]
    if " " not in tag:
        return tag, {}
    name, attrs_str = tag.split(" ", 1)
    try:
        attrs = dict(parse_tag_attrs(attrs_str))
    except ValueError:
        print("Failed to parse tag", open_tag, file=sys.stderr)
        attrs = {}
    return name, attrs


def extract_tags(
    code: str,
) -> typing.Iterator[tuple[str, dict[str, str], str, int, int]]:
    open_tag_format = re.compile(r"\<\|.*?\|\>")
    start = 0
    while start < len(code):
        match = open_tag_format.search(code[start:])
        if not match:
            break
        tag_start = match.start() + start
        start += match.end()
        open_tag = match.group()
        tag_name, tag_attrs = parse_tag(open_tag)
        close = re.search(rf"\<\/\|{tag_name}\|\>", code[start:])
        if not close:
            print("tag", open_tag, "has no closing tag")
            break
        tag_content = code[start : close.start() + start]
        yield tag_name, tag_attrs, tag_content, tag_start, close.end() + start
        start += close.end()


def maybe_inline_code(cell_ids: list[str], code: str) -> str | None:
    """Return a formula if the code is simple enough using the cell_ids"""
    if len(cell_ids) > 2:
        return None
    lines = code.split("\n")
    if len(lines) != 2:
        return None
    formula = lines[1].strip()
    return_statement = "return "
    if not formula.startswith(return_statement):
        return None
    formula = formula[len(return_statement) :]

    p = lines[0].find("(")
    if p == -1:
        return None
    p1 = lines[0].find(")", p)
    elems = [x.strip() for x in lines[0][p + 1 : p1].split(",")]
    if len(elems) != len(cell_ids):
        return None
    for elem, cell_id in zip(elems, cell_ids):
        formula = formula.replace(elem, cell_id)
    return formula


async def try_codex(
    context: list[str],
) -> tuple[str, str] | None:
    *params, target = context

    chat = load_chat(
        Path(__file__).parent / "code_prompts" / "write_function.yaml",
    )

    user_message = create_message(USER_ROLE, f"({', '.join(params)}) -> {target}")
    chat.append(user_message)

    open_ai_response_text = await open_ai_call(
        chat,
        api_endpoint="https://api.openai.com/v1/chat/completions",
        model=GPT_35_TURBO,
        max_tokens=REPL_REPLY_TOKENS,
        stop=[],
    )

    if not open_ai_response_text:
        return None

    response_tags = [*extract_tags(open_ai_response_text)]
    for tag_name, tag_attrs, tag_content, _start, _end in response_tags:
        if tag_name == "code":
            code = tag_content
            break
    else:
        return None

    code = code.strip()
    if not code:
        return None
    first_line = code.split("\n")[0].strip()
    if not first_line.startswith("def ") or not first_line.endswith(":"):
        return None
    if first_line.count(",") != len(params) - 1:
        return None
    p = first_line.find("(")
    if p == -1:
        return None
    function_name = first_line[4:p]

    return function_name, code


async def fill_in_table(to_fill_in: list[list[str]]) -> list[list[Any]] | None:
    chat = load_chat(
        Path(__file__).parent / "code_prompts" / "fill_in_table.yaml",
    )

    user_message = create_message(
        USER_ROLE,
        ROW_SEPARATOR.join(CELL_SEPARATOR.join(row) for row in to_fill_in),
    )
    chat.append(user_message)

    open_ai_response_text = await open_ai_call(
        chat,
        api_endpoint="https://api.openai.com/v1/chat/completions",
        model=GPT_35_TURBO,
        max_tokens=REPL_REPLY_TOKENS,
        stop=[],
    )

    if not open_ai_response_text:
        return None

    cells = [
        line.split(CELL_SEPARATOR)
        for line in open_ai_response_text.split(ROW_SEPARATOR)
    ]
    if len(cells) != len(to_fill_in) or any(
        len(row) != len(to_fill_in[0]) for row in cells
    ):
        print("GPT3 returned a table with a different shape")
        return None
    return cells


def merge_code_reply(old_code: str, new_code: str) -> str | None:
    def extract_symbols_and_imports(
        code: str,
    ) -> tuple[list[str], list[tuple[str, str]]]:
        def maybe_prefix(line: str) -> str:
            if line and line[0] in "#%!'":
                return "'" + line.replace("'", "\\'") + "'"
            return line

        code = "\n".join(maybe_prefix(line) for line in code.splitlines())
        compiled_code = compile_expression(
            code, compute_cells_mentioned=False, reformat_compiled_code=False
        )
        tree = ast.parse(compiled_code.compiled_code)
        lines = code.splitlines()

        imports = []
        symbols = []
        start_line = 0
        for node in tree.body:
            node_code = "\n".join(lines[start_line : node.end_lineno])
            start_line = node.end_lineno if node.end_lineno is not None else -1
            if isinstance(node, ast.Import | ast.ImportFrom):
                imports.append(node_code)
            else:
                if hasattr(node, "name"):
                    node_name = node.name
                elif isinstance(node, ast.Assign):
                    node_name = ", ".join(
                        target.id for target in node.targets if hasattr(target, "id")
                    )
                else:
                    node_name = None
                symbols.append((node_name, node_code))
        return imports, symbols

    try:
        old_imports, old_symbols = extract_symbols_and_imports(old_code)
    except SyntaxError:
        return new_code

    try:
        new_imports, new_symbols = extract_symbols_and_imports(new_code)
    except SyntaxError:
        return None
    keep_imports = []

    for imp in old_imports:
        if imp not in new_imports:
            keep_imports.append(imp)

    keep_symbols = []
    new_names = {name for name, _ in new_symbols}
    for name, node in old_symbols:
        if name is None or name not in new_names:
            keep_symbols.append((name, node))

    merged_lines = [
        *keep_imports,
        *new_imports,
        *[body for _, body in keep_symbols],
        *([""] if keep_symbols and new_symbols else []),
        *[body for _, body in new_symbols],
    ]

    def maybe_unprefix(line: str) -> str:
        if line and line[0] == "'":
            return line[1:-1].replace("\\'", "'")
        return line

    merged = "\n".join(maybe_unprefix(line) for line in merged_lines).strip()
    return merged


async def ai_snippet_reply(
    prompt: str, sheet_data: SheetData | None
) -> tuple[str, str] | None:
    if sheet_data:
        data = [
            [str(cell) if cell != "" else None for cell in row]
            for row in sheet_data.values
        ]
        sheet_name = sheet_data.name
        cells = grid_to_values(data)
        table_info = ""
        for table in ai_tables_for_sheet(cells, sheet_name):
            a1 = table.range.to_a1()
            if table.sheet_name:
                a1 = f"{table.sheet_name}!{a1}"
            table_values = [
                [data[addr.row][addr.column] for addr in row] for row in table.range
            ]
            table_formatted = ",\n    ".join(
                "[" + ",".join(str(x) for x in row) + "]" for row in table_values
            )
            table_info += f">{a1} = [{table_formatted}]\n"
            prompt = table_info + prompt

    messages = [
        create_message(
            "system",
            "You are a smart software engineer who helps writing python code "
            "that runs on top of a spreadsheet. You can access the spreadsheet data directly using excel "
            "notation. For example:\n"
            + "A1 = 5\n"
            + "Will set the value of cell A1 to 5. Reading ranges also works:\n"
            + "for x in A1:A5:\n"
            + "    print(x)\n"
            + "You can write to the spreadsheet by just writing a value, list or list of lists to a "
            + "specific cell; values will spill. Convert a cell range to a dataframe like:\n"
            + "df = A1:B3.to_dataframe()\n"
            + "You can return code and/or one message to show the user. Embed the code in triple quotes."
            + "A message you want to show the user should be one line that starts with @\n"
            + "You can have at most one code block and one message of one line.\n"
            + "If asked to write a function, return the function definition only, not the call to the function.\n"
            + "If asked to create a UI, use streamlit, but embed the streamlit code in a function decorated with "
            + "@nt.streamlit.\n"
            + "When using streamlit, prefer altair or plotly for visualizations and maps over the simpler direct."
            + "streamlit calls so the user can customize things better.\n"
            + "The user prompt is optionaly preceded by information about the spreadsheet. This is all in the form of "
            + ">[cell_id] = [[value1, value2...], [value3, value4...]]",
        )
    ]

    def join_example(
        prompt: str, tables: list[tuple[str, list[list[str | float | int]]]]
    ) -> str:
        res = ""
        for cell_org, table in tables:
            res += f">{cell_org} = {table}\n"
        return res + prompt

    for example, code in [
        (
            "Write a function that takes a list of numbers and returns the sum",
            ["def sum_numbers(numbers):", "    return sum(numbers)"],
        ),
        (
            join_example(
                "Visualize the sources of revenue",
                [
                    (
                        "Sheet3!B2",
                        [
                            ["Department", "Head", "Income"],
                            ["Consulting", "John", 1000],
                            ["Widgets", "Jane", 2000],
                            ["Engineering", "Jim", 3000],
                        ],
                    )
                ],
            ),
            [
                "import streamlit as st",
                "import neptyne as nt",
                "import altair as alt",
                "",
                "@nt.streamlit",
                "def visualize_revenue():",
                "    st.title('Revenue by Department')",
                "    df = Sheet3!B2:D5.to_dataframe()",
                "    st.bar_chart(df['Income'])",
                "    chart = alt.Chart(df).mark_bar().encode(",
                "        x=alt.X('Department', title=None),"
                "        y=alt.Y('Income', title='Income')",
                "    )",
                "    st.altair_chart(chart, use_container_width=True)",
            ],
        ),
        (
            "Write a function that runs every day at 3pm and adds 1 to the values in A1 to A3",
            [
                "import neptyne as nt",
                "",
                "@nt.daily(15, 0):",
                "def add_one():",
                "    col = A1:A3",
                "    for idx, cell in enumerate(col):",
                "        col[idx] = cell + 1",
            ],
        ),
        (
            "How do I run a function in the spreadsheet?",
            '@you can enter in a cell =Py("your_function", param) to make it run',
        ),
        (
            join_example(
                "Look up a capital given a country",
                [
                    (
                        "A1",
                        [
                            ["Country", "Capital"],
                            ["USA", "Washington"],
                            ["France", "Paris"],
                        ],
                    )
                ],
            ),
            [
                "def lookup_capital(country):",
                "    d = {country: capital for country, capital in A1:B3}",
                "    return d.get(country)",
            ],
        ),
        (
            "How can I install a python package",
            "@Use the 'Install Python Packages' menu option",
        ),
        (
            "Create an app that asks for a name and writes it to A1",
            [
                "import streamlit as st",
                "import neptyne as nt",
                "",
                "@nt.streamlit",
                "def write_name():",
                "    name = st.text_input('Name')",
                "    if st.button('Write') and name:",
                "        A1 = name",
            ],
        ),
        (
            "How does spilling work in Neptyne?",
            "@Best to look at the documentation at: https://docs.neptyne.com/kernel/neptyne_api.html",
        ),
        (
            "create a function that will call the openai API to summarize the text in a cell",
            [
                "def summarize(text):",
                "    # No key needed; Neptyne provides one:",
                "    client = OpenAI()",
                "    prompt = f'Summarize the following text: {text}'",
                "    completion = client.chat.completions.create(",
                '        model="gpt-4o",',
                "        messages=[",
                "            {",
                '                "role": "assistant",',
                '                "content": prompt,',
                "            },",
                "        ],",
                "    )",
                "    return completion.choices[0].message.content",
            ],
        ),
    ]:
        messages.append(create_message(USER_ROLE, example))
        if isinstance(code, str):
            code = [code]
        if code[-1].startswith("@"):
            *code, message = code
        else:
            message = ""
        messages.append(
            create_message(ASSISTANT_ROLE, "\n".join(["```", *code, "```", message]))
        )

    messages.append(create_message(USER_ROLE, prompt))

    open_ai_response_text = await open_ai_call(
        messages,
        api_endpoint="https://api.openai.com/v1/chat/completions",
        model=GPT_4O,
        max_tokens=REPL_REPLY_TOKENS,
    )
    ai_logger.info(
        json.dumps({"user_message": prompt, "response": open_ai_response_text}),
        extra={"labels": {"type": "ai_snippet_reply"}},
    )

    if not open_ai_response_text:
        return None
    lines = []
    msg = ""
    in_code = False
    for line in open_ai_response_text.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        elif in_code:
            lines.append(line)
        elif line.startswith("@"):
            msg = line[1:]
    return msg, "\n".join(lines)
