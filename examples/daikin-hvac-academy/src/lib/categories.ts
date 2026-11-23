export interface Category { slug: string; en: string; ar: string; blurb_en: string; blurb_ar: string }

export const CATEGORIES: Category[] = [
  { slug: "air-cooled-chillers", en: "Air-Cooled Chillers", ar: "الشيلرات المبرّدة بالهواء", blurb_en: "Rooftop and ground-mounted chiller installation, clearances and pre-commissioning.", blurb_ar: "تركيب الشيلرات على الأسطح أو الأرض، والمسافات الحرة، والتحقق قبل التشغيل." },
  { slug: "water-cooled-chillers", en: "Water-Cooled Chillers", ar: "الشيلرات المبرّدة بالماء", blurb_en: "Plant-room rigging, condenser water connections and readiness checks.", blurb_ar: "رفع وتمركز الشيلرات في غرف المحطات، ووصلات مياه المكثف، وفحوصات الجاهزية." },
  { slug: "vrv-vrf", en: "VRV / VRF Systems", ar: "أنظمة VRV / VRF", blurb_en: "Refrigerant piping, branch selection, nitrogen testing and vacuum practice.", blurb_ar: "مواسير الغاز، ووصلات التفريع، واختبار النيتروجين، وممارسات التفريغ." },
  { slug: "ahu", en: "Air Handling Units (AHU)", ar: "وحدات مناولة الهواء (AHU)", blurb_en: "Section assembly, coil connections, drainage and duct interfaces.", blurb_ar: "تجميع الأقسام، ووصلات الملفات، والتصريف، وواجهات مجاري الهواء." },
  { slug: "fahu", en: "Fresh Air Handling Units (FAHU)", ar: "وحدات الهواء النقي (FAHU)", blurb_en: "Outdoor-air units, energy recovery interfaces and filtration in dusty climates.", blurb_ar: "وحدات الهواء الخارجي، وواجهات استرجاع الطاقة، والترشيح في الأجواء المغبرة." },
  { slug: "fcu", en: "Fan Coil Units (FCU)", ar: "وحدات ملف المروحة (FCU)", blurb_en: "Ceiling and floor-standing FCU installation, condensate and controls.", blurb_ar: "تركيب وحدات FCU السقفية والأرضية، والتكثيف، والتحكم." },
  { slug: "dx-split", en: "DX & Split AC Systems", ar: "أنظمة DX والسبليت", blurb_en: "Split and ducted DX installation, flaring/brazing practice and testing.", blurb_ar: "تركيب أنظمة السبليت والدكت DX، وممارسات اللحام والفلير، والاختبار." },
  { slug: "packaged-ac", en: "Packaged AC Units", ar: "وحدات التكييف المتكاملة", blurb_en: "Rooftop packaged unit placement, curbs, ducting and electrical.", blurb_ar: "وضع الوحدات المتكاملة على الأسطح، والقواعد، والمجاري، والكهرباء." },
  { slug: "controls-bms", en: "HVAC Controls & BMS Interfaces", ar: "أنظمة التحكم وواجهات BMS", blurb_en: "Controller wiring, communication interfaces and integration test planning.", blurb_ar: "توصيل المتحكمات، وواجهات الاتصال، وتخطيط اختبارات التكامل." },
  { slug: "chilled-water-systems", en: "Chilled Water System Installation", ar: "تركيب أنظمة المياه المثلجة", blurb_en: "Pipework, pumps, flushing, strainers, balancing readiness and insulation.", blurb_ar: "شبكات المواسير، والمضخات، والتنظيف، والمصافي، وجاهزية الموازنة، والعزل." },
];

export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
