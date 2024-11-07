import sys
from pathlib import Path
from unittest import mock

import pdoc
import pdoc.markdown2
import pdoc.web
from jinja2 import Template


def write_release_notes(source: Path, template: Path, destination: Path) -> None:
    body = pdoc.markdown2.markdown(source.read_text())
    template = Template(template.read_text())
    html = template.render(content=body)
    destination.write_text(html)


def main(serve=False, quiet=False):
    src_dir = Path(__file__).parent
    template_dir = src_dir / "pdoc_templates"
    docs_path = src_dir.parent / "docs" / "public"

    write_release_notes(
        src_dir.parent / "release_notes.md",
        template_dir / "release_notes.html.jinja2",
        docs_path / "release_notes.html",
    )
    pdoc.render.configure(
        favicon="https://app.neptyne.com/img/favicon-32x32.png",
        logo="https://app.neptyne.com/img/logo.jpg",
        logo_link="https://neptyne.com",
        show_source=False,
        template_directory=template_dir,
    )
    modules = ["neptyne_kernel.neptyne_api"]
    with mock.patch("neptyne_kernel.dash.get_ipython_mockable"):
        if serve:
            httpd = pdoc.web.DocServer(("localhost", 8080), modules)
            with httpd:
                url = "http://localhost:8080/"
                print(f"Serving documentation at {url}")
                if not quiet:
                    pdoc.web.open_browser(url)
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    httpd.server_close()
                    return
        else:
            pdoc.pdoc(
                *modules,
                output_directory=docs_path,
            )


if __name__ == "__main__":
    server = "--serve" in sys.argv
    quiet = "--quiet" in sys.argv
    main(server, quiet)
