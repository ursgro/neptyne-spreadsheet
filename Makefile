.PHONY : all

all: requirements.txt requirements-dev.txt neptyne_kernel/requirements.txt

requirements.txt: requirements.in neptyne_kernel/requirements.in
	uv pip compile requirements.in -o requirements.txt

requirements-dev.txt: requirements-dev.in requirements.txt neptyne_kernel/requirements*.in
	uv pip compile requirements-dev.in -o requirements-dev.txt

neptyne_kernel/requirements.txt: neptyne_kernel/requirements.in neptyne_kernel/requirements-extras.in neptyne_kernel/requirements-reflex.in
	uv pip compile neptyne_kernel/requirements*.in -o neptyne_kernel/requirements.txt
