#!/bin/bash
set -e

# Ubuntu 24.04 LTS (Noble Numbat) has .NET 9 support in official/backport channels
sudo apt-get update
sudo apt-get -y install software-properties-common wget

sudo add-apt-repository -y ppa:dotnet/backports || true
sudo apt-get update

# Install dev-dependencies and build tools
sudo apt-get -y install dotnet-sdk-9.0 git cmake clang ninja-build build-essential libssl-dev pkg-config libboost-all-dev libsodium-dev libzmq5-dev libgmp-dev libc++-dev zlib1g-dev nodejs

# Build in Release mode for production performance
(cd src && \
BUILDIR=${1:-../build} && \
echo "Building Release into $BUILDIR" && \
dotnet build -c Release -o $BUILDIR)
