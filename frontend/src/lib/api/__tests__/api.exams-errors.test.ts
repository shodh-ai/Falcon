import { beforeEach, describe, expect, it, vi } from 'vitest';
const { apiFetch }=vi.hoisted(()=>({apiFetch:vi.fn()}));
vi.mock('../client',()=>({API_URL:'http://127.0.0.1:4400',apiFetch}));
import { examsApi } from '../api.exams';
beforeEach(()=>apiFetch.mockReset());
describe('Examination API error copy',()=>{
  it('shows the active-application message without raw HTTP/JSON details',async()=>{
    apiFetch.mockRejectedValueOnce(new Error('API 409 Conflict: {"message":"An active application already exists for this subject","error":"Conflict","statusCode":409}'));
    await expect(examsApi.apply('token',{subject_id:1,application_type:'RE_EVALUATION'})).rejects.toMatchObject({ message: 'An active application already exists for this subject' });
  });
  it('retains validation messages and genuine connectivity failures',async()=>{
    apiFetch.mockRejectedValueOnce(new Error('API 400 Bad Request: {"message":["Choose the exact examination"]}'));
    await expect(examsApi.reEvaluationSources('token')).rejects.toThrow('Choose the exact examination');
    apiFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(examsApi.schedule('token')).rejects.toThrow('Failed to fetch');
  });
});
