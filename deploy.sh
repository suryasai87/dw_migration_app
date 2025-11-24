#!/bin/bash

# Accept parameters
APP_FOLDER_IN_WORKSPACE=${1:-"path_to_your_directory_on_databricks_workspace/react-app"}
LAKEHOUSE_APP_NAME=${2:-"react-app"}

# Frontend build and import
(
 cd frontend
 npm run build
 databricks workspace import-dir build "$APP_FOLDER_IN_WORKSPACE/static" --overwrite
) &

# Backend packaging
(
 cd backend
 mkdir -p build
 find . -mindepth 1 -maxdepth 1 -not -name '.*' -not -name "local_conf*" -not -name 'build' -not -name '__pycache__' -exec cp -r {} build/ \;
 if [ -f app_prod.py ]; then
   cp app_prod.py build/app.py
 fi
 databricks workspace import-dir build "$APP_FOLDER_IN_WORKSPACE" --overwrite
 rm -rf build
) &

# Wait for both background processes to finish
wait

# Deploy the application
databricks apps deploy "$LAKEHOUSE_APP_NAME" --source-code-path "$APP_FOLDER_IN_WORKSPACE"

# Print the app page URL
echo "Open the app page for details and permission: https://YOUR_WORKSPACE_URL/apps/$LAKEHOUSE_APP_NAME" 