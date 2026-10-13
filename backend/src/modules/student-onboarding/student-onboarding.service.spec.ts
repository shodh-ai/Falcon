import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
import { StudentOnboardingService } from './student-onboarding.service';

describe('StudentOnboardingService first-login password reset', () => {
  const makeService = (query: jest.Mock) =>
    new StudentOnboardingService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('moves a newly imported student from password reset to profile setup', async () => {
    const query = jest.fn();
    query.mockResolvedValueOnce([
      {
        password_hash: await bcrypt.hash('Temporary-123!', 4),
        onboarding_status: 'PENDING_PASSWORD_RESET',
        account_status: 'PASSWORD_RESET_REQUIRED',
      },
    ]);
    query.mockResolvedValueOnce([]);

    const result = await makeService(query).resetPassword(
      'tenant-1',
      'student-1',
      'Temporary-123!',
      'Student-New-123!',
    );

    expect(result).toEqual({ onboarding_status: 'PENDING_DOCUMENTS' });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('onboarding_status = $4'),
      expect.arrayContaining(['student-1', 'tenant-1', 'PENDING_DOCUMENTS', true]),
    );
  });

  it('preserves a completed account when an administrator issues a reset', async () => {
    const query = jest.fn();
    query.mockResolvedValueOnce([
      {
        password_hash: await bcrypt.hash('Existing-123!', 4),
        onboarding_status: 'COMPLETED',
        account_status: 'PASSWORD_RESET_REQUIRED',
      },
    ]);
    query.mockResolvedValueOnce([]);

    const result = await makeService(query).resetPassword(
      'tenant-1',
      'faculty-1',
      'Existing-123!',
      'Faculty-New-123!',
    );

    expect(result).toEqual({ onboarding_status: 'COMPLETED' });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('onboarding_status = $4'),
      expect.arrayContaining(['faculty-1', 'tenant-1', 'COMPLETED', true]),
    );
  });
});

describe('StudentOnboardingService submission validation', () => {
  const service = new StudentOnboardingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('identifies missing staff profile fields separately from uploaded documents', () => {
    expect(() => service['validateProfileComplete']('staff', {
      blood_group: 'O+',
      staff_mobile: '9876543210',
      pan_number: 'ABCDE1234F',
      aadhaar_number: '123456789012',
      bank_account_no: '1234567890',
      ifsc_code: 'TEST0000001',
      gender: 'Male',
      date_of_birth: '1990-01-01',
      emergency_contact_name: 'Emergency contact',
      emergency_contact_phone: '9876543211',
      permanent_address: 'Address',
      current_address: 'Address',
      orcid_id: '',
      total_experience_years: 0,
      degree_level: 'PG',
      degree_name: 'M.Pharm',
      university: 'University',
      passing_year: 2015,
    })).toThrow(new BadRequestException('Complete the required profile fields: ORCID ID'));
  });

  it('identifies the exact missing student field', () => {
    expect(() => service['validateProfileComplete']('student', {
      blood_group: 'O+',
      parent_contact_phone: '9876543211',
      abc_id: '123456789012',
      student_mobile: '9876543210',
      gender: 'Female',
      date_of_birth: '2005-01-01',
      father_name: 'Parent one',
      mother_name: 'Parent two',
      emergency_contact_name: 'Parent one',
      permanent_address: 'Address',
      current_address: '',
    })).toThrow(new BadRequestException('Complete the required profile fields: Current address'));
  });
});
