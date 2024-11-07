import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { Button, ButtonProps, Stack, Typography, styled } from "@mui/material";
import { toA1 } from "../SheetUtils";
import { getGSheetAppConfig } from "../gsheet_app_config";

interface Props {
  code: string;
  onDisableHint?: () => void;
  onDismissHint?: () => void;
}

const HintButton = styled(Button)<ButtonProps>(({ theme }) => ({
  fontSize: 12,
  padding: "2px",
  borderRadius: 2,
}));

interface TopLevelFunctionDefinition extends SyntaxNode {
  node: SyntaxNode & { nextSibling: SyntaxNode };
}

function isTopLevelFunctionDefinition(
  node: SyntaxNodeRef
): node is TopLevelFunctionDefinition {
  return (
    node.name === "def" &&
    node.node.parent?.type.name === "FunctionDefinition" &&
    node.node.parent?.parent?.type.name === "Script" &&
    node.node.nextSibling?.name === "VariableName"
  );
}

export const getExampleCode = (
  node: TopLevelFunctionDefinition,
  state: EditorState
): string => {
  const params = [];
  const paramListNode = node.node.nextSibling.nextSibling;
  if (paramListNode && paramListNode.name === "ParamList") {
    let node = paramListNode.firstChild;
    while (node?.nextSibling) {
      node = node.nextSibling;
      if (node.name === "VariableName") {
        params.push(toA1(params.length, 0));
      }
    }
  }
  const funcNameNode = node.node.nextSibling;
  const funcName = state.doc.sliceString(funcNameNode.from, funcNameNode.to);

  let argSeparator = ",";
  try {
    const locale = getGSheetAppConfig().gsheetLocale;
    if (locale) {
      const decimalSeparator = Intl.NumberFormat(
        locale.replace("_", "-")
      ).formatToParts(1.1)[1].value;
      if (decimalSeparator === ",") {
        argSeparator = ";";
      }
    }
  } catch (e) {
    console.error(e);
  }

  return `=PY(${[`"${funcName}"`, ...params].join(argSeparator + " ")})`;
};

export function* topLevelFunctions(
  state: EditorState
): Generator<TopLevelFunctionDefinition, null> {
  const tree = syntaxTree(state);
  const cursor = tree.cursor();
  while (cursor.next()) {
    if (isTopLevelFunctionDefinition(cursor.node)) {
      yield cursor.node;
    }
  }
  return null;
}

const GSHeetFunctionHint = ({ code, onDisableHint, onDismissHint }: Props) => {
  return (
    <Stack>
      <Typography variant="body2">Run code using</Typography>
      <Typography
        align="center"
        marginY={1}
        sx={{ fontFamily: "monospace" }}
        variant="caption"
      >
        {code}
      </Typography>
      <Stack direction="row" spacing={1}>
        <HintButton
          color="secondary"
          onClick={() => navigator.clipboard.writeText(code)}
          variant="contained"
        >
          Copy
        </HintButton>
        {onDisableHint && (
          <HintButton onClick={() => onDisableHint()} size="small" color="secondary">
            Disable Hint
          </HintButton>
        )}
        {onDismissHint && (
          <HintButton onClick={() => onDismissHint()} size="small" color="secondary">
            Close
          </HintButton>
        )}
      </Stack>
    </Stack>
  );
};

export default GSHeetFunctionHint;
