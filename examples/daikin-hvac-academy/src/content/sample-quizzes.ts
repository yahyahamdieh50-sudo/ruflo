export interface SampleQuestion { q: string; options: string[]; correct: number; why: string }
export interface SampleQuiz { kind: "lesson" | "final"; afterLesson?: string; title_en: string; title_ar: string; passMark: number; questions: SampleQuestion[] }

export const SAMPLE_QUIZZES: SampleQuiz[] = [
  {
    kind: "lesson", afterLesson: "readiness", title_en: "Knowledge check 1: Delivery and site readiness", title_ar: "اختبار معرفة 1: التسليم وجاهزية الموقع", passMark: 75,
    questions: [
      { q: "On delivery, what should the equipment nameplate be compared against first?", options: ["A brochure from a previous project", "The approved submittal for the exact model", "A verbal confirmation from the driver", "The invoice only"], correct: 1, why: "The approved submittal defines what was accepted for this project." },
      { q: "You find visible transit damage on a delivered chiller. What is the correct first action?", options: ["Install it and report later", "Repair it quietly on site", "Photograph, record on the delivery/MIR report and notify before accepting or installing", "Discard the packaging and continue"], correct: 2, why: "Document and notify before acceptance so liability and corrective action are clear." },
      { q: "A 'hold point' in an ITP means…", options: ["Work may continue while the inspector is informed", "Work must stop until the inspection is signed off", "The item is optional", "Only documents are reviewed"], correct: 1, why: "Hold points require sign-off before proceeding." },
      { q: "While stored on a dusty site, a chiller's coils should be…", options: ["Left fully exposed for ventilation", "Covered against dust and debris while allowing ventilation", "Washed daily with high-pressure water", "Sealed airtight with plastic"], correct: 1, why: "Protect coils from debris and avoid trapping moisture." },
    ],
  },
  {
    kind: "lesson", afterLesson: "clearances", title_en: "Knowledge check 2: Lifting, positioning and clearances", title_ar: "اختبار معرفة 2: الرفع والتموضع والمسافات", passMark: 75,
    questions: [
      { q: "Where should lifting points and sling arrangement come from?", options: ["The rigger's experience alone", "The manufacturer's rigging instructions / approved submittal", "Any strong-looking pipe connection", "The nearest panel edge"], correct: 1, why: "Never lift from pipework, headers or panels; use specified points." },
      { q: "Why do clearances matter for an air-cooled chiller in high ambient temperatures?", options: ["They only affect appearance", "Restricted airflow causes recirculation, raising condensing temperature and risking high-pressure trips", "They reduce water flow", "They only matter for noise"], correct: 1, why: "Recirculation reduces capacity and can trip the unit." },
      { q: "When must shipping restraints be removed?", options: ["Always before the lift", "As instructed by the manufacturer's manual", "Never", "After the first start"], correct: 1, why: "The manual defines when and how restraints are removed." },
      { q: "Which document governs a clearance value if a generic course differs from the model manual?", options: ["The generic course", "The approved manual / submittal for the exact model", "A colleague's recollection", "An online forum"], correct: 1, why: "Model-specific requirements always come from verified manufacturer documents." },
    ],
  },
  {
    kind: "lesson", afterLesson: "electrical", title_en: "Knowledge check 3: Piping, electrical and safety", title_ar: "اختبار معرفة 3: المواسير والكهرباء والسلامة", passMark: 75,
    questions: [
      { q: "Where should the strainer be located relative to the evaporator?", options: ["Downstream of the evaporator", "Upstream, protecting the evaporator, with space to clean it", "Anywhere in the building", "It is unnecessary on new pipework"], correct: 1, why: "New pipework carries debris that can damage the heat exchanger." },
      { q: "Before connecting new chilled-water pipework to the chiller you should…", options: ["Fill it immediately", "Flush and clean the pipework with the chiller isolated or bypassed", "Pressurise with the chiller open", "Skip flushing if the pipes look clean"], correct: 1, why: "Flush with the unit protected to prevent contamination." },
      { q: "Before first energisation of the compressors, an electrician should verify…", options: ["Nothing; the factory handles it", "Phase sequence/rotation and supply data against the nameplate", "Only the paint colour of cables", "Only the BMS graphics"], correct: 1, why: "Incorrect phase sequence can damage some compressor types." },
      { q: "Who may open or charge the refrigerant circuit?", options: ["Any site worker", "Only appropriately qualified and authorised persons following the manufacturer's and local requirements", "The main contractor's driver", "Anyone with a gauge set"], correct: 1, why: "Refrigerant handling is a regulated, hazardous activity." },
    ],
  },
  {
    kind: "final", title_en: "Final assessment: Air-cooled chiller installation (sample)", title_ar: "التقييم النهائي: تركيب الشيلر المبرّد بالهواء (نموذجي)", passMark: 80,
    questions: [
      { q: "Which document set must be on site before work starts?", options: ["Only the brochure", "Approved submittal, approved drawings and the manufacturer's manual for the exact model", "Only the BOQ", "Photos of a similar project"], correct: 1, why: "Approved, revision-controlled documents define the work." },
      { q: "A drawing, submittal and manual disagree. What should you do?", options: ["Choose the one you prefer", "Raise an RFI and obtain written clarification before proceeding", "Follow the cheapest option", "Ignore the manual"], correct: 1, why: "Resolve conflicts formally before installation." },
      { q: "What is the purpose of lock-out/tag-out?", options: ["To mark equipment for sale", "To ensure energy sources are isolated and cannot be restored while people work", "To speed up commissioning", "To label cables"], correct: 1, why: "LOTO protects people from unexpected energisation." },
      { q: "Pipework weight should be carried by…", options: ["The chiller connections", "Independent pipe supports", "The control panel", "The condenser coil"], correct: 1, why: "Chiller connections must not carry pipe loads." },
      { q: "Which is a typical consequence of skipping the strainer or flushing?", options: ["Better efficiency", "Evaporator fouling or damage", "Lower noise", "Higher airflow"], correct: 1, why: "Debris damages the heat exchanger and restricts flow." },
      { q: "Pre-commissioning checks are…", options: ["A replacement for commissioning", "Verification that the installation is ready for authorised commissioning", "Optional paperwork", "Only for water systems"], correct: 1, why: "They support, but do not replace, formal commissioning." },
      { q: "A chiller will not start. What should be checked first?", options: ["Bypass the flow switch", "Alarms, power/phase, pump status and flow proving, remote enable and interlocks", "Replace the compressor", "Add refrigerant"], correct: 1, why: "Permissives and interlocks are the most common cause." },
      { q: "How should alarm codes be interpreted?", options: ["From memory", "From the manual for the exact model and controller", "From another brand's list", "Codes can be ignored"], correct: 1, why: "Codes differ by model and software version." },
      { q: "A certificate from this academy represents…", options: ["Official manufacturer certification", "Completion of an independent academy course; not a manufacturer certification", "Authorisation to charge refrigerant", "A government licence"], correct: 1, why: "The platform is independent and not affiliated with manufacturers." },
      { q: "Insulation-resistance testing should be performed…", options: ["With any test voltage you have", "Using the method and limits in the manual, protecting electronic components", "Only after energising", "Never"], correct: 1, why: "Wrong test methods can damage electronics; use the manual." },
    ],
  },
];
