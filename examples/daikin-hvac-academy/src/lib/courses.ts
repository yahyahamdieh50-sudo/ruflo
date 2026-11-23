import { query, queryOne } from "./db";
import type { Tier } from "./entitlements";
import { evaluateSpec, type SpecDisplay } from "./content-rules";

export interface CourseCard {
  id: string; slug: string; category: string; title_en: string; title_ar: string | null;
  summary_en: string; summary_ar: string | null; level: "beginner" | "intermediate" | "advanced";
  tier: Tier; status: string; image_url: string | null; is_sample: boolean;
  lesson_count: number; duration_min: number; rating_avg: number | null; rating_count: number;
}

const CARD_SQL = `
  SELECT c.id,c.slug,c.category,c.title_en,c.title_ar,c.summary_en,c.summary_ar,c.level,c.tier,c.status,c.image_url,c.is_sample,
    COALESCE(ls.cnt,0)::int AS lesson_count, COALESCE(ls.dur,0)::int AS duration_min,
    rv.avg AS rating_avg, COALESCE(rv.cnt,0)::int AS rating_count
  FROM courses c
  LEFT JOIN (SELECT course_id, count(*) AS cnt, sum(duration_min) AS dur FROM lessons GROUP BY course_id) ls ON ls.course_id=c.id
  LEFT JOIN (SELECT course_id, avg(rating) AS avg, count(*) AS cnt FROM reviews GROUP BY course_id) rv ON rv.course_id=c.id`;

const norm = (r: any): CourseCard => ({ ...r, rating_avg: r.rating_avg == null ? null : Number(r.rating_avg) });

export interface CourseFilter { q?: string; category?: string; level?: string; tier?: string; statuses?: string[] }

/** Search matches title, summary, category and linked equipment model numbers. */
export async function listCourses(f: CourseFilter = {}): Promise<CourseCard[]> {
  const where: string[] = []; const p: unknown[] = [];
  const statuses = f.statuses ?? ["published", "coming_soon"];
  p.push(statuses); where.push(`c.status = ANY($${p.length})`);
  if (f.category) { p.push(f.category); where.push(`c.category=$${p.length}`); }
  if (f.level) { p.push(f.level); where.push(`c.level=$${p.length}`); }
  if (f.tier) { p.push(f.tier); where.push(`c.tier=$${p.length}`); }
  if (f.q?.trim()) {
    p.push(`%${f.q.trim().replace(/[%_\\]/g, "\\$&")}%`);
    const i = p.length;
    where.push(`(c.title_en ILIKE $${i} OR c.title_ar ILIKE $${i} OR c.summary_en ILIKE $${i} OR c.category ILIKE $${i}
      OR c.id IN (SELECT cm.course_id FROM course_models cm JOIN equipment_models m ON m.id=cm.model_id WHERE m.model_number ILIKE $${i} OR m.series ILIKE $${i}))`);
  }
  const rows = await query(`${CARD_SQL} WHERE ${where.join(" AND ")} ORDER BY (c.status='published') DESC, c.is_sample DESC, c.title_en`, p);
  return rows.map(norm);
}

export async function getCourseCard(id: string): Promise<CourseCard | null> {
  const r = await queryOne(`${CARD_SQL} WHERE c.id=$1`, [id]);
  return r ? norm(r) : null;
}

export interface LessonSummary {
  id: string; chapter_id: string; position: number; title_en: string; title_ar: string | null;
  duration_min: number; is_free_preview: boolean; tier: Tier; spec_status: "generic" | "model_specific"; has_video: boolean;
}
export interface Chapter { id: string; position: number; title_en: string; title_ar: string | null; lessons: LessonSummary[] }
export interface CourseDetail {
  course: CourseCard & { trailer_key: string | null; author_id: string | null; technical_reviewed_by: string | null; technical_reviewed_at: string | null };
  chapters: Chapter[];
  models: { id: string; model_number: string; series: string | null; refrigerant: string | null; is_placeholder: boolean; verified: boolean }[];
  quizzes: { id: string; kind: "lesson" | "final"; lesson_id: string | null; title_en: string; title_ar: string | null; pass_mark: number; question_count: number }[];
  resources: { id: string; title_en: string; title_ar: string | null; kind: string }[];
}

export async function getCourseDetailBySlug(slug: string): Promise<CourseDetail | null> {
  const row = await queryOne<{ id: string }>("SELECT id FROM courses WHERE slug=$1", [slug]);
  return row ? getCourseDetail(row.id) : null;
}

export async function getCourseDetail(id: string): Promise<CourseDetail | null> {
  const card = await getCourseCard(id);
  if (!card) return null;
  const extra = await queryOne("SELECT trailer_key,author_id,technical_reviewed_by,technical_reviewed_at FROM courses WHERE id=$1", [id]);
  const chapters = await query<Omit<Chapter, "lessons">>("SELECT id,position,title_en,title_ar FROM chapters WHERE course_id=$1 ORDER BY position", [id]);
  const lessons = await query<LessonSummary>(
    `SELECT id,chapter_id,position,title_en,title_ar,duration_min,is_free_preview,tier,spec_status,(video_key IS NOT NULL) AS has_video
     FROM lessons WHERE course_id=$1 ORDER BY position`, [id]);
  const models = await query(
    `SELECT m.id,m.model_number,m.series,m.refrigerant,m.is_placeholder,m.verified FROM course_models cm JOIN equipment_models m ON m.id=cm.model_id WHERE cm.course_id=$1 ORDER BY m.model_number`, [id]);
  const quizzes = await query(
    `SELECT q.id,q.kind,q.lesson_id,q.title_en,q.title_ar,q.pass_mark,COALESCE(x.cnt,0)::int AS question_count
     FROM quizzes q LEFT JOIN (SELECT quiz_id, count(*) AS cnt FROM quiz_questions GROUP BY quiz_id) x ON x.quiz_id=q.id
     WHERE q.course_id=$1 ORDER BY q.kind, q.title_en`, [id]);
  const resources = await query("SELECT id,title_en,title_ar,kind FROM resources WHERE course_id=$1 ORDER BY title_en", [id]);
  return {
    course: { ...card, ...extra },
    chapters: chapters.map((c) => ({ ...c, lessons: lessons.filter((l) => l.chapter_id === c.id) })),
    models, quizzes, resources,
  };
}

export interface LessonFull {
  id: string; course_id: string; chapter_id: string; position: number; title_en: string; title_ar: string | null;
  body_en: string; body_ar: string | null; duration_min: number; is_free_preview: boolean; tier: Tier;
  spec_status: "generic" | "model_specific"; video_key: string | null; flow: FlowStep[] | null; diagram: DiagramDef | null;
}
export interface FlowStep { title: string; title_ar?: string; detail?: string; detail_ar?: string; decision?: boolean; holdpoint?: boolean }
export interface DiagramDef {
  kind: string; verified: boolean; caption_en: string; caption_ar?: string;
  hotspots: { id: string; x: number; y: number; label_en: string; label_ar?: string; detail_en: string; detail_ar?: string }[];
}

export async function getLesson(id: string): Promise<LessonFull | null> {
  return queryOne<LessonFull>("SELECT * FROM lessons WHERE id=$1", [id]);
}

export async function getLessonSpecs(lessonId: string): Promise<SpecDisplay[]> {
  const rows = await query(
    `SELECT s.label,s.value,s.unit,s.condition_note,s.verified,s.page_ref,
            m.model_number, COALESCE(m.verified,false) AS model_verified,
            t.title AS source_title, t.revision AS source_revision, COALESCE(t.approved,false) AS source_approved
     FROM lesson_specs s
     LEFT JOIN equipment_models m ON m.id=s.model_id
     LEFT JOIN technical_sources t ON t.id=s.source_id
     WHERE s.lesson_id=$1 ORDER BY s.label`, [lessonId]);
  return rows.map(evaluateSpec);
}

export const getLessonSources = (lessonId: string) =>
  query<{ title: string; revision: string | null; reference: string | null; approved: boolean; page_ref: string | null; doc_type: string }>(
    `SELECT t.title,t.revision,t.reference,t.approved,t.doc_type,ls.page_ref FROM lesson_sources ls JOIN technical_sources t ON t.id=ls.source_id WHERE ls.lesson_id=$1`, [lessonId]);

export const getLessonSubtitles = (lessonId: string) =>
  query<{ lang: "en" | "ar"; storage_key: string }>("SELECT lang,storage_key FROM lesson_subtitles WHERE lesson_id=$1", [lessonId]);

/** Courses + model search results for the unified search page. */
export const searchModels = (q: string) =>
  query<{ id: string; category: string; series: string | null; model_number: string; is_placeholder: boolean; verified: boolean }>(
    `SELECT id,category,series,model_number,is_placeholder,verified FROM equipment_models WHERE model_number ILIKE $1 OR series ILIKE $1 ORDER BY model_number LIMIT 20`,
    [`%${q.replace(/[%_\\]/g, "\\$&")}%`]);

export const pick = <T extends Record<string, any>>(row: T, field: string, locale: "en" | "ar"): string =>
  (locale === "ar" && row[`${field}_ar`]) || row[`${field}_en`] || "";
export const hasArabic = <T extends Record<string, any>>(row: T, field: string) => !!row[`${field}_ar`];
