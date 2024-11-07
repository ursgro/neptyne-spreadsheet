import argparse
import subprocess
import sys

from server.models import (
    Tyne,
    db,
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tyne_file_name",
        help="Filename, i.e. bit after /-/ in the url",
        type=str,
        required=True,
    )
    parser.add_argument(
        "--screenshot",
        help="Path to screenshot to upload to this tyne",
        type=str,
        default=None,
    )
    parser.add_argument("--set_in_gallery", action=argparse.BooleanOptionalAction)

    args = parser.parse_args()

    if not args.screenshot.endswith(".jpg") and not args.screenshot.endswith(".jpeg"):
        print("Screenshot must be a jpeg file")
        sys.exit(1)

    with db.sessionmaker() as session:
        tynes = session.query(Tyne).filter(Tyne.file_name == args.tyne_file_name).all()
        if not tynes:
            print(f"No tyne found with file_name {args.tyne_file_name}")
            sys.exit(1)
        tyne = tynes[0]
        tyne.in_gallery = args.set_in_gallery
        if args.screenshot:
            tyne.screenshot_url = f"https://storage.googleapis.com/neptyne-screenshots/{tyne.file_name}.jpg"
            subprocess.run(
                [
                    "gsutil",
                    "cp",
                    args.screenshot,
                    f"gs://neptyne-screenshots/{tyne.file_name}.jpg",
                ],
                check=True,
            )
        session.add(tyne)
        session.commit()
