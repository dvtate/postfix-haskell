node ../../dist/index.js file support.phs --stack-size 128 --nursery-size 512 -t0 > test.wat
wat2wasm test.wat
wasm-opt test.wasm -O3 -o test-opt.wasm
wasm2wat test-opt.wasm > test-opt.wat
