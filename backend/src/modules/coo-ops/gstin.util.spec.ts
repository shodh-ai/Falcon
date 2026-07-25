import {
  isValidGstinFormat,
  normalizeGstin,
  panFromGstin,
  relatedPartyHash,
} from './gstin.util';

describe('gstin.util', () => {
  it('validates and normalizes GSTIN', () => {
    expect(isValidGstinFormat('08aabcu9603r1zm')).toBe(true);
    expect(normalizeGstin(' 08aabcu9603r1zm ')).toBe('08AABCU9603R1ZM');
    expect(panFromGstin('08AABCU9603R1ZM')).toBe('AABCU9603R');
  });

  it('rejects bad format', () => {
    expect(isValidGstinFormat('INVALID')).toBe(false);
    expect(isValidGstinFormat('08AABCU9603R1Z')).toBe(false);
  });

  it('related party hash matches same PAN', () => {
    expect(relatedPartyHash('AABCU9603R', 'Foo Pvt Ltd')).toBe(
      relatedPartyHash('aabcu9603r', 'FOO PVT LTD!!!'),
    );
  });
});
