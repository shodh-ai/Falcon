import { isQaDeclarationNote } from './official-result-provenance';

describe('Explicit fixture declaration markers', () => {
  it.each([
    'SMOKE: End-term results declared for QA walkthrough.',
    'Smoke — local test',
    'QA: sample declaration',
    'End-term results declared for QA walkthrough',
    'Demo results only',
    'Synthetic data for local use',
    'Seeded for QA',
    'For testing only',
    'This is not an official result',
  ])('identifies explicit fixture evidence: %s', note => {
    expect(isQaDeclarationNote(note)).toBe(true);
  });

  it.each([
    null, undefined, 42, '',
    'Official October examination',
    'QA audit completed before official declaration',
    'Weekly test results officially declared',
    'Latest examination results approved by the board',
  ])('does not infer a fixture from an absent or ordinary declaration note: %p', note => {
    expect(isQaDeclarationNote(note)).toBe(false);
  });
});
