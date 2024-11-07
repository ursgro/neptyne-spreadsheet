"""
Split cypress tests into buckets for parallelized runs on Github Actions.

Mostly this should use the pre-optimized buckets from:
https://staging.neptyne.dev/-/yg6xx0nyzq

"""

import hashlib
import os
import sys

preassigned = """0	specs/autocomplete_smoke.ts
0	specs/can_reference_other_cells_using_keyboard.ts
0	specs/runs_a_basic_spreadsheet_function.ts
0	specs/supports_excel_stuff.ts
1	specs/linter.ts
1	specs/checks_insert_delete_rows_columns.ts
2	specs/handles_sheet_styling.ts
2	specs/maintains_cells_after_reload.ts
3	specs/handles_output_streams.ts
3	specs/should_expand_editor_until_window_edge.ts
3	specs/should_test_common_cell_editor_scenarios.ts
4	specs/cell_id_picking_top_editor.ts
4	specs/renders_without_errors.ts
4	specs/supports_undo_redo.ts"""


if __name__ == "__main__":
    preassigned_dict = dict(
        (os.path.basename(line.split()[1]), int(line.split()[0]))
        for line in preassigned.splitlines()
    )

    bucket, buckets = map(int, sys.argv[1:])

    assert max(preassigned_dict.values()) == buckets - 1
    assert bucket < buckets

    def is_match(spec, bucket):
        if spec in preassigned_dict:
            return preassigned_dict[spec] == bucket
        print("no preassigned bucket for", spec, file=sys.stderr)
        return int(hashlib.md5(spec.encode()).hexdigest(), 16) % buckets == bucket

    files = sys.stdin.readlines()
    matched = [
        f.rstrip() for f in files if is_match(os.path.basename(f.strip()), bucket)
    ]
    print("CY_SPEC=", ",".join(matched), sep="")
