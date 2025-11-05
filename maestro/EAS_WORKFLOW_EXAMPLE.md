# EAS Workflow para Testes E2E com Maestro

Este arquivo define um workflow do EAS para executar testes E2E com Maestro após o build.

## Como usar

1. Salve este arquivo como `.eas/workflows/e2e.yml`
2. Execute: `eas workflow:run .eas/workflows/e2e.yml`

## Workflow

```yaml
name: E2E Tests with Maestro

on:
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform to test'
        required: true
        default: 'android'
        type: choice
        options:
          - android
          - ios

jobs:
  build:
    name: Build app for E2E
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Build for E2E
        run: eas build --profile e2e --platform ${{ inputs.platform }} --non-interactive

      - name: Upload build artifact
        uses: actions/upload-artifact@v3
        with:
          name: app-build-${{ inputs.platform }}
          path: dist/

  test:
    name: Run E2E Tests
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Download build artifact
        uses: actions/download-artifact@v3
        with:
          name: app-build-${{ inputs.platform }}
          path: dist/

      - name: Setup Maestro
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          export PATH="$PATH:$HOME/.maestro/bin"

      - name: Install Android SDK (for Android tests)
        if: inputs.platform == 'android'
        uses: android-actions/setup-android@v2

      - name: Create Android emulator
        if: inputs.platform == 'android'
        run: |
          echo "y" | $ANDROID_HOME/tools/bin/sdkmanager --install 'system-images;android-29;google_apis;x86'
          echo "no" | $ANDROID_HOME/tools/bin/avdmanager create avd -n test -k 'system-images;android-29;google_apis;x86'
          $ANDROID_HOME/emulator/emulator -avd test -no-audio -no-window &

      - name: Wait for emulator
        if: inputs.platform == 'android'
        run: |
          $ANDROID_HOME/platform-tools/adb wait-for-device
          $ANDROID_HOME/platform-tools/adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'

      - name: Install app on device
        run: |
          if [ "${{ inputs.platform }}" = "android" ]; then
            $ANDROID_HOME/platform-tools/adb install dist/*.apk
          else
            # iOS installation would require additional setup
            echo "iOS installation not configured in this workflow"
          fi

      - name: Run Maestro tests
        run: |
          export PATH="$PATH:$HOME/.maestro/bin"
          maestro test maestro/ --format junit > test-results.xml

      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results.xml
```
