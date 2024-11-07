import argparse
import csv
import json
import sys
from dataclasses import dataclass, field
from operator import attrgetter

# Latest query:
# select tyne.id, sheet.contents, tyne.name,  tyne_owner.handle, tyne.last_modified from sheet inner join tyne on sheet.tyne_id = tyne.id inner join tyne_owner on tyne.tyne_owner_id = tyne_owner.id
csv.field_size_limit(sys.maxsize)

parser = argparse.ArgumentParser(description="Analyze Neptyne db data for widget use")
parser.add_argument("--file", type=str, help="filename")

args = parser.parse_args()


@dataclass
class FindInfo:
    tyne_name: str
    tyne_user: str
    last_modified: str
    widget_violations: list[str] = field(default_factory=list)


def analyzeFile(filename: str) -> list[str]:
    f = open(filename)

    reader = csv.reader(f, delimiter=",", quotechar='"')

    tyne_id_to_info = {}

    for row in reader:
        try:
            tyne_id = row[0]
            sheet_contents = row[1]
            tyne_name = row[2]
            user = row[3]
            last_modified = row[4]

            def insert_widget_violation(s: str):
                if tyne_id not in tyne_id_to_info:
                    tyne_id_to_info[tyne_id] = FindInfo(
                        tyne_name=tyne_name, tyne_user=user, last_modified=last_modified
                    )
                tyne_id_to_info[tyne_id].widget_violations.append(s)

            parsed_contents = json.loads(sheet_contents)
            if not parsed_contents:
                continue
            for cell, info in parsed_contents.items():
                outputs = info["outputs"]
                if not outputs:
                    continue
                for output in outputs:
                    data = output["data"]
                    # print(output['data'])
                    widget = None
                    if "application/vnd.neptyne-widget.v1+json" in data:
                        widget = data["application/vnd.neptyne-widget.v1+json"]
                    elif "application/vnd.neptyne-output-widget.v1+json" in data:
                        widget = data["application/vnd.neptyne-output-widget.v1+json"]

                    if widget:
                        widget_name = widget.get("widget")
                        if widget.get("primaryColor") or widget.get("textColor"):
                            insert_widget_violation("Using color on input widget")
                        if widget_name == "scatter":
                            if widget.get("size"):
                                insert_widget_violation("Using size on scatter")
                        if widget_name == "line":
                            if widget.get("data"):
                                insert_widget_violation("Using data on line")
                        if widget_name == "treemap":
                            if widget.get("values"):
                                insert_widget_violation("Using values on treemap")
                        if widget_name == "map":
                            if widget.get("caption") or widget.get("text"):
                                insert_widget_violation("Using caption or text on map")
        except Exception:
            pass

    f.close()

    sorted_values = sorted(
        tyne_id_to_info.values(), key=attrgetter("last_modified"), reverse=True
    )

    for value in sorted_values:
        print(
            f"{value.last_modified}, {value.tyne_name}, {value.tyne_user}, {value.widget_violations}"
        )


analyzeFile(args.file)
