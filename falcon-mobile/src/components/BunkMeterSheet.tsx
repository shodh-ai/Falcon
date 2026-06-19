import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeBunkMeter } from '@/lib/bunk-meter';
import type { SubjectMarks } from '@/types/academics';

interface BunkMeterSheetProps {
  visible: boolean;
  onClose: () => void;
  courseCode: string;
  courseName: string;
  attendancePercent: number;
  marks?: SubjectMarks | null;
}

export function BunkMeterSheet({
  visible,
  onClose,
  courseCode,
  courseName,
  attendancePercent,
  marks,
}: BunkMeterSheetProps) {
  const { height } = useWindowDimensions();
  const bunk = computeBunkMeter(attendancePercent);
  const [marksExpanded, setMarksExpanded] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-sgvu-surface"
          style={{ maxHeight: height * 0.85 }}
        >
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-sgvu-navy/20" />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-sgvu-gold">{courseCode}</Text>
                <Text className="text-xl font-bold text-sgvu-navy mt-1">{courseName}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color="#08234a" />
              </Pressable>
            </View>

            <View className="rounded-2xl bg-white p-5 shadow-sm">
              <Text className="text-base font-bold text-sgvu-navy">Bunk Meter</Text>
              <View className="flex-row justify-between mt-4">
                <View className="items-center flex-1">
                  <Text className="text-2xl font-black text-sgvu-navy">{bunk.conducted}</Text>
                  <Text className="text-xs text-sgvu-navy/60 mt-1">Conducted</Text>
                </View>
                <View className="w-px bg-sgvu-navy/10" />
                <View className="items-center flex-1">
                  <Text className="text-2xl font-black text-sgvu-gold">{bunk.attended}</Text>
                  <Text className="text-xs text-sgvu-navy/60 mt-1">Attended</Text>
                </View>
                <View className="w-px bg-sgvu-navy/10" />
                <View className="items-center flex-1">
                  <Text
                    className={`text-2xl font-black ${bunk.percent >= 75 ? 'text-emerald-600' : 'text-red-500'}`}
                  >
                    {Math.round(bunk.percent)}%
                  </Text>
                  <Text className="text-xs text-sgvu-navy/60 mt-1">Current</Text>
                </View>
              </View>
              <View
                className={`mt-4 rounded-xl p-3 ${bunk.margin > 0 ? 'bg-emerald-50' : bunk.margin === 0 ? 'bg-amber-50' : 'bg-red-50'}`}
              >
                <Text
                  className={`text-sm font-medium ${bunk.margin > 0 ? 'text-emerald-800' : bunk.margin === 0 ? 'text-amber-800' : 'text-red-800'}`}
                >
                  {bunk.marginMessage}
                </Text>
              </View>
            </View>

            <View className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <Pressable
                onPress={() => setMarksExpanded((v) => !v)}
                className="flex-row items-center justify-between p-5"
              >
                <Text className="text-base font-bold text-sgvu-navy">Marks</Text>
                <Ionicons
                  name={marksExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#08234a"
                />
              </Pressable>
              {marksExpanded ? (
                <View className="px-5 pb-5 gap-2 border-t border-sgvu-navy/5">
                  {marks?.components?.length ? (
                    marks.components.map((c) => (
                      <View
                        key={c.key}
                        className="flex-row justify-between py-2 border-b border-sgvu-navy/5"
                      >
                        <Text className="text-sm text-sgvu-navy/80">{c.label}</Text>
                        <Text className="text-sm font-semibold text-sgvu-navy">
                          {c.marks_obtained}/{c.max_marks}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-sm text-sgvu-navy/60 py-2">
                      No published marks for this subject yet.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
