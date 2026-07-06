const { DataSource } = require('typeorm');
const { AcademicAssignment } = require('./dist/entities/academic-assignment.entity');
const { StudentCourseEnrollment } = require('./dist/entities/student-course-enrollment.entity');
const { AssignmentSubmission } = require('./dist/entities/assignment-submission.entity');

async function test() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: 'postgres://postgres:postgres@localhost:5432/university_governance',
    entities: [
      __dirname + '/dist/**/*.entity.js'
    ],
  });
  await dataSource.initialize();
  const assignmentsRepo = dataSource.getRepository('AcademicAssignment');
  
  const courseIds = ['62f50300-2aff-4a5d-9832-3f040d8dab86'];
  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  
  const qb = assignmentsRepo
    .createQueryBuilder('assignment')
    .leftJoinAndSelect('assignment.course', 'course')
    .where('assignment.tenant_id = :tenantId', { tenantId })
    .andWhere('assignment.course_id IN (:...courseIds)', { courseIds })
    .andWhere('assignment.start_date <= NOW()')
    .orderBy('assignment.due_date', 'ASC');
    
  console.log('SQL:', qb.getSql());
  const assignments = await qb.getMany();
    
  console.log('Assignments returned by typeorm:', assignments);
  await dataSource.destroy();
}
test().catch(console.error);
