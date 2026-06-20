import {
  computeGradeFromPercent,
  computePassFail,
  parseGradeBands,
} from './grading-engine';

describe('grading-engine', () => {
  it('assigns grade from percent using default bands', () => {
    const bands = parseGradeBands(null);
    expect(computeGradeFromPercent(92, bands).grade).toBe('A+');
    expect(computeGradeFromPercent(55, bands).grade).toBe('C');
    expect(computeGradeFromPercent(30, bands).grade).toBe('F');
  });

  it('computes pass/fail from pass marks threshold', () => {
    expect(computePassFail(35, 100, 40)).toBe('FAIL');
    expect(computePassFail(42, 100, 40)).toBe('PASS');
  });
});
