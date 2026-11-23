import { query, queryOne, uuid } from "./db";
import { hashPassword } from "./auth-core";
import { ensureDefaultPlans } from "./plans";
import { CATEGORIES } from "./categories";
import { STANDARD_CHAPTERS, COMING_SOON_LEVEL } from "../content/standard-chapters";
import { SAMPLE_CHAPTERS, SAMPLE_RESOURCES, SAMPLE_SLUG } from "../content/sample-course";
import { SAMPLE_QUIZZES } from "../content/sample-quizzes";

export interface SeedOptions { adminEmail?: string; adminPassword?: string; demoUsers?: boolean }

/** Idempotent. Seeds plans, sample course, coming-soon syllabi, placeholder model and optional users. */
export async function seedAll(o: SeedOptions = {}) {
  await ensureDefaultPlans();
  await query("INSERT INTO settings (key,value) VALUES ('grace_days','3') ON CONFLICT (key) DO NOTHING");

  let adminId: string | null = null;
  if (o.adminEmail && o.adminPassword) {
    const e = o.adminEmail.toLowerCase();
    const ex = await queryOne<{ id: string }>("SELECT id FROM users WHERE email=$1", [e]);
    adminId = ex?.id ?? uuid();
    if (!ex) await query("INSERT INTO users (id,email,password_hash,name,role,email_verified_at) VALUES ($1,$2,$3,'Academy Admin','admin',now())", [adminId, e, await hashPassword(o.adminPassword)]);
  }
  if (o.demoUsers) {
    const pw = await hashPassword("DemoPass-12345");
    const demo: [string, string, string, string | null, string][] = [
      ["free@demo.test", "Demo Free Student", "student", null, "free"],
      ["basic@demo.test", "Demo Basic Student", "student", "basic", "basic"],
      ["pro@demo.test", "Demo Pro Student", "student", "pro", "pro"],
      ["instructor@demo.test", "Demo Instructor", "instructor", null, "instructor"],
    ];
    for (const [email, name, role, comp] of demo) {
      await query("INSERT INTO users (id,email,password_hash,name,role,comp_plan,email_verified_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (email) DO NOTHING",
        [uuid(), email, pw, name, role, comp]);
    }
  }

  // Placeholder model + source (clearly labelled; admins add real, verified ones).
  let modelId = (await queryOne<{ id: string }>("SELECT id FROM equipment_models WHERE model_number='SAMPLE-MODEL-A'"))?.id;
  if (!modelId) {
    modelId = uuid();
    await query("INSERT INTO equipment_models (id,category,series,model_number,refrigerant,is_placeholder,verified) VALUES ($1,'air-cooled-chillers','Placeholder series',$2,NULL,true,false)", [modelId, "SAMPLE-MODEL-A"]);
  }

  // Sample course
  let courseId = (await queryOne<{ id: string }>("SELECT id FROM courses WHERE slug=$1", [SAMPLE_SLUG]))?.id;
  if (!courseId) {
    courseId = uuid();
    await query(
      `INSERT INTO courses (id,slug,category,title_en,title_ar,summary_en,summary_ar,level,tier,status,is_sample,author_id)
       VALUES ($1,$2,'air-cooled-chillers',$3,$4,$5,$6,'beginner','basic','published',true,$7)`,
      [courseId, SAMPLE_SLUG,
        "Air-Cooled Chiller Installation: Site Readiness to Pre-Commissioning (Sample Course)",
        "تركيب الشيلر المبرّد بالهواء: من جاهزية الموقع إلى ما قبل التشغيل (دورة نموذجية)",
        "A fully working sample course covering delivery inspection, lifting, positioning, piping, electrical coordination, QC hold points, pre-commissioning readiness and safe troubleshooting. Generic educational content — no model-specific Daikin values.",
        "دورة نموذجية متكاملة تغطي فحص التسليم والرفع والتموضع والمواسير والتنسيق الكهربائي ونقاط الفحص وجاهزية ما قبل التشغيل واستكشاف الأعطال بأمان. محتوى تعليمي عام دون قيم خاصة بطرازات Daikin.",
        adminId]);
    await query("INSERT INTO course_models (course_id,model_id) VALUES ($1,$2)", [courseId, modelId]);

    const lessonIds: Record<string, string> = {};
    let pos = 0;
    for (const [ci, ch] of SAMPLE_CHAPTERS.entries()) {
      const chId = uuid();
      await query("INSERT INTO chapters (id,course_id,position,title_en,title_ar) VALUES ($1,$2,$3,$4,$5)", [chId, courseId, ci + 1, ch.title_en, ch.title_ar]);
      for (const l of ch.lessons) {
        const id = uuid(); lessonIds[l.key] = id;
        await query(
          `INSERT INTO lessons (id,course_id,chapter_id,position,title_en,title_ar,body_en,body_ar,duration_min,is_free_preview,tier,flow,diagram)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [id, courseId, chId, ++pos, l.title_en, l.title_ar, l.body_en, l.body_ar ?? null, l.duration, !!l.preview, l.tier ?? "basic",
            l.flow ? JSON.stringify(l.flow) : null, l.diagram ? JSON.stringify(l.diagram) : null]);
        for (const s of l.specs ?? []) {
          // Intentionally unverified & value-less: renders as "withheld until confirmed from the approved manual".
          await query("INSERT INTO lesson_specs (id,lesson_id,label,condition_note,model_id,verified) VALUES ($1,$2,$3,$4,$5,false)", [uuid(), id, s.label, s.condition ?? null, modelId]);
        }
      }
    }
    for (const qz of SAMPLE_QUIZZES) {
      const qid = uuid();
      await query("INSERT INTO quizzes (id,course_id,lesson_id,kind,title_en,title_ar,pass_mark) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [qid, courseId, qz.afterLesson ? lessonIds[qz.afterLesson] : null, qz.kind, qz.title_en, qz.title_ar, qz.passMark]);
      for (const [i, q] of qz.questions.entries()) {
        await query("INSERT INTO quiz_questions (id,quiz_id,position,prompt_en,options_en,correct_index,explanation_en) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [uuid(), qid, i + 1, q.q, JSON.stringify(q.options), q.correct, q.why]);
      }
    }
    for (const r of SAMPLE_RESOURCES) {
      await query("INSERT INTO resources (id,course_id,title_en,title_ar,kind,inline_markdown) VALUES ($1,$2,$3,$4,$5,$6)", [uuid(), courseId, r.title_en, r.title_ar, r.kind, r.md]);
    }
  }

  // Remaining categories: public syllabus only (no lessons) → "coming soon".
  for (const c of CATEGORIES) {
    const slug = `${c.slug}-course`;
    if (c.slug === "air-cooled-chillers" || (await queryOne("SELECT id FROM courses WHERE slug=$1", [slug]))) continue;
    const id = uuid();
    await query(
      `INSERT INTO courses (id,slug,category,title_en,title_ar,summary_en,summary_ar,level,tier,status,is_sample)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pro','coming_soon',true)`,
      [id, slug, c.slug, `${c.en}: Installation Course`, `${c.ar}: دورة التركيب`, c.blurb_en, c.blurb_ar, COMING_SOON_LEVEL[c.slug] ?? "intermediate"]);
    for (const [i, s] of STANDARD_CHAPTERS.entries()) {
      await query("INSERT INTO chapters (id,course_id,position,title_en,title_ar) VALUES ($1,$2,$3,$4,$5)", [uuid(), id, i + 1, s.en, s.ar]);
    }
  }
}
