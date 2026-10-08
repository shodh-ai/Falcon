import { resolveDofaLevel, DEFAULT_DOFA_LEVELS } from './dofa-levels.util';

describe('dofa-levels.util', () => {
  it('routes 40k to L1', () => {
    expect(resolveDofaLevel(40000).level_no).toBe(1);
  });
  it('routes 50k to L1', () => {
    expect(resolveDofaLevel(50000).level_no).toBe(1);
  });
  it('routes 1.5L to L2', () => {
    expect(resolveDofaLevel(150000).level_no).toBe(2);
  });
  it('routes 4L oscilloscope to L3', () => {
    expect(resolveDofaLevel(400000).level_no).toBe(3);
    expect(resolveDofaLevel(400000).required_signatures).toBe(2);
  });
  it('routes 10L to L4', () => {
    expect(resolveDofaLevel(1000000).level_no).toBe(4);
  });
  it('routes 20L to L5', () => {
    expect(resolveDofaLevel(2000000).level_no).toBe(5);
  });
  it('has five default levels', () => {
    expect(DEFAULT_DOFA_LEVELS).toHaveLength(5);
  });
});
