#!/bin/bash
export HOME=/home/chibuzor_dev
export GOPATH=/home/chibuzor_dev/go
cd /home/chibuzor_dev/WeWatch/backend
echo Building...
/home/chibuzor_dev/.local/opt/go/bin/go build -o wewatch-backend-new ./cmd/server/main.go
echo Exit: $?
ls -la wewatch-backend-new 2>/dev/null || echo BINARY_NOT_CREATED
