#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Setup inicial do ambiente de desenvolvimento do beauty-saas
# ─────────────────────────────────────────────────────────────
# Uso: ./infra/scripts/setup.sh
# Pré-requisitos: Node 22+, pnpm 11+, docker (opcional para DB)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$ROOT_DIR"

echo "▶ Verificar versões..."
node --version  # >= v22
pnpm --version  # >= v10

echo "▶ Instalar dependências (workspace)..."
pnpm install

echo "▶ Criar .env.local a partir de .env.example..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "  ✅ .env.local criado. EDITA antes de continuar!"
else
  echo "  ⏭️  .env.local já existe, a saltar."
fi

echo "▶ Validar typecheck..."
pnpm typecheck || echo "  ⚠️  typecheck falhou; consultar as limitações conhecidas no README"

echo ""
echo "✅ Setup completo."
echo ""
echo "Próximos passos:"
echo "  1. Editar .env.local com as tuas credenciais"
echo "  2. cd apps/landing && pnpm dev   # http://beauty.nbtech.local:3000"
echo ""
