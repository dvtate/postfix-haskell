#!/bin/sh

# PHS: Compile to wat
node file.js $1 > /tmp/ph_opt_demo.wat

# WABT: Convert wat to wasm
wat2wasm /tmp/ph_opt_demo.wat -o /tmp/ph_opt_demo.wasm
rm /tmp/ph_opt_demo.wat

# Binaryen: Optimize WASM
wasm-opt /tmp/ph_opt_demo.wasm -O -o /tmp/ph_opt_demo.wasm

# WABT: Convert wasm to wat
wasm2wat /tmp/ph_opt_demo.wasm
rm /tmp/ph_opt_demo.wasm