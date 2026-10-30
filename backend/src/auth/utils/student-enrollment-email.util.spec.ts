import {isStudentEnrollmentEmail} from './student-enrollment-email.util';
describe('student identity email classification',()=>{
  test.each(['12345.student@mygyanvihar.com','00123.student@mygyanvihar.com','12345.STUDENT@mygyanvihar.com','legacy.12345@mygyanvihar.com'])('recognizes student pattern %s',email=>expect(isStudentEnrollmentEmail(email)).toBe(true));
  test.each(['principal.pharma@mygyanvihar.com','hod.pharma@mygyanvihar.com','manish1.gupta@mygyanvihar.com'])('never classifies staff/office %s as Student',email=>expect(isStudentEnrollmentEmail(email)).toBe(false));
});
