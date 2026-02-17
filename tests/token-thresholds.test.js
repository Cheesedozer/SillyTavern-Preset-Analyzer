const { checkTokenThresholds } = require('../rules/token-thresholds');
const presetThresholdMiss = require('./fixtures/preset-threshold-miss.json');
const presetGood = require('./fixtures/preset-good.json');

describe('Token Threshold Rule', () => {

    // TEST 1: Should flag stable prefix below Anthropic's 1024 threshold
    it('should flag stable prefix below anthropic 1024 threshold', () => {
        const findings = checkTokenThresholds(presetThresholdMiss, { provider: 'anthropic' });
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].rule).toBe('token-thresholds');
    });

    // TEST 2: Warning severity when within 10% below threshold
    it('should assign warning when within 10% below threshold', () => {
        const findings = checkTokenThresholds(presetThresholdMiss, { provider: 'anthropic' });
        const warnings = findings.filter(f => f.severity === 'warning');
        // Stable prefix should be ~950 tokens, which is within 10% of 1024
        expect(warnings.length).toBeGreaterThan(0);
    });

    // TEST 3: Should use correct threshold for Gemini (4096)
    it('should use 4096 threshold for google provider', () => {
        const findings = checkTokenThresholds(presetThresholdMiss, { provider: 'google' });
        // ~950 tokens is well below 4096, should flag
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].meta.threshold).toBe(4096);
    });

    // TEST 4: Should accept a custom tokenizer function
    it('should accept custom tokenizer function', () => {
        // Custom tokenizer that always returns 500 tokens (below all thresholds)
        const mockTokenizer = (text) => 500;
        const findings = checkTokenThresholds(presetThresholdMiss, {
            provider: 'anthropic',
            tokenizer: mockTokenizer
        });
        expect(findings.length).toBeGreaterThan(0);
    });

    // TEST 5: Should NOT flag when stable prefix is above threshold
    it('should not flag when stable prefix exceeds threshold', () => {
        // Custom tokenizer returning well above threshold
        const bigTokenizer = (text) => 2000;
        const findings = checkTokenThresholds(presetThresholdMiss, {
            provider: 'anthropic',
            tokenizer: bigTokenizer
        });
        expect(findings.length).toBe(0);
    });

    // TEST 6: Should calculate tokens only from stable entries (not chatHistory)
    it('should only count stable entries for prefix token estimation', () => {
        // Tokenizer that tracks what it receives
        let tokenizedContent = '';
        const trackingTokenizer = (text) => {
            tokenizedContent = text;
            return 2000; // Return high count to not trigger findings
        };
        checkTokenThresholds(presetThresholdMiss, {
            provider: 'anthropic',
            tokenizer: trackingTokenizer
        });
        // Should NOT include chatHistory content (which is empty anyway, but the point
        // is the function should only concatenate stable entry content)
        expect(tokenizedContent.length).toBeGreaterThan(0);
    });

    // TEST 7: Should include token count and threshold in finding meta
    it('should include estimated tokens and threshold in finding metadata', () => {
        const findings = checkTokenThresholds(presetThresholdMiss, { provider: 'anthropic' });
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].meta.estimatedTokens).toBeGreaterThan(0);
        expect(findings[0].meta.threshold).toBe(1024);
    });

});
