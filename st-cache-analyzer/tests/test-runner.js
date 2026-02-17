const tests = [];

function describe(name, fn) {
    console.log(`\n=== ${name} ===`);
    fn();
}

function it(name, fn) {
    tests.push({ name, fn });
}

function expect(val) {
    return {
        toBe: (expected) => {
            if (val !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
        },
        toEqual: (expected) => {
            if (JSON.stringify(val) !== JSON.stringify(expected))
                throw new Error(`Deep equality failed:\n  got:      ${JSON.stringify(val)}\n  expected: ${JSON.stringify(expected)}`);
        },
        toHaveLength: (len) => {
            if (!Array.isArray(val) && typeof val !== 'string') throw new Error(`Expected array or string, got ${typeof val}`);
            if (val.length !== len) throw new Error(`Expected length ${len}, got ${val.length}`);
        },
        toContain: (item) => {
            if (!val.includes(item)) throw new Error(`Expected to contain ${JSON.stringify(item)}`);
        },
        toBeGreaterThan: (n) => {
            if (val <= n) throw new Error(`Expected ${val} > ${n}`);
        },
        toBeLessThan: (n) => {
            if (val >= n) throw new Error(`Expected ${val} < ${n}`);
        },
        toBeTruthy: () => {
            if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`);
        },
        toBeFalsy: () => {
            if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)}`);
        },
    };
}

async function runTests() {
    let passed = 0, failed = 0, errors = [];
    for (const test of tests) {
        try {
            await test.fn();
            console.log(`  ✅ ${test.name}`);
            passed++;
        } catch (e) {
            console.error(`  ❌ ${test.name}: ${e.message}`);
            errors.push({ name: test.name, error: e.message });
            failed++;
        }
    }
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    if (errors.length > 0) {
        console.log('\nFailed tests:');
        errors.forEach(e => console.log(`  - ${e.name}`));
    }
    if (typeof process !== 'undefined' && failed > 0) process.exit(1);
    return { passed, failed };
}

if (typeof module !== 'undefined') {
    module.exports = { describe, it, expect, runTests, tests };
}
