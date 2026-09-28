#!/bin/bash
set -e

# Installation helper for Miningcore systemd services on Ubuntu/Debian
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Installing Miningcore systemd units from $SCRIPT_DIR..."

# Copy and adjust paths dynamically if pool is not in /opt/pool
sed "s|/opt/pool|$POOL_DIR|g" "$SCRIPT_DIR/miningcore.service" > /etc/systemd/system/miningcore.service
sed "s|/opt/pool|$POOL_DIR|g" "$SCRIPT_DIR/miningcore-webui.service" > /etc/systemd/system/miningcore-webui.service

systemctl daemon-reload

echo "Services installed successfully."
echo "To enable and start Miningcore:"
echo "  sudo systemctl enable --now miningcore"
echo "  sudo systemctl enable --now miningcore-webui"
echo "To check logs:"
echo "  sudo journalctl -u miningcore -f"
echo "  sudo journalctl -u miningcore-webui -f"
