#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="anpr-rg"
VM_NAME="anpr-vm"
LOCATION="centralindia"
VM_SIZE="Standard_B2ls_v2"
ADMIN_USER="azureuser"
APP_DIR="/home/${ADMIN_USER}/app"
BINARY_PATH="${APP_DIR}/sdk_samples/samples/C++/build/05_cloud/cpp_sample_05_cloud"

echo "Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

echo "Creating VM (Ubuntu 22.04, $VM_SIZE)..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image Ubuntu2204 \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --generate-ssh-keys \
  --output table

echo "Opening ports 80, 443, 3001, 3002..."
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port "80" \
  --priority 1001

az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port "443" \
  --priority 1002

az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port "3001" \
  --priority 1003

az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port "3002" \
  --priority 1004

VM_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --show-details \
  --query publicIps \
  --output tsv)

echo ""
echo "VM created: $VM_IP"
echo ""
echo "Next steps:"
echo "  1. Copy SDK payload to VM:"
echo "     # Option A: use the Linux tarballs already bundled in this repo"
echo "     scp sdk_linux/* $ADMIN_USER@$VM_IP:~/sdk_linux/"
echo "     # Option B: copy the SDK ZIP installer to the VM home directory"
echo "     scp carmen_video_sdk-1.2.1.35130.zip $ADMIN_USER@$VM_IP:~/"
echo ""
echo "  2. Run setup on VM:"
echo "     scp deploy/setup-vm.sh $ADMIN_USER@$VM_IP:~/"
echo "     ssh $ADMIN_USER@$VM_IP 'bash setup-vm.sh'"
echo ""
echo "  3. Write .env files on VM:"
echo "     ssh $ADMIN_USER@$VM_IP 'cat > ~/app/apps/web/.env << EOF"
echo "CARMEN_API_KEY=<your-key>"
echo "BINARY_PATH=$BINARY_PATH"
echo "# Reverse-proxied endpoint (recommended when you terminate TLS)"
echo "NEXT_PUBLIC_WS_URL=wss://$VM_IP/ws"
echo "# Direct WS fallback when you expose port 3002 instead of proxying /ws"
echo "# NEXT_PUBLIC_WS_URL=ws://$VM_IP:3002"
echo "EOF'"
echo ""
echo "     ssh $ADMIN_USER@$VM_IP 'cat > ~/app/apps/ws-server/.env << EOF"
echo "VEHICLE_API_KEY=<your-vehicle-api-key>"
echo "WS_PORT=3002"
echo "# Optional override if you use a non-default Carmen Cloud Vehicle API host"
echo "# VEHICLE_API_BASE=https://ap-southeast-1.api.carmencloud.com/vehicle"
echo "EOF'"
echo ""
echo "  4. Start the app:"
echo "     ssh $ADMIN_USER@$VM_IP 'cd ~/app && pm2 start ecosystem.config.cjs && pm2 save'"
echo ""
echo "  App will be at:"
echo "    - https://$VM_IP/anpr       (when you reverse proxy 80/443 to Next.js)"
echo "    - http://$VM_IP:3001/anpr   (direct Next.js port)"
