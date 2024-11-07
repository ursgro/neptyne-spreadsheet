#!/bin/sh
cd frontend
yarn --silent quicktype src/NeptyneProtocol.ts -l python | sed -e 's/assert isinstance(x, float)/assert isinstance(x, (float, int))/' | ruff format - > ../neptyne_kernel/neptyne_protocol.py
