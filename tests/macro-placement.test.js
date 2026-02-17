const { checkMacroPlacement } = require('../rules/macro-placement');
const presetBadMacros = require('./fixtures/preset-bad-macros.json');
const presetGood = require('./fixtures/preset-good.json');

describe('Macro Placement Rule', () => {

    // TEST 1: Should flag {{random}} and {{date}} in the first entry as critical
    it('should flag dynamic macros in first prompt entry as critical', () => {
        const findings = checkMacroPlacement(presetBadMacros);
        const criticals = findings.filter(f => f.severity === 'critical');
        // "main" is position 0, has {{random::...}} and {{date}} — both should be critical
        expect(criticals.length).toBeGreaterThan(0);
        expect(criticals.every(f => f.affectedEntry === 'main')).toBe(true);
        expect(criticals.every(f => f.rule === 'macro-placement')).toBe(true);
    });

    // TEST 2: Should flag {{time}} in "scenario" (position 2 of 6 enabled = 33%, within first 40%) as warning
    it('should flag dynamic macros in first 40% of entries as warning', () => {
        const findings = checkMacroPlacement(presetBadMacros);
        const scenarioFindings = findings.filter(f => f.affectedEntry === 'scenario');
        expect(scenarioFindings.length).toBeGreaterThan(0);
        expect(scenarioFindings[0].severity).toBe('warning');
    });

    // TEST 3: Should flag {{roll}} in "jailbreak" (position 5 of 6 = 83%) as info
    it('should flag dynamic macros in latter 60% of entries as info', () => {
        const findings = checkMacroPlacement(presetBadMacros);
        const jbFindings = findings.filter(f => f.affectedEntry === 'jailbreak');
        expect(jbFindings.length).toBeGreaterThan(0);
        expect(jbFindings[0].severity).toBe('info');
    });

    // TEST 4: Should produce separate findings for each macro found
    it('should produce separate findings for each distinct macro', () => {
        const findings = checkMacroPlacement(presetBadMacros);
        // main has {{random::...}} and {{date}} = 2
        // scenario has {{time}} = 1
        // jailbreak has {{roll::1d20}} = 1
        // Total: 4 findings from enabled entries
        expect(findings.length).toBe(4);
    });

    // TEST 5: Should ignore disabled entries entirely
    it('should ignore disabled prompt entries', () => {
        const findings = checkMacroPlacement(presetBadMacros);
        const disabledFindings = findings.filter(f => f.affectedEntry === 'disabled-macro');
        expect(disabledFindings.length).toBe(0);
    });

    // TEST 6: Clean preset should produce zero findings
    it('should produce no findings for clean preset', () => {
        const findings = checkMacroPlacement(presetGood);
        expect(findings.length).toBe(0);
    });

    // TEST 7: Should NOT flag {{// comments}} as they are stripped before API call
    it('should not flag comment macros as dynamic', () => {
        const findings = checkMacroPlacement(presetGood);
        // presetGood has {{// comment}} in nsfw entry — should NOT be flagged
        const commentFindings = findings.filter(f =>
            f.meta && f.meta.macroFound && f.meta.macroFound.includes('//')
        );
        expect(commentFindings.length).toBe(0);
    });

    // TEST 8: Should NOT flag {{char}}, {{user}}, {{setvar}}, {{getvar}} (deterministic macros)
    it('should not flag deterministic macros like char, user, setvar, getvar', () => {
        const findings = checkMacroPlacement(presetGood);
        // presetGood has {{char}} in char-desc — should NOT be flagged
        expect(findings.length).toBe(0);
    });

});
