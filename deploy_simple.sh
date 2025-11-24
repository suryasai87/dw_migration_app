#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print with color
print_status() {
    echo -e "${GREEN}[✓] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

print_error() {
    echo -e "${RED}[✗] $1${NC}"
}

# Check if required arguments are provided
if [ "$#" -ne 2 ]; then
    print_error "Usage: $0 <workspace_path> <app_name>"
    print_error "Example: $0 /Workspace/my-react-app my-app-name"
    exit 1
fi

WORKSPACE_PATH=$1
APP_NAME=$2

# Step 1: Build the React frontend
print_status "Building React frontend..."
cd frontend
npm run build
if [ $? -ne 0 ]; then
    print_error "Failed to build React frontend"
    exit 1
fi
print_status "React build successful"

# Step 2: Create directories in Databricks workspace
print_status "Creating directories in Databricks workspace..."
databricks workspace mkdirs "${WORKSPACE_PATH}" 2>/dev/null
databricks workspace mkdirs "${WORKSPACE_PATH}/static" 2>/dev/null

# Step 3: Deploy backend files
print_status "Deploying backend files..."
cd ../backend
databricks workspace import -l PYTHON -f SOURCE -o app.py "${WORKSPACE_PATH}/app.py"
databricks workspace import -l PYTHON -f SOURCE -o app.yaml "${WORKSPACE_PATH}/app.yaml"
databricks workspace import -l PYTHON -f SOURCE -o requirements.txt "${WORKSPACE_PATH}/requirements.txt"

# Step 4: Deploy frontend build files
print_status "Deploying frontend files..."
cd ../frontend/build
for file in $(find . -type f); do
    # Remove leading ./ from file path
    DEST_PATH=${file#./}
    # Create parent directories if they don't exist
    PARENT_DIR=$(dirname "${WORKSPACE_PATH}/static/${DEST_PATH}")
    databricks workspace mkdirs "${PARENT_DIR}" 2>/dev/null
    # Import file
    databricks workspace import -o "${file}" "${WORKSPACE_PATH}/static/${DEST_PATH}" 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "Uploaded: ${DEST_PATH}"
    else
        print_warning "Failed to upload: ${DEST_PATH}"
    fi
done

# Step 5: Deploy the app
print_status "Deploying app to Databricks..."
databricks apps deploy "${APP_NAME}" --source-code-path "${WORKSPACE_PATH}"
if [ $? -ne 0 ]; then
    print_error "Failed to deploy app"
    exit 1
fi

# Step 6: Get app status and URL
print_status "Getting app status..."
databricks apps get "${APP_NAME}"

print_status "Deployment complete! Your app should be available at:"
echo -e "${GREEN}https://${APP_NAME}-$(databricks workspace get-status | jq -r '.workspace_id').cloud.databricksapps.com${NC}"

# Print helpful next steps
echo ""
print_status "Next steps:"
echo "1. Visit your Databricks workspace to check the app status"
echo "2. If the app is not running, start it using: databricks apps start ${APP_NAME}"
echo "3. Check app logs using: databricks apps logs ${APP_NAME}" 