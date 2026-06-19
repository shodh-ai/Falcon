import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AttendanceRing } from '@/components/AttendanceRing';
import { BunkMeterSheet } from '@/components/BunkMeterSheet';
import { SubjectCardSkeleton } from '@/components/Skeleton';
import { useAttendanceSummary, useDashboardMetrics, useMarksHistory } from '@/hooks/useAcademics';
import type { SubjectAttendance, SubjectMarks } from '@/types/academics';

function SubjectCard({
  subject,
  onPress,
}: {
  subject: SubjectAttendance;
  onPress: () => void;
}) {
  const pct = Number(subject.attendance_percent);
  return (
    <Pressable onPress={onPress}>
      <Card className="flex-row items-center justify-between mb-3 py-4">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-sgvu-gold">{subject.course_code}</Text>
          <Text className="text-base font-bold text-sgvu-navy mt-0.5">{subject.course_name}</Text>
          <Text className="text-xs text-sgvu-navy/50 mt-1">Semester {subject.semester}</Text>
        </View>
        <AttendanceRing percent={pct} size={56} label="" glowWhenLow={false} />
      </Card>
    </Pressable>
  );
}

export default function AcademicsScreen() {
  const attendance = useAttendanceSummary();
  const metrics = useDashboardMetrics();
  const marks = useMarksHistory();
  const [selected, setSelected] = useState<SubjectAttendance | null>(null);

  const marksByCourse = useMemo(() => {
    const map = new Map<string, SubjectMarks>();
    const currentSem = marks.data?.component_marks_by_semester?.at(-1);
    for (const subject of currentSem?.subjects ?? []) {
      map.set(subject.course_code, subject);
    }
    return map;
  }, [marks.data]);

  const subjects = attendance.data?.subject_wise ?? [];
  const overall = attendance.data?.overall_percent ?? metrics.data?.attendance_percent ?? 0;

  const isRefreshing = attendance.isRefetching || marks.isRefetching || metrics.isRefetching;
  const onRefresh = () => {
    void attendance.refetch();
    void marks.refetch();
    void metrics.refetch();
  };

  return (
    <>
      <Screen scroll refreshing={isRefreshing} onRefresh={onRefresh}>
        <View className="gap-4 pb-8">
          <Card className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-sgvu-navy">Academics</Text>
              <Text className="text-sm text-sgvu-navy/60 mt-1">
                {subjects.length} subjects · Tap for Bunk Meter
              </Text>
            </View>
            {attendance.isLoading ? (
              <View className="h-14 w-14 rounded-full bg-sgvu-navy/5" />
            ) : (
              <AttendanceRing percent={overall} size={72} label="" glowWhenLow />
            )}
          </Card>

          <View>
            <Text className="text-base font-bold text-sgvu-navy mb-3">Subject Attendance</Text>
            {attendance.isLoading ? (
              <>
                <SubjectCardSkeleton />
                <SubjectCardSkeleton />
                <SubjectCardSkeleton />
              </>
            ) : subjects.length === 0 ? (
              <Card>
                <Text className="text-sm text-sgvu-navy/60">
                  No enrollment records yet. Courses will appear once registered.
                </Text>
              </Card>
            ) : (
              subjects.map((subject) => (
                <SubjectCard
                  key={`${subject.course_code}-${subject.semester}`}
                  subject={subject}
                  onPress={() => setSelected(subject)}
                />
              ))
            )}
          </View>

          <View>
            <Text className="text-base font-bold text-sgvu-navy mb-3">Semester Marks</Text>
            {marks.isLoading ? (
              <SubjectCardSkeleton />
            ) : (marks.data?.component_marks_by_semester ?? []).length === 0 ? (
              <Card>
                <Text className="text-sm text-sgvu-navy/60">Marks will appear once published.</Text>
              </Card>
            ) : (
              (marks.data?.component_marks_by_semester ?? []).map((sem) => (
                <Card key={sem.semester_number} className="mb-3">
                  <Text className="text-sm font-bold text-sgvu-gold">
                    Semester {sem.semester_number}
                  </Text>
                  {sem.subjects.map((sub) => (
                    <View
                      key={sub.course_id}
                      className="mt-3 pt-3 border-t border-sgvu-navy/5"
                    >
                      <Text className="text-sm font-semibold text-sgvu-navy">
                        {sub.course_code} — {sub.course_name}
                      </Text>
                      <View className="mt-2 gap-1">
                        {sub.components.map((c) => (
                          <View key={c.key} className="flex-row justify-between">
                            <Text className="text-xs text-sgvu-navy/70">{c.label}</Text>
                            <Text className="text-xs font-semibold text-sgvu-navy">
                              {c.marks_obtained}/{c.max_marks}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </Card>
              ))
            )}
          </View>

          {marks.data?.cgpa != null ? (
            <Card className="flex-row items-center gap-3">
              <Ionicons name="ribbon-outline" size={24} color="#d6b65d" />
              <View>
                <Text className="text-sm text-sgvu-navy/60">CGPA</Text>
                <Text className="text-xl font-black text-sgvu-navy">
                  {marks.data.cgpa.toFixed(2)}
                </Text>
              </View>
            </Card>
          ) : null}
        </View>
      </Screen>

      <BunkMeterSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        courseCode={selected?.course_code ?? ''}
        courseName={selected?.course_name ?? ''}
        attendancePercent={Number(selected?.attendance_percent ?? 0)}
        marks={selected ? marksByCourse.get(selected.course_code) : null}
      />
    </>
  );
}
