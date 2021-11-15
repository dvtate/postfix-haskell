echo "compiling..."
phc file index.phs -t0 > index.wat
echo "assembling..."
wat2wasm index.wat
echo "optimizing..."
wasm-opt index.wasm -O -o index.wasm
echo "generating optimized wat..."
wasm2wat index.wasm > optimized.wat