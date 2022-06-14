echo "compiling..."
../../dist/index.js file index.phs -o index.wat --no-rt=true --fast
echo "assembling..."
wat2wasm index.wat
echo "optimizing..."
wasm-opt index.wasm -O -o index.wasm
echo "generating optimized wat..."
wasm2wat index.wasm > optimized.wat