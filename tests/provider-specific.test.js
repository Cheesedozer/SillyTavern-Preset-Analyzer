const { checkProviderSpecific } = require('../rules/provider-specific');

describe('Provider-Specific Rules', () => {

    // --- Anthropic Tests ---

    // TEST 1: Fragmented system messages without squash → warning
    it('should flag fragmented system messages for anthropic when squash is off', () => {
        const preset = {
            squash_system_messages: false,
            prompts: [
                { identifier: 'main', name: 'Main', content: 'System 1.', enabled: true, role: 'system' },
                { identifier: 'extra', name: 'Extra', content: 'System 2.', enabled: true, role: 'system' },
                { identifier: 'third', name: 'Third', content: 'System 3.', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'extra', enabled: true },
                { identifier: 'third', enabled: true }
            ]}]
        };
        const findings = checkProviderSpecific(preset, { provider: 'anthropic' });
        const fragFindings = findings.filter(f => f.rule === 'provider-specific');
        expect(fragFindings.length).toBeGreaterThan(0);
        expect(fragFindings[0].severity).toBe('warning');
    });

    // TEST 2: Squash enabled → positive info finding
    it('should note squash_system_messages as positive for anthropic', () => {
        const preset = {
            squash_system_messages: true,
            prompts: [
                { identifier: 'main', name: 'Main', content: 'System 1.', enabled: true, role: 'system' },
                { identifier: 'extra', name: 'Extra', content: 'System 2.', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'extra', enabled: true }
            ]}]
        };
        const findings = checkProviderSpecific(preset, { provider: 'anthropic' });
        const positiveFindings = findings.filter(f => f.severity === 'info');
        expect(positiveFindings.length).toBeGreaterThan(0);
    });

    // --- OpenAI Tests ---

    // TEST 3: Stable prefix not 128-aligned → info
    it('should flag non-128-aligned prefix for openai as info', () => {
        const preset = {
            prompts: [
                { identifier: 'main', name: 'Main', content: 'Short prompt text here.', enabled: true, role: 'system' },
                { identifier: 'chatHistory', name: 'Chat', content: '', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'chatHistory', enabled: true }
            ]}]
        };
        const findings = checkProviderSpecific(preset, { provider: 'openai' });
        // Very small prefix won't be 128-aligned
        const alignFindings = findings.filter(f => f.rule === 'provider-specific');
        expect(alignFindings.length).toBeGreaterThan(0);
    });

    // --- Google Tests ---

    // TEST 4: Under 4096 tokens → warning
    it('should flag small prefix for google as warning', () => {
        const preset = {
            prompts: [
                { identifier: 'main', name: 'Main', content: 'Short.', enabled: true, role: 'system' },
                { identifier: 'chatHistory', name: 'Chat', content: '', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'chatHistory', enabled: true }
            ]}]
        };
        const findings = checkProviderSpecific(preset, { provider: 'google' });
        const tokenFindings = findings.filter(f => f.severity === 'warning');
        expect(tokenFindings.length).toBeGreaterThan(0);
    });

    // --- Cross-Provider Tests ---

    // TEST 5: Should not apply anthropic rules when provider is openai
    it('should not apply anthropic rules when provider is openai', () => {
        const preset = {
            squash_system_messages: false,
            prompts: [
                { identifier: 'main', name: 'Main', content: 'Sys 1.', enabled: true, role: 'system' },
                { identifier: 'extra', name: 'Extra', content: 'Sys 2.', enabled: true, role: 'system' }
            ],
            prompt_order: [{ character_id: 100001, order: [
                { identifier: 'main', enabled: true },
                { identifier: 'extra', enabled: true }
            ]}]
        };
        const findings = checkProviderSpecific(preset, { provider: 'openai' });
        const squashFindings = findings.filter(f =>
            f.description && f.description.toLowerCase().includes('squash')
        );
        expect(squashFindings.length).toBe(0);
    });

    // TEST 6: Unknown provider should return empty findings
    it('should return empty findings for unknown provider', () => {
        const preset = {
            prompts: [{ identifier: 'main', name: 'Main', content: 'Test.', enabled: true, role: 'system' }],
            prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }]
        };
        const findings = checkProviderSpecific(preset, { provider: 'unknown' });
        expect(findings.length).toBe(0);
    });

    // TEST 7: No provider option should default to returning empty or all-provider findings
    it('should handle missing provider option gracefully', () => {
        const preset = {
            prompts: [{ identifier: 'main', name: 'Main', content: 'Test.', enabled: true, role: 'system' }],
            prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }]
        };
        // Should not throw
        const findings = checkProviderSpecific(preset, {});
        expect(Array.isArray(findings)).toBe(true);
    });

});
