#!/bin/bash
cd "$(dirname "$0")"
npm install && npx electron-builder
