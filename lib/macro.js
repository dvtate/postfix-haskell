const { stat } = require("fs");

//
module.exports = class Macro {
    /**
     *
     * @param {function} action
     * @param {Object} [body]
     */
    constructor(action, body = null) {
        this.action = action;
        this.body = body;
    }
};