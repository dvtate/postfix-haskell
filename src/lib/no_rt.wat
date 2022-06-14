(module
    ;; User defined host imports
    {{USER_IMPORTS}}

    ;; User defined function table
    {{USER_TABLE}}

    ;; Memory export
    (memory (export "__memory") {{PAGES_NEEDED}})

    ;; Initialize static data
    (data (i32.const {{STATIC_DATA_START}}) "{{STATIC_DATA_STR}}")

    ;; User defined functions
    {{USER_CODE_STR}}
)