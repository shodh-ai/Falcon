import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { useEcellConfig, useEcellProjects } from '@/hooks/useAcademics';

const STEPS = ['Submitted', 'Under L1 Review', 'L1 Approved', 'Under L2 Review', 'Fund Granted'];

function trackerIndex(status: string) {
  if (status === 'REJECTED') return -1;
  if (status === 'FUNDED') return STEPS.length - 1;
  if (status === 'L2_APPROVED') return 3;
  if (status === 'L1_APPROVED') return 2;
  if (status === 'UNDER_L1_REVIEW') return 1;
  return 0;
}

export default function EcellScreen() {
  const config = useEcellConfig();
  const projects = useEcellProjects();
  const refreshing = projects.isRefetching || config.isRefetching;

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => {
      void projects.refetch();
      void config.refetch();
    }}>
      <View className="gap-4 pb-6">
        <Card>
          <Text className="text-base font-bold text-sgvu-navy">E-Cell & Incubation Hub</Text>
          <Text className="text-sm text-sgvu-navy/70 mt-2">
            {config.data
              ? `Active cohort: ${config.data.cohort_name}`
              : 'No active incubation cohort is open right now.'}
          </Text>
          <Text className="text-xs text-sgvu-navy/60 mt-2">
            Submit and track your startup pitch from the Falcon web portal. Mobile tracker updates here in real time.
          </Text>
        </Card>

        {projects.isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (projects.data ?? []).length === 0 ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">No incubation pitches submitted yet.</Text>
          </Card>
        ) : (
          (projects.data ?? []).map((project) => {
            const activeIdx = trackerIndex(project.current_status);
            const rejected = project.current_status === 'REJECTED';
            return (
              <Card key={project.project_id}>
                <Text className="text-base font-bold text-sgvu-navy">{project.startup_name}</Text>
                <Text className="text-xs text-sgvu-gold mt-1">{project.current_status.replace(/_/g, ' ')}</Text>
                <Text className="text-sm text-sgvu-navy/70 mt-2" numberOfLines={4}>
                  {project.innovation_description}
                </Text>
                {rejected ? (
                  <Text className="text-sm text-red-600 mt-3">This pitch was rejected.</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-2 mt-4">
                    {STEPS.map((step, idx) => (
                      <View
                        key={step}
                        className={`rounded-full px-3 py-1 ${idx <= activeIdx ? 'bg-emerald-100' : 'bg-slate-100'}`}
                      >
                        <Text className={`text-[10px] font-semibold ${idx <= activeIdx ? 'text-emerald-800' : 'text-slate-500'}`}>
                          {step}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
