const { ValueType } = require('../value');
const { stat } = require("fs");


const operators = {

    // Duplicate an item on the stack
    'dup' : {
        type: ValueType.Macro,
        preCheck:  state => state.stack.length >= 1,
        ppcAction: state => state.stack.push(state.stack[state.stack.length - 1]),
        compileAction: (state, tree) => {
            // Make local
            // Use local more than once
            // wasm doesn't have dup instruction
        },
    },

    'drop' : {
        type: ValueType.Macro,
        preCheck: state => state.stack.length >= 1,
        ppcAction: state => state.stack.pop(),
        compileAction: (state, tree) => {
            // Use wasm drop instruction for each item
        },
    },

}