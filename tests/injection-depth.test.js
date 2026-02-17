const { checkInjectionDepth } = require('../rules/injection-depth');
const presetDeepInjection = require('./fixtures/preset-deep-injection.json');
const presetGood = require('./fixtures/preset-good.json');

describe('Injection Depth Rule', () => {

    // TEST 1: Static content at depth 0 → warning
    it('should flag static content injected at depth 0 as warning', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        const authorsNote = findings.find(f => f.affectedEntry === 'authors-note');
        expect(authorsNote).toBeTruthy();
        expect(authorsNote.severity).toBe('warning');
    });

    // TEST 2: Dynamic content at depth 0-1 → critical
    it('should flag dynamic content at shallow depth as critical', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        const dynamicInject = findings.find(f => f.affectedEntry === 'dynamic-inject');
        expect(dynamicInject).toBeTruthy();
        expect(dynamicInject.severity).toBe('critical');
    });

    // TEST 3: Deep injection (depth 5+) should not be flagged
    it('should not flag injections at deep depths', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        const deepFindings = findings.filter(f => f.affectedEntry === 'deep-inject');
        expect(deepFindings.length).toBe(0);
    });

    // TEST 4: Disabled entries should be ignored
    it('should ignore disabled injection entries', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        const disabledFindings = findings.filter(f => f.affectedEntry === 'disabled-inject');
        expect(disabledFindings.length).toBe(0);
    });

    // TEST 5: Entries without injection_position should be skipped
    it('should skip entries without injection settings', () => {
        const findings = checkInjectionDepth(presetGood);
        // presetGood has injection_position but not injection_position=1 (in-chat injection)
        // Only injection_position=1 entries are "injected into chat" — position 0 is normal ordering
        expect(findings.length).toBe(0);
    });

    // TEST 6: Should include depth info in finding metadata
    it('should include injection depth in finding metadata', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        const authorsNote = findings.find(f => f.affectedEntry === 'authors-note');
        expect(authorsNote.meta.depth).toBe(0);
        expect(authorsNote.meta.injectionPosition).toBe(1);
    });

    // TEST 7: Mixed depths should flag only shallow ones
    it('should only flag shallow injection depths not deep ones', () => {
        const findings = checkInjectionDepth(presetDeepInjection);
        // Should flag authors-note (depth 0) and dynamic-inject (depth 1), but NOT deep-inject (depth 5)
        expect(findings.length).toBe(2);
    });

});
