#!/bin/bash

(cd src && \
BUILDIR=${1:-../build} && \
echo "Building Release into $BUILDIR" && \
dotnet build -c Release -o $BUILDIR)
