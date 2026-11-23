/** The standard 13-part course structure used for every equipment course. */
export const STANDARD_CHAPTERS: { en: string; ar: string }[] = [
  { en: "Introduction and system components", ar: "مقدمة ومكونات النظام" },
  { en: "Reading approved drawings and technical submittals", ar: "قراءة المخططات المعتمدة والمستندات الفنية" },
  { en: "Pre-installation inspection and site readiness", ar: "الفحص قبل التركيب وجاهزية الموقع" },
  { en: "Tools, manpower, PPE and lifting requirements", ar: "الأدوات والقوى العاملة ومعدات الوقاية والرفع" },
  { en: "Foundation, positioning and clearance checks", ar: "الأساسات والتموضع وفحص المسافات الحرة" },
  { en: "Equipment installation sequence", ar: "تسلسل تركيب المعدة" },
  { en: "Mechanical piping, refrigerant or duct connections", ar: "التوصيلات الميكانيكية: المواسير أو غاز التبريد أو مجاري الهواء" },
  { en: "Electrical and controls coordination", ar: "التنسيق الكهربائي والتحكم" },
  { en: "Inspection and quality-control checkpoints", ar: "نقاط الفحص وضبط الجودة" },
  { en: "Pre-commissioning tests and records", ar: "اختبارات وسجلات ما قبل التشغيل" },
  { en: "Common installation mistakes", ar: "أخطاء التركيب الشائعة" },
  { en: "Safe troubleshooting basics", ar: "أساسيات استكشاف الأعطال بأمان" },
  { en: "Knowledge checks and final assessment", ar: "اختبارات المعرفة والتقييم النهائي" },
];

export const COMING_SOON_LEVEL: Record<string, "beginner" | "intermediate" | "advanced"> = {
  "air-cooled-chillers": "intermediate", "water-cooled-chillers": "advanced", "vrv-vrf": "intermediate", ahu: "intermediate",
  fahu: "intermediate", fcu: "beginner", "dx-split": "beginner", "packaged-ac": "intermediate",
  "controls-bms": "advanced", "chilled-water-systems": "intermediate",
};
