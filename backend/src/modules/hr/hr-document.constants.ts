export const HR_DOCUMENT_CATEGORIES = [
  'AADHAAR',
  'PAN',
  'DEGREE',
  'TENTH_MARKSHEET',
  'TWELFTH_MARKSHEET',
  'VOID_CHEQUE',
  'OFFER_LETTER',
  'RELIEVING_LETTER',
  'ID_PHOTO',
  'OTHER',
] as const;

export type HrDocumentCategory = (typeof HR_DOCUMENT_CATEGORIES)[number];

export const HR_DOCUMENT_GROUP_MAP: Record<string, string> = {
  AADHAAR: 'Identity',
  PAN: 'Identity',
  ID_PHOTO: 'Identity',
  DEGREE: 'Academic',
  TENTH_MARKSHEET: 'Academic',
  TWELFTH_MARKSHEET: 'Academic',
  VOID_CHEQUE: 'Financial',
  OFFER_LETTER: 'HR Letters',
  RELIEVING_LETTER: 'HR Letters',
  OTHER: 'Other',
};
