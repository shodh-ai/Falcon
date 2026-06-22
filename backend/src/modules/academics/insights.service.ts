import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class InsightsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getAcademicPerformance(tenantId: string) {
    // 1. Fetch Academic Marks for year-wise breakdown and bottlenecks
    const marks = await this.db.query(
      `SELECT m.student_user_id, m.course_id, m.exam_type, m.marks_obtained, e.semester, c.course_code, c.course_name
       FROM academic_marks m
       JOIN student_course_enrollments e ON e.course_id = m.course_id AND e.student_user_id = m.student_user_id
       JOIN academic_courses c ON c.course_id = m.course_id
       WHERE m.tenant_id = $1`,
      [tenantId]
    );

    // 2. Fetch Enrollments with Department for CGPA, Attendance, and Department stats
    const enrollments = await this.db.query(
      `SELECT e.student_user_id, e.semester, e.status, e.grade_points, e.attendance_percent, u.dept_id, d.dept_name, sp.batch
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
       WHERE e.tenant_id = $1`,
      [tenantId]
    );

    // 3. Fetch Placements for correlative analytics
    const placements = await this.db.query(
      `SELECT p.student_user_id, p.status 
       FROM placement_job_applications p
       JOIN users u ON u.user_id = p.student_user_id
       WHERE u.tenant_id = $1`,
      [tenantId]
    ).catch(() => []);

    // --- AGGREGATE BASE DATA ---
    const studentCourseMarks = new Map<string, Map<string, Record<string, number>>>();
    const studentsByYear = new Map<number, Set<string>>();
    const courseFailures: Record<string, { code: string; name: string; fail: number; total: number }> = {};
    const studentStats = new Map<string, { points: number; credits: number; backlogs: number; deptName: string; batch: string; attendanceSum: number; attendanceCount: number }>();

    for (const row of enrollments) {
      const sId = row.student_user_id;
      if (!studentStats.has(sId)) {
        studentStats.set(sId, { points: 0, credits: 0, backlogs: 0, deptName: row.dept_name || 'Unknown', batch: row.batch || 'Unknown', attendanceSum: 0, attendanceCount: 0 });
      }
      const st = studentStats.get(sId)!;
      if (row.grade_points) {
        st.points += Number(row.grade_points); // Assuming 1 credit for simplification in aggregate
        st.credits += 1;
      }
      if (row.status === 'FAILED') st.backlogs++;
      st.attendanceSum += Number(row.attendance_percent || 0);
      st.attendanceCount++;
    }

    for (const row of marks) {
      const studentId = row.student_user_id;
      const courseId = row.course_id;
      const semester = Number(row.semester);

      let year = 1;
      if (semester === 3 || semester === 4) year = 2;
      else if (semester === 5 || semester === 6) year = 3;
      else if (semester >= 7) year = 4;

      if (!studentsByYear.has(year)) studentsByYear.set(year, new Set());
      studentsByYear.get(year)!.add(studentId);

      if (!studentCourseMarks.has(studentId)) studentCourseMarks.set(studentId, new Map());
      if (!studentCourseMarks.get(studentId)!.has(courseId)) studentCourseMarks.get(studentId)!.set(courseId, {});
      
      studentCourseMarks.get(studentId)!.get(courseId)![row.exam_type] = Number(row.marks_obtained) || 0;

      // Track bottleneck subjects (simplification: looking at end term fails)
      if (row.exam_type === 'END_TERM') {
        if (!courseFailures[courseId]) courseFailures[courseId] = { code: row.course_code, name: row.course_name, fail: 0, total: 0 };
        courseFailures[courseId].total++;
        if (Number(row.marks_obtained) < 33) courseFailures[courseId].fail++;
      }
    }

    const calculateGrade = (total: number) => {
      if (total >= 90) return 'AA';
      if (total >= 80) return 'AB';
      if (total >= 70) return 'BB';
      if (total >= 60) return 'BC';
      if (total >= 50) return 'CC';
      if (total >= 40) return 'CD';
      if (total >= 33) return 'DD';
      return 'F';
    };

    // --- YEAR-WISE BREAKDOWN ---
    const yearsData: any[] = [];
    for (let year = 1; year <= 4; year++) {
      const students = studentsByYear.get(year) || new Set();
      let midTermRed = 0, midTermYellow = 0, midTermGreen = 0;
      const gradeCounts: Record<string, number> = { AA: 0, AB: 0, BB: 0, BC: 0, CC: 0, CD: 0, DD: 0, F: 0 };

      for (const studentId of students) {
        const courses = studentCourseMarks.get(studentId);
        if (!courses) continue;
        for (const [courseId, examMarks] of courses.entries()) {
          const cat1 = examMarks['CAT1'] || 0;
          const cat2 = examMarks['CAT2'] || 0;
          const midTerm = cat1 + cat2;

          if (examMarks['CAT1'] !== undefined || examMarks['CAT2'] !== undefined) {
            if (midTerm < 10) midTermRed++;
            else if (midTerm < 20) midTermYellow++;
            else midTermGreen++;
          }

          const endTerm = examMarks['END_TERM'] || 0;
          const internal = examMarks['INTERNAL'] || 0;
          const quiz = examMarks['QUIZ'] || 0;

          if (examMarks['END_TERM'] !== undefined) {
            const total = midTerm + endTerm + internal + quiz;
            const grade = calculateGrade(total);
            if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
          }
        }
      }
      yearsData.push({ year, midTerm: { red: midTermRed, yellow: midTermYellow, green: midTermGreen }, endTerm: gradeCounts });
    }

    // --- ADVANCED METRICS ---
    let totalStudents = 0;
    let excellenceCount = 0;
    let riskCount = 0;

    const deptStats: Record<string, { cgpaSum: number; count: number; passCount: number }> = {};
    const batchStats: Record<string, { cgpaSum: number; count: number }> = {};
    const attendanceStats = {
      low: { cgpaSum: 0, count: 0 },
      medium: { cgpaSum: 0, count: 0 },
      high: { cgpaSum: 0, count: 0 }
    };
    const cgpaPlacements = {
      excellent: { total: 0, placed: 0 },
      average: { total: 0, placed: 0 },
      poor: { total: 0, placed: 0 }
    };

    const placementMap = new Map<string, boolean>();
    for (const p of placements) {
      if (p.status === 'OFFERED' || p.status === 'ACCEPTED') placementMap.set(p.student_user_id, true);
    }

    for (const [sId, st] of studentStats.entries()) {
      if (st.credits === 0) continue;
      const cgpa = st.points / st.credits;
      const avgAtt = st.attendanceCount > 0 ? st.attendanceSum / st.attendanceCount : 0;
      totalStudents++;

      // Excellence & Risk
      if (cgpa >= 9.0) excellenceCount++;
      if (st.backlogs > 0) riskCount++;

      // Department Comp
      if (!deptStats[st.deptName]) deptStats[st.deptName] = { cgpaSum: 0, count: 0, passCount: 0 };
      deptStats[st.deptName].cgpaSum += cgpa;
      deptStats[st.deptName].count++;
      if (st.backlogs === 0) deptStats[st.deptName].passCount++;

      // Batch Progression
      if (!batchStats[st.batch]) batchStats[st.batch] = { cgpaSum: 0, count: 0 };
      batchStats[st.batch].cgpaSum += cgpa;
      batchStats[st.batch].count++;

      // Attendance Correlative
      if (avgAtt < 75) { attendanceStats.low.cgpaSum += cgpa; attendanceStats.low.count++; }
      else if (avgAtt < 85) { attendanceStats.medium.cgpaSum += cgpa; attendanceStats.medium.count++; }
      else { attendanceStats.high.cgpaSum += cgpa; attendanceStats.high.count++; }

      // Placement Correlative
      const placed = placementMap.has(sId) ? 1 : 0;
      if (cgpa >= 8.5) { cgpaPlacements.excellent.total++; cgpaPlacements.excellent.placed += placed; }
      else if (cgpa >= 6.5) { cgpaPlacements.average.total++; cgpaPlacements.average.placed += placed; }
      else { cgpaPlacements.poor.total++; cgpaPlacements.poor.placed += placed; }
    }

    const bottleneckArray = Object.values(courseFailures)
      .map(c => ({ courseCode: c.code, courseName: c.name, failureRate: c.total > 0 ? (c.fail / c.total) * 100 : 0 }))
      .filter(c => c.failureRate > 20)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);

    const formatRate = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0;
    const formatAvg = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(2)) : 0;

    return {
      years: yearsData,
      summary: {
        excellenceRate: formatRate(excellenceCount, totalStudents),
        riskRate: formatRate(riskCount, totalStudents)
      },
      comparative: {
        departmentWise: Object.entries(deptStats).map(([dept, stat]) => ({
          department: dept,
          avgCgpa: formatAvg(stat.cgpaSum, stat.count),
          passRate: formatRate(stat.passCount, stat.count)
        })),
        cohortProgression: Object.entries(batchStats).map(([batch, stat]) => ({
          batch,
          avgCgpa: formatAvg(stat.cgpaSum, stat.count)
        })).sort((a, b) => a.batch.localeCompare(b.batch))
      },
      outliers: {
        bottlenecks: bottleneckArray
      },
      correlative: {
        attendanceVsSgpa: [
          { attendanceBand: '<75%', avgCgpa: formatAvg(attendanceStats.low.cgpaSum, attendanceStats.low.count) },
          { attendanceBand: '75-85%', avgCgpa: formatAvg(attendanceStats.medium.cgpaSum, attendanceStats.medium.count) },
          { attendanceBand: '>85%', avgCgpa: formatAvg(attendanceStats.high.cgpaSum, attendanceStats.high.count) }
        ],
        placementVsCgpa: [
          { cgpaTier: '>8.5', offerRate: formatRate(cgpaPlacements.excellent.placed, cgpaPlacements.excellent.total) },
          { cgpaTier: '6.5-8.5', offerRate: formatRate(cgpaPlacements.average.placed, cgpaPlacements.average.total) },
          { cgpaTier: '<6.5', offerRate: formatRate(cgpaPlacements.poor.placed, cgpaPlacements.poor.total) }
        ]
      },
      demographic: {
        // MOCKED Scholarship Data as requested
        scholarshipRoi: [
          { group: 'Institutional Scholarship', avgCgpa: 8.8, retentionRate: 95 },
          { group: 'General Population', avgCgpa: 7.4, retentionRate: 88 },
          { group: 'Govt. Sponsored', avgCgpa: 7.9, retentionRate: 91 }
        ]
      }
    };
  }
}
