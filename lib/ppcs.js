const { ValueType } = require('./value');
const { stat } = require("fs");
const { getId } = require('./ids');

//
const operators = {
    // Duplicate an item on the stack
    'dup' : {
        preCheck: state => [
            state.stack.length >= 1 || 'Nothing to dup',
        ],
        ppcAction: state => {
            state.stack.push(state.stack[state.stack.length - 1])
        },
        compileAction: (state, tree) => {
            // Make local
            // Use local more than once
            // wasm doesn't have dup instruction

            // O shit this depends on size of operand...
        },
    },

    // Drop item from stack
    'drop' : {
        preCheck: state => [
            state.stack.length >= 1 || 'Nothing to drop',
        ],
        ppcAction: state => state.stack.pop(),
        compileAction: (state, tree) => {
            // This should never
            // Use wasm drop instruction for each item

            //
        },
    },

    // Bind identifier to expression
    '=' : {
        preCheck: state => [
            state.stack.length >= 2 || 'Not enough items',
        ],
        ppcAction: state => {
            // Typerror, pretend successfull
            const sym = state.stack.pop();
            if (sym.type !== ValueType.Id) {

            }
            if (state.stack[state.stack.length - 1].type === ValueType.Id) {
                state.stack.pop();
                state.stack.pop();
                return ["missing symbol to bind"];
            }

            // Verify no reassign
            if (getId(sym.value.id, state)) {

            }
        }
    },


}

module.exports = Object.entries(operators).reduce((acc, [k, v]) =>
    ({ ...acc,  [k] : { type: ValueType.Macro, value: v }}), {});
