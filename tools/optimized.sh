#!/bin/sh

# TODO eventually should probably use streaming pipes

# PHS: Compile to wat
phc file -O2 $1 -o /tmp/ph_opt_demo.wat

# WABT: Convert wat to wasm
wat2wasm /tmp/ph_opt_demo.wat -o /tmp/ph_opt_demo.wasm
rm /tmp/ph_opt_demo.wat

# Binaryen: Optimize WASM
ARGS_FWD=$([ -z ${@:2} ] && echo "-O" || echo "${@:2}")
wasm-opt /tmp/ph_opt_demo.wasm -o /tmp/ph_opt_demo.wasm $ARGS_FWD

# WABT: Convert wasm to wat
wasm2wat /tmp/ph_opt_demo.wasm
rm /tmp/ph_opt_demo.wasm