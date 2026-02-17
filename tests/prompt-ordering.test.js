const { checkPromptOrdering } = require('../rules/prompt-ordering');
const presetBadOrdering = require('./fixtures/preset-bad-ordering.json');
const presetGood = require('./fixtures/preset-good.json');

describe('Prompt Ordering Rule', () => {

    // TEST 1: Flag chatHistory appearing before stable entries
    it('should flag volatile entry interleaved before stable entries', () => {
        const findings = checkPromptOrdering(presetBadOrdering);
        expect(findings.length).toBeGreaterThan(0);
        const interleaveFindings = findings.filter(f => f.rule === 'prompt-ordering');
        expect(interleaveFindings.length).toBeGreaterThan(0);
    });

    // TEST 2: Finding should be warning severity
    it('should assign warning severity to interleaved volatile entries', () => {
        const findings = checkPromptOrdering(presetBadOrdering);
        const interleaveFindings = findings.filter(f =>
            f.rule === 'prompt-ordering' && f.severity === 'warning'
        );
        expect(interleaveFindings.length).toBeGreaterThan(0);
    });

    // TEST 3: Should identify chatHistory as the problematic entry
    it('should identify the volatile entry causing interleaving', () => {
        const findings = checkPromptOrdering(presetBadOrdering);
        const chatHistoryFinding = findings.find(f => f.affectedEntry === 'chatHistory');
        expect(chatHistoryFinding).toBeTruthy();
    });

    // TEST 4: Should mention stable entries that come after in description
    it('should mention stable entries that follow the volatile entry', () => {
        const findings = checkPromptOrdering(presetBadOrdering);
        const chatHistoryFinding = findings.find(f => f.affectedEntry === 'chatHistory');
        // The description or meta should reference that stable content follows
        expect(chatHistoryFinding.description.length).toBeGreaterThan(0);
    });

    // TEST 5: Clean preset should have no findings
    it('should produce no findings for well-ordered preset', () => {
        const findings = checkPromptOrdering(presetGood);
        expect(findings.length).toBe(0);
    });

    // TEST 6: Preset with only stable entries should have no findings
    it('should handle preset with only stable entries', () => {
        const onlyStable = {
            prompts: [
                { identifier: 'main', name: 'Main', content: 'System prompt.', enabled: true, role: 'system' },
                { identifier: 'charDescription', name: 'Char', content: 'Description.', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'charDescription', enabled: true }
            ]}]
        };
        const findings = checkPromptOrdering(onlyStable);
        expect(findings.length).toBe(0);
    });

    // TEST 7: Volatile entries at END (after all stable) should NOT trigger
    it('should not flag volatile entries that are correctly placed at the end', () => {
        const correctOrder = {
            prompts: [
                { identifier: 'main', name: 'Main', content: 'System prompt.', enabled: true, role: 'system' },
                { identifier: 'charDescription', name: 'Char', content: 'Desc.', enabled: true, role: 'system' },
                { identifier: 'chatHistory', name: 'Chat', content: '', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'charDescription', enabled: true },
                { identifier: 'chatHistory', enabled: true }
            ]}]
        };
        const findings = checkPromptOrdering(correctOrder);
        expect(findings.length).toBe(0);
    });

});
