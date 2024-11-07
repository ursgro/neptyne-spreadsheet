#!/bin/bash
git ls-files \
  | grep '.*\.py$' \
  | grep -v '^alembic/' \
  | grep -v '^excelint-service/' \
  | xargs ruff format --force-exclude server/code_prompts --check
