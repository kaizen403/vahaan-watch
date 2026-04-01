#!/usr/bin/env bash
set -euo pipefail

ADMIN_USER="${ADMIN_USER:-azureuser}"
APP_DIR="/home/${ADMIN_USER}/app"
BINARY_PATH="${APP_DIR}/sdk_samples/samples/C++/build/05_cloud/cpp_sample_05_cloud"

echo "Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Installing build tools + CMake..."
sudo apt-get install -y build-essential cmake git unzip

echo "Installing Carmen Video SDK..."
cd ~
if compgen -G "carmen_video_sdk-*.zip" > /dev/null; then
  unzip -o carmen_video_sdk-*.zip -d carmen_sdk
  cd carmen_sdk
  if [ -f _install_all.sh ]; then
    sudo bash _install_all.sh
  else
    sudo bash install-carmen_video_sdk.sh || true
  fi
  cd ~
elif [ -d sdk_linux ] && [ -f sdk_linux/install-carmen_video_sdk.sh ]; then
  echo "Using Linux SDK payload from ~/sdk_linux..."
  cd sdk_linux
  sudo bash install-carmen_video_sdk.sh
  cd ~
else
  echo "ERROR: no Carmen Video SDK package found"
  echo "Provide one of the following before rerunning setup:"
  echo "  - ~/carmen_video_sdk-*.zip"
  echo "  - ~/sdk_linux/ with install-carmen_video_sdk.sh and the Linux tarballs"
  exit 1
fi

echo "Cloning repo..."
git clone https://github.com/kaizen403/carmen-anpr-scanner ~/app
cd ~/app

echo "Building C++ binary..."
mkdir -p sdk_samples/samples/C++/build
cd sdk_samples/samples/C++/build
cmake ..
cmake --build . --target cpp_sample_05_cloud -- -j2
cd ~/app

echo "Installing npm dependencies..."
npm install

echo "Building Next.js..."
cd apps/web && npm run build && cd ~/app

echo "Installing PM2..."
sudo npm install -g pm2

echo "Creating PM2 config..."
cat > ~/app/ecosystem.config.cjs << EOF
module.exports = {
  apps: [
    {
      name: "anpr-web",
      cwd: "${APP_DIR}/apps/web",
      script: "node_modules/.bin/next",
      args: "start -p 3001",
      env_file: "${APP_DIR}/apps/web/.env",
      restart_delay: 3000,
    },
    {
      name: "anpr-ws",
      cwd: "${APP_DIR}/apps/ws-server",
      script: "server.js",
      node_args: "--env-file=.env",
      restart_delay: 3000,
    },
  ],
};
EOF

echo ""
echo "Setup complete."
echo ""
echo "Now copy your .env files, then run:"
echo "  cd ~/app && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
