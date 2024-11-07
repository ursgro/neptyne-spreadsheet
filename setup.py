import os
import shutil
from contextlib import contextmanager

from setuptools import setup

TEMP_BUILD_DIR = "neptyne_build"
NEPTYNE_PACKAGE_DIR = os.path.join(TEMP_BUILD_DIR, "neptyne")

SUBDIRS_TO_COPY = ["server", "neptyne_kernel", "frontend/build"]


@contextmanager
def prepare_neptyne_package():
    if os.path.exists(TEMP_BUILD_DIR):
        shutil.rmtree(TEMP_BUILD_DIR)
    os.makedirs(NEPTYNE_PACKAGE_DIR)
    open(os.path.join(NEPTYNE_PACKAGE_DIR, "__init__.py"), "w").close()
    try:
        for subdir in SUBDIRS_TO_COPY:
            print(f"Copying {subdir} to {NEPTYNE_PACKAGE_DIR}")
            dest_dir = os.path.join(NEPTYNE_PACKAGE_DIR, subdir)
            shutil.copytree(
                subdir,
                dest_dir,
                ignore=shutil.ignore_patterns("*.DS_Store", "__pycache__"),
            )
        shutil.move(
            os.path.join(NEPTYNE_PACKAGE_DIR, "server", "__main__.py"),
            NEPTYNE_PACKAGE_DIR,
        )
        yield
    finally:
        shutil.rmtree(TEMP_BUILD_DIR)


def parse_requirements(filename):
    with open(filename) as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]


requirements = parse_requirements("requirements.in")

with prepare_neptyne_package():
    setup(
        name="neptyne",
        version="1.0",
        description="A python-based spreadsheet with support for Google Sheets",
        author="Neptyne",
        author_email="team@neptyne.com",
        python_requires=">=3.10",
        packages=["neptyne"],
        package_dir={"neptyne": NEPTYNE_PACKAGE_DIR},
        package_data={"neptyne": ["**/*"]},
        include_package_data=True,
        install_requires=requirements,
        entry_points={
            "console_scripts": [
                "neptyne=neptyne.server.application:main",
            ],
        },
        project_urls={
            "Homepage": "https://neptyne.com",
            "Documentation": "https://docs.neptyne.com",
            "Repository": "https://github.com/neptyneco/neptyne.git",
        },
    )
