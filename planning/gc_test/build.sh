node ../../dist/index.js file support.phs --stack-size 128 --nursery-size 4096 -t0 > test.wat
wat2wasm test.wat