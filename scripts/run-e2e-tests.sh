#!/bin/bash

# Script para executar testes E2E com Maestro
# Uso: ./run-e2e-tests.sh [platform] [test-file]

PLATFORM=${1:-android}
TEST_FILE=${2:-maestro/}

echo "🚀 Executando testes E2E com Maestro"
echo "📱 Plataforma: $PLATFORM"
echo "📋 Teste: $TEST_FILE"
echo ""

# Verificar se Maestro está instalado
if ! command -v maestro &> /dev/null; then
    echo "❌ Maestro CLI não encontrado!"
    echo "📥 Instale o Maestro CLI:"
    echo "   curl -Ls 'https://get.maestro.mobile.dev' | bash"
    echo "   export PATH='\$PATH:\$HOME/.maestro/bin'"
    exit 1
fi

# Verificar se o app está buildado
if [ "$PLATFORM" = "android" ]; then
    APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
    if [ ! -f "$APK_PATH" ]; then
        echo "❌ APK não encontrado em $APK_PATH"
        echo "📦 Faça o build primeiro:"
        echo "   npm run prebuild:dev"
        echo "   cd android && ./gradlew assembleDebug"
        exit 1
    fi
    echo "✅ APK encontrado: $APK_PATH"
elif [ "$PLATFORM" = "ios" ]; then
    echo "⚠️  iOS não configurado neste script"
    echo "   Use EAS Build para iOS: eas build --profile e2e --platform ios"
    exit 1
fi

echo ""
echo "🔍 Executando testes..."

# Executar testes
maestro test "$TEST_FILE" \
  --format junit \
  --output test-results.xml \
  --verbose

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Todos os testes passaram!"
else
    echo ""
    echo "❌ Alguns testes falharam (código: $EXIT_CODE)"
    echo "📊 Verifique test-results.xml para detalhes"
fi

exit $EXIT_CODE