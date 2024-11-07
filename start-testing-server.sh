#!/usr/bin/env bash

SCRIPT_DIR=$(dirname $(readlink -f $0))

export GOOGLE_CLOUD_PROJECT=demo-neptyne
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_CONFIG='{"projectId": "demo-neptyne"}'
export PYTHONUNBUFFERED=1
export GOOGLE_APPLICATION_CREDENTIALS="$SCRIPT_DIR"/testing/mock-credentials.json

cd "$(git rev-parse --git-dir)"/.. || exit
python -m server.application --inmemory-db --port 8878
