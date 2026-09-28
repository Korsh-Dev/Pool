# Korsh (KSH) Mining Pool - Miningcore v2 & WebUI

[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Ubuntu%20%7C%20Debian-blue.svg)](https://ubuntu.com/)
[![.NET](https://img.shields.io/badge/.NET-9.0%20LTS-purple.svg)](https://dotnet.microsoft.com/)
[![Algorithm](https://img.shields.io/badge/PoW%20Algorithm-Yespower%201.0-orange.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

High-performance, secure, and production-ready cryptocurrency mining pool for **Korsh (KSH)** based on **Miningcore v2** and a dedicated **WebUI Dashboard**. Optimized natively for Linux servers (Ubuntu 24.04 LTS, 22.04 LTS, Debian 12) and Docker.

---

## Table of Contents

1. [Features](#features)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Installation Guide (Ubuntu / Debian)](#step-by-step-installation-guide-ubuntu--debian)
   - [Step 1: Clone Repository](#step-1-clone-repository)
   - [Step 2: Compile Miningcore & Native Libraries](#step-2-compile-miningcore--native-libraries)
   - [Step 3: Setup PostgreSQL Database](#step-3-setup-postgresql-database)
   - [Step 4: Configure the Pool](#step-4-configure-the-pool)
   - [Step 5: Setup Systemd Services (Automatic Daemons)](#step-5-setup-systemd-services-automatic-daemons)
   - [Step 6: Setup Nginx Reverse Proxy (Optional / Recommended)](#step-6-setup-nginx-reverse-proxy-optional--recommended)
5. [Connecting Miners](#connecting-miners)
6. [Useful Operations & Monitoring Commands](#useful-operations--monitoring-commands)
7. [Directory Structure](#directory-structure)

---

## Features

- **Native Yespower 1.0 Algorithm**: Hand-tuned C cryptographic hashing for Korsh PoW (`N=256, r=8`).
- **PPLNS Payout Scheme**: Configurable factor (standard `2.0`) minimizing payout variance for miners.
- **Anti-DDoS & Flood Protection**: Integrated share validation banning (`banOnJunkReceive`, `banOnInvalidShares`).
- **Low-Latency Stratum Engine**: Multi-threaded asynchronous I/O with variable difficulty (`VarDiff`).
- **Modern WebUI Dashboard**: Live statistics, workers table, hashrate charts, block history, and mobile responsiveness.
- **Secure WebUI API Proxy**: Built-in path traversal protection, CORS headers, and querystring handling.
- **Production Systemd Management**: Auto-start on boot and automatic crash recovery for 24/7 reliability.

---

## Architecture Overview

```text
[ Miner (cpuminer / SRBMiner) ]
             │
             ▼ Stratum TCP:3333
[ Miningcore Pool Engine (.NET 9 + libmultihash.so) ] ◄── RPC ──► [ Korsh Daemon (korshd) ]
             │
             ├───────────────► [ PostgreSQL Database ]
             │
             ▼ REST API:4000
[ WebUI Server (Node.js Proxy:8080) ] ◄── Reverse Proxy (443) ──► [ Nginx SSL / Cloudflare ]
             │
             ▼
[ Browser User / Miner Dashboard ]
```

---

## Prerequisites

- **Operating System**: Linux Server (Ubuntu 24.04 LTS, 22.04 LTS, or Debian 12 recommended).
- **CPU / RAM**: Minimum 2 vCPU cores, 2 GB RAM (4 GB recommended).
- **Storage**: 20+ GB SSD (depends on blockchain size).
- **Network Ports Open**:
  - `3333`: Stratum Mining (TCP)
  - `80` / `443`: WebUI & Dashboard (HTTP/HTTPS)
  - `4000`: Miningcore API (Localhost only, proxied via WebUI or Nginx)
  - `5432`: PostgreSQL (Localhost only)
  - `9776`: Korsh Daemon RPC (Localhost only)

---

## Step-by-Step Installation Guide (Ubuntu / Debian)

### Step 1: Clone Repository

Create the pool directory and clone the project:

```bash
sudo mkdir -p /opt/pool && sudo chown -R $USER:$USER /opt/pool
git clone https://github.com/Korsh-Dev/Pool.git /opt/pool
cd /opt/pool
```

---

### Step 2: Compile Miningcore & Native Libraries

Run the appropriate automated build script for your operating system. This script automatically installs the .NET 9 SDK, C/C++ compilers, Node.js, and native dependencies, and compiles Miningcore in **Release mode**:

- **Ubuntu 24.04 LTS**:
  ```bash
  chmod +x miningcore/build-ubuntu-24.04.sh
  ./miningcore/build-ubuntu-24.04.sh
  ```

- **Ubuntu 22.04 LTS**:
  ```bash
  chmod +x miningcore/build-ubuntu-22.04.sh
  ./miningcore/build-ubuntu-22.04.sh
  ```

- **Debian 12**:
  ```bash
  chmod +x miningcore/build-debian-12.sh
  ./miningcore/build-debian-12.sh
  ```

The compiled binaries and native libraries (`libmultihash.so`, `Miningcore`, `coins.json`) will be placed into `/opt/pool/miningcore/build/`.

---

### Step 3: Setup PostgreSQL Database

Install PostgreSQL and create the user and database:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Create user and database
sudo -u postgres createuser miningcore
sudo -u postgres createdb -O miningcore miningcore

# Set password for database user
sudo -u postgres psql -c "ALTER USER miningcore WITH ENCRYPTED PASSWORD 'YOUR_STRONG_POSTGRES_PASSWORD';"

# Import the database schema
sudo -u postgres psql -d miningcore -f /opt/pool/miningcore/src/Miningcore/Persistence/Postgres/Scripts/createdb.sql
```

---

### Step 4: Configure the Pool

Copy the production example configuration into the build directory:

```bash
cp /opt/pool/korsh_pool.example.json /opt/pool/miningcore/build/config.json
nano /opt/pool/miningcore/build/config.json
```

**Key settings to configure:**

1. **Database Password**:
   ```json
   "persistence": {
     "postgres": {
       "host": "127.0.0.1",
       "port": 5432,
       "user": "miningcore",
       "password": "YOUR_STRONG_POSTGRES_PASSWORD",
       "database": "miningcore"
     }
   }
   ```

2. **Korsh Node RPC Credentials**:
   ```json
   "daemons": [
     {
       "host": "127.0.0.1",
       "port": 9776,
       "user": "korshrpc",
       "password": "YOUR_KORSH_RPC_PASSWORD"
     }
   ]
   ```

3. **Pool Mining Wallet & Operator Fee Wallet**:
   *(Refer to `pool-address.txt`)*
   ```json
   "address": "SRM6BKtKbxUe1GYWZW3GdGkvAqicu7YRyu",
   "rewardRecipients": [
     {
       "type": "op",
       "address": "SMnZRoh3cfKdVV4PCRWNJYHG9zXiBah2Ai",
       "percentage": 1.0
     }
   ]
   ```

---

### Step 5: Setup Systemd Services (Automatic Daemons)

To ensure the pool and WebUI automatically start on boot and recover if any process fails, install the provided systemd services:

```bash
sudo chmod +x /opt/pool/systemd/install-services.sh
sudo /opt/pool/systemd/install-services.sh

# Enable and start services
sudo systemctl enable --now miningcore
sudo systemctl enable --now miningcore-webui
```

Check the status of both daemons:

```bash
sudo systemctl status miningcore
sudo systemctl status miningcore-webui
```

---

### Step 6: Setup Nginx Reverse Proxy (Optional / Recommended)

For production SSL (HTTPS) and clean domain routing, copy the provided Nginx template:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp /opt/pool/miningcore/nginx.conf /etc/nginx/sites-available/korsh-pool.conf
sudo ln -s /etc/nginx/sites-available/korsh-pool.conf /etc/nginx/sites-enabled/

# Edit domain names
sudo nano /etc/nginx/sites-available/korsh-pool.conf

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## Connecting Miners

Miners connect to your pool using the Stratum protocol:

- **Stratum URL**: `stratum+tcp://YOUR_SERVER_IP_OR_DOMAIN:3333`
- **Username**: `YOUR_KORSH_WALLET_ADDRESS.WORKER_NAME`
- **Password**: `x` (or `d=4` to specify a starting difficulty)

### Mining Software Examples

#### 1. cpuminer-opt (Linux / Windows)

```bash
cpuminer -a yespower -o stratum+tcp://YOUR_SERVER_IP:3333 -u SRM6BKtKbxUe1GYWZW3GdGkvAqicu7YRyu.worker1 -p x
```

#### 2. SRBMiner-MULTI (Linux / Windows)

```bash
./SRBMiner-MULTI --algorithm yespower --pool YOUR_SERVER_IP:3333 --wallet SRM6BKtKbxUe1GYWZW3GdGkvAqicu7YRyu.worker1 --password x
```

---

## Useful Operations & Monitoring Commands

### Live Log Streaming

```bash
# Miningcore daemon logs
sudo journalctl -u miningcore -f

# WebUI & API proxy logs
sudo journalctl -u miningcore-webui -f

# Real-time pool log file
tail -f /opt/pool/miningcore/build/pool.log
```

### Service Controls

```bash
# Restart pool daemon
sudo systemctl restart miningcore

# Restart web dashboard
sudo systemctl restart miningcore-webui

# Stop all pool services
sudo systemctl stop miningcore miningcore-webui
```

### Recompiling After Code Changes

```bash
cd /opt/pool/miningcore
./re-compile.sh
sudo systemctl restart miningcore
```

---

## Directory Structure

```text
├── .gitattributes                # Enforces Unix LF line endings for all Linux scripts
├── .gitignore                    # Ignores build artifacts and local configs
├── README.md                     # This comprehensive documentation
├── korsh_pool.example.json       # Production pool configuration template
├── pool-address.txt              # Pool and operator wallet address reference
├── systemd/                      # Linux systemd service units and installer
│   ├── install-services.sh       # Automated installation helper
│   ├── miningcore.service        # Miningcore engine background daemon
│   └── miningcore-webui.service  # WebUI and reverse proxy daemon
├── miningcore/                   # Miningcore v2 engine (.NET 9 & C/C++)
│   ├── Dockerfile                # Production container deployment
│   ├── build-ubuntu-24.04.sh     # Build script for Ubuntu 24.04 LTS
│   ├── build-ubuntu-22.04.sh     # Build script for Ubuntu 22.04 LTS
│   ├── build-debian-12.sh        # Build script for Debian 12
│   ├── nginx.conf                # Production Nginx reverse proxy configuration
│   └── src/                      # Source code for Miningcore and Native libraries
│       ├── Miningcore/           # C# backend (.NET 9)
│       └── Native/libmultihash/  # YesPower C hashing algorithm
└── webui/                        # Responsive frontend dashboard
    ├── server.js                 # Production Node.js server & API reverse proxy
    ├── index.html                # Main single-page application
    ├── css/                      # Stylesheets, skins, and notifications
    ├── js/                       # Dynamic dashboard and stats logic
    └── poolconfig/               # Miner configuration templates
```

---

## License

This project is licensed under the [MIT License](LICENSE).
