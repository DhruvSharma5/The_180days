// Data hooks for every feature endpoint — TanStack Query over the typed fetch layer.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type {
  AdminAnalyticsOut, AdminOverviewOut, AdminUsersOut, CalendarOut, CheckpointBody,
  CheckpointOut, DayDetailOut, InterviewPlanOut, JourneyStartBody, JourneyState,
  MessageOut, MockBody, MockOut, OverviewOut, ProgressUpdateBody, ProjectUpdateBody,
  ProjectOut, RoadmapDayOut, SummaryOut, WeeklyRevisionBody, WeeklyRevisionOut,
} from "@/types";

export function useJourney() {
  return useQuery({
    queryKey: ["journey"],
    queryFn: () => apiGet<JourneyState>("/journey"),
    retry: false,
    staleTime: 30_000,
  });
}

export function useStartJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JourneyStartBody) =>
      apiPost<JourneyState>("/journey/start", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journey"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

function useInvalidate(keys: (string | number)[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export function useJourneyActions() {
  const invalidate = useInvalidate([["journey"], ["summary"], ["calendar"]]);
  return {
    pause: useMutation({
      mutationFn: () => apiPost<MessageOut>("/journey/pause"),
      onSuccess: invalidate,
    }),
    resume: useMutation({
      mutationFn: () => apiPost<MessageOut>("/journey/resume"),
      onSuccess: invalidate,
    }),
  };
}

export function useSummary() {
  return useQuery({ queryKey: ["summary"], queryFn: () => apiGet<SummaryOut>("/progress/summary") });
}

export function useCalendar() {
  return useQuery({ queryKey: ["calendar"], queryFn: () => apiGet<CalendarOut>("/progress/calendar") });
}

export function useDayDetail(day: number | null) {
  return useQuery({
    queryKey: ["progress", day],
    queryFn: () => apiGet<DayDetailOut>(`/progress/day/${day}`),
    enabled: day !== null && day >= 1 && day <= 180,
  });
}

export function useSaveDay(day: number) {
  const invalidate = useInvalidate([["progress", day], ["summary"], ["calendar"]]);
  return useMutation({
    mutationFn: (body: ProgressUpdateBody) => apiPut<DayDetailOut["progress"]>(`/progress/day/${day}`, body),
    onSuccess: invalidate,
  });
}

export function useRoadmapDay(day: number | null) {
  return useQuery({
    queryKey: ["roadmap", day],
    queryFn: () => apiGet<RoadmapDayOut>(`/roadmap/day/${day}`),
    enabled: day !== null,
  });
}

export function useRoadmapOverview() {
  return useQuery({ queryKey: ["roadmap-overview"], queryFn: () => apiGet<OverviewOut>("/roadmap/overview") });
}

export function useMocks() {
  return useQuery({ queryKey: ["mocks"], queryFn: () => apiGet<MockOut[]>("/mocks") });
}

export function useSaveMock() {
  const invalidate = useInvalidate([["mocks"], ["summary"]]);
  return useMutation({
    mutationFn: ({ week, body }: { week: number; body: MockBody }) =>
      apiPut<MockOut>(`/mocks/week/${week}`, body),
    onSuccess: invalidate,
  });
}

export function useWeeklyRevision(week: number | null) {
  return useQuery({
    queryKey: ["revision", week],
    queryFn: () => apiGet<WeeklyRevisionOut>(`/revision/week/${week}`),
    enabled: week !== null,
  });
}

export function useSaveWeeklyRevision(week: number) {
  const invalidate = useInvalidate([["revision", week], ["summary"]]);
  return useMutation({
    mutationFn: (body: WeeklyRevisionBody) => apiPut<WeeklyRevisionOut>(`/revision/week/${week}`, body),
    onSuccess: invalidate,
  });
}

export function useCheckpoints() {
  return useQuery({ queryKey: ["checkpoints"], queryFn: () => apiGet<CheckpointOut[]>("/checkpoints") });
}

export function useSaveCheckpoint() {
  const invalidate = useInvalidate([["checkpoints"], ["summary"]]);
  return useMutation({
    mutationFn: ({ month, body }: { month: number; body: CheckpointBody }) =>
      apiPut<CheckpointOut>(`/checkpoints/month/${month}`, body),
    onSuccess: invalidate,
  });
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => apiGet<ProjectOut[]>("/journey/projects") });
}

export function useSaveProject() {
  const invalidate = useInvalidate([["projects"], ["summary"]]);
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: ProjectUpdateBody }) =>
      apiPut<ProjectOut>(`/projects/${key}`, body),
    onSuccess: invalidate,
  });
}

export function useInterviewPlan() {
  return useQuery({ queryKey: ["interview"], queryFn: () => apiGet<InterviewPlanOut>("/interview/plan") });
}

export function useSaveInterviewDay(day: number) {
  const invalidate = useInvalidate([["interview"], ["summary"]]);
  return useMutation({
    mutationFn: (body: ProgressUpdateBody) => apiPut<unknown>(`/progress/day/${180 + day}`, body),
    onSuccess: invalidate,
  });
}

export function useAdminAnalytics(params: { range: string; from_date?: string; to_date?: string }) {
  const search = new URLSearchParams();
  search.set("range", params.range);
  if (params.from_date) search.set("from_date", params.from_date);
  if (params.to_date) search.set("to_date", params.to_date);
  return useQuery({
    queryKey: ["admin-analytics", params],
    queryFn: () => apiGet<AdminAnalyticsOut>(`/admin/analytics?${search.toString()}`),
  });
}

export function useAdminOverview() {
  return useQuery({ queryKey: ["admin-overview"], queryFn: () => apiGet<AdminOverviewOut>("/admin/overview") });
}

export function useAdminUsers(page: number, q: string) {
  const search = new URLSearchParams({ page: String(page), limit: "20" });
  if (q) search.set("q", q);
  return useQuery({
    queryKey: ["admin-users", page, q],
    queryFn: () => apiGet<AdminUsersOut>(`/admin/users?${search.toString()}`),
  });
}

export function useSendReminders() {
  return useMutation({
    mutationFn: () => apiPost<MessageOut>("/admin/reminders/send"),
  });
}
