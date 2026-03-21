#!/bin/bash

# WeWatch Test Runner Script
# Usage: ./run_tests.sh [option]
# Options: all, utils, models, handlers, coverage, watch

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Navigate to project root
cd "$(dirname "$0")/.."

echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   WeWatch Test Suite Runner       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════╝${NC}"
echo ""

run_all_tests() {
    echo -e "${GREEN}Running all tests...${NC}"
    go test ./tests/backend/... -v -count=1
}

run_utils_tests() {
    echo -e "${GREEN}Running utils tests...${NC}"
    go test ./tests/backend/unit/utils/... -v
}

run_models_tests() {
    echo -e "${GREEN}Running models tests...${NC}"
    go test ./tests/backend/unit/models/... -v
}

run_handlers_tests() {
    echo -e "${GREEN}Running handlers tests...${NC}"
    go test ./tests/backend/unit/handlers/... -v
}

run_coverage() {
    echo -e "${GREEN}Running tests with coverage...${NC}"
    go test ./tests/backend/... -coverprofile=coverage.out -covermode=atomic
    
    echo -e "\n${BLUE}Coverage Summary:${NC}"
    go tool cover -func=coverage.out | tail -n 1
    
    echo -e "\n${YELLOW}Generating HTML coverage report...${NC}"
    go tool cover -html=coverage.out -o coverage.html
    echo -e "${GREEN}✓ Coverage report saved to coverage.html${NC}"
    
    echo -e "\n${BLUE}Top 10 files by coverage:${NC}"
    go tool cover -func=coverage.out | grep -v "total:" | sort -k3 -nr | head -n 10
}

run_quick() {
    echo -e "${GREEN}Running quick test suite (no integration)...${NC}"
    go test ./tests/backend/unit/... -v -short
}

watch_tests() {
    echo -e "${YELLOW}Watching for changes... (Press Ctrl+C to stop)${NC}"
    
    # Check if fswatch is installed
    if ! command -v fswatch &> /dev/null; then
        echo -e "${RED}fswatch is not installed. Install it with:${NC}"
        echo "  macOS: brew install fswatch"
        echo "  Linux: apt-get install fswatch"
        exit 1
    fi
    
    fswatch -o backend/internal tests/backend | while read; do
        clear
        echo -e "${BLUE}Files changed, running tests...${NC}\n"
        go test ./tests/backend/... -v
        echo -e "\n${GREEN}Waiting for changes...${NC}"
    done
}

# Parse command line arguments
case "${1:-all}" in
    all)
        run_all_tests
        ;;
    utils)
        run_utils_tests
        ;;
    models)
        run_models_tests
        ;;
    handlers)
        run_handlers_tests
        ;;
    coverage)
        run_coverage
        ;;
    quick)
        run_quick
        ;;
    watch)
        watch_tests
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo ""
        echo "Usage: ./run_tests.sh [option]"
        echo ""
        echo "Options:"
        echo "  all       - Run all tests (default)"
        echo "  utils     - Run utility tests only"
        echo "  models    - Run model tests only"
        echo "  handlers  - Run handler tests only"
        echo "  coverage  - Run tests with coverage report"
        echo "  quick     - Run quick test suite (no integration)"
        echo "  watch     - Watch for changes and run tests automatically"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✓ Done!${NC}"
