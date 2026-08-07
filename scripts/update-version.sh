#!/bin/bash
# Script para gerar version.json antes do deploy
# Executado automaticamente via "predeploy" no package.json

COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
COMMIT_DATE=$(git log -1 --format="%cd" --date=format:"%d/%m/%Y %H:%M" 2>/dev/null || date "+%d/%m/%Y %H:%M")
BUILD_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > version.json << EOF
{
  "hash": "$COMMIT_HASH",
  "date": "$COMMIT_DATE",
  "buildAt": "$BUILD_TS"
}
EOF

echo "✅ version.json gerado: v$COMMIT_HASH · $COMMIT_DATE"
