// Import framework
const { describe, it, expect, runTests } = require('./test-runner');
// Make available globally for test files
global.describe = describe;
global.it = it;
global.expect = expect;

// Import all test files (each registers tests via describe/it)
require('./macro-placement.test');
// Future sessions will add:
// require('./prompt-ordering.test');
// require('./token-thresholds.test');
// require('./injection-depth.test');
// require('./provider-specific.test');
// require('./analyzer.test');

// Run
runTests();
