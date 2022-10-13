export * from './expr.js';
export * from './branch.js';
export * from './recursion.js';
export * from './util.js';
export * from './enum.js';
export * from './fun.js';
export * from './closure.js';

/*
 * This directory contains datatypes related to a graph IR used to output webassembly
 *
 * All errors should be presented to the user before this point
 */

// TODO pass contextual expressions to children as array so that they can manage locals and such
// IDEA make a type for WAST code that makes debugging easier as we can determine where each part came from

// TODO this should be refactored
