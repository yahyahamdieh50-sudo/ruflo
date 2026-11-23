import type { DiagramDef, FlowStep } from "../lib/courses";

export interface SampleSpec { label: string; condition?: string }
export interface SampleLesson {
  key: string; title_en: string; title_ar: string; body_en: string; body_ar?: string; duration: number;
  preview?: boolean; tier?: "basic" | "pro"; flow?: FlowStep[]; diagram?: DiagramDef; specs?: SampleSpec[];
}
export interface SampleChapter { title_en: string; title_ar: string; lessons: SampleLesson[] }

export const SAMPLE_SLUG = "air-cooled-chiller-installation-sample";

const NOTE = `> **Generic educational guidance.** Model-specific values (torque, pressure, charge, clearances, wiring, commissioning thresholds) are never shown here unless confirmed from the approved manual for your exact model. Always follow the manufacturer's installation manual and the approved submittal.`;

export const SAMPLE_CHAPTERS: SampleChapter[] = [
  {
    title_en: "Introduction and system components", title_ar: "مقدمة ومكونات النظام",
    lessons: [
      {
        key: "intro", title_en: "Course introduction: how an air-cooled chiller works", title_ar: "مقدمة الدورة: كيف يعمل الشيلر المبرّد بالهواء",
        duration: 12, preview: true,
        body_en: `${NOTE}

## What you will learn
This sample course walks an installation team from **site readiness** to **pre-commissioning readiness** for an air-cooled water chiller. It is written for technicians, site engineers and contractors working in the UAE and internationally.

## Main components (generic)
- **Compressors** – circulate and pressurise refrigerant.
- **Air-cooled condenser coils and fans** – reject heat to outdoor air; performance falls when ambient is high or airflow is restricted.
- **Evaporator (water heat exchanger)** – cools the chilled-water loop.
- **Expansion device** – controls refrigerant flow to the evaporator.
- **Control panel and starters** – safeties, sequencing and communications.
- **Chilled-water connections** – inlet/outlet, drain and vent points.

## The basic cycle
Refrigerant absorbs heat from chilled water in the evaporator, is compressed, rejects that heat to outdoor air in the condenser, then expands and repeats.

## How to use this course
1. Read each lesson, then open the **Model-specific values** panel if present.
2. Treat anything marked *withheld* as **unknown until you read the approved manual for your exact model**.
3. Complete the lesson quizzes and the final assessment (Pro plan) to earn an academy completion certificate.

Hazardous work (electrical, lifting, refrigerant) must only be done by qualified, authorised people under the correct permits and isolation.`,
        body_ar: `> **إرشادات تعليمية عامة.** لا تُعرض القيم الخاصة بطراز معيّن (عزم الربط، الضغط، شحنة الغاز، المسافات الحرة، التوصيلات الكهربائية، حدود التشغيل) إلا بعد التحقق منها من الدليل المعتمد للطراز المحدد. اتبع دائماً دليل التركيب من الشركة المصنعة والمستند الفني المعتمد.

## ماذا ستتعلم
تُرشد هذه الدورة النموذجية فريق التركيب من **جاهزية الموقع** حتى **الجاهزية لما قبل التشغيل** لشيلر مبرّد بالهواء، وهي موجّهة للفنيين ومهندسي المواقع والمقاولين في الإمارات وخارجها.

## المكونات الرئيسية (عام)
- **الضواغط** – تدوّر غاز التبريد وترفع ضغطه.
- **ملفات المكثف والمراوح** – تطرح الحرارة إلى الهواء الخارجي، ويقل الأداء عند ارتفاع الحرارة أو تقييد تدفق الهواء.
- **المبخّر (مبادل الماء)** – يبرّد دارة المياه المثلجة.
- **صمام التمدد** – ينظّم تدفق الغاز إلى المبخّر.
- **لوحة التحكم والمشغّلات** – الحماية والتسلسل والاتصالات.
- **وصلات المياه المثلجة** – الدخول والخروج والتصريف والتنفيس.

يجب أن يقوم بالأعمال الخطرة (الكهرباء، الرفع، غاز التبريد) أشخاص مؤهلون ومخوّلون فقط، مع التصاريح والعزل المناسبين.`,
        diagram: {
          kind: "air-cooled-chiller", verified: false,
          caption_en: "Generic schematic of an air-cooled chiller. Not model-specific; component layout varies by model.",
          caption_ar: "مخطط عام لشيلر مبرّد بالهواء. غير خاص بطراز معيّن؛ يختلف ترتيب المكونات حسب الطراز.",
          hotspots: [
            { id: "fans", x: 28, y: 22, label_en: "Condenser fans", label_ar: "مراوح المكثف", detail_en: "Draw outdoor air across the condenser coils. Blocked or recirculating airflow raises condensing temperature.", detail_ar: "تسحب الهواء الخارجي عبر ملفات المكثف. تؤدي إعاقة التدفق أو إعادة تدوير الهواء إلى ارتفاع درجة حرارة التكثيف." },
            { id: "coils", x: 74, y: 36, label_en: "Condenser coils", label_ar: "ملفات المكثف", detail_en: "Reject heat to outdoor air. Keep clean; dust and debris are a major issue in the Gulf climate.", detail_ar: "تطرح الحرارة إلى الهواء الخارجي. يجب إبقاؤها نظيفة؛ فالغبار من أبرز المشاكل في مناخ الخليج." },
            { id: "compressors", x: 35, y: 57, label_en: "Compressors", label_ar: "الضواغط", detail_en: "Compress the refrigerant. Protected by electrical and pressure safeties; never bypass them.", detail_ar: "تضغط غاز التبريد. محمية بأجهزة حماية كهربائية وضغطية؛ لا تتجاوزها أبداً." },
            { id: "evaporator", x: 65, y: 66, label_en: "Evaporator", label_ar: "المبخّر", detail_en: "Water-to-refrigerant heat exchanger. Needs a strainer upstream and proven water flow.", detail_ar: "مبادل حراري بين الماء وغاز التبريد. يحتاج إلى مصفاة قبله وتدفق ماء مؤكد." },
            { id: "panel", x: 13, y: 55, label_en: "Control panel", label_ar: "لوحة التحكم", detail_en: "Power entry, starters, controller and safeties. Isolate and lock out before opening.", detail_ar: "مدخل القدرة والمشغّلات والمتحكم وأجهزة الحماية. اعزل وأقفل قبل الفتح." },
            { id: "water", x: 92, y: 68, label_en: "Chilled-water connections", label_ar: "وصلات المياه المثلجة", detail_en: "Inlet and outlet to the chilled-water loop; pipework must be supported independently.", detail_ar: "دخول وخروج دارة المياه المثلجة؛ يجب دعم المواسير بشكل مستقل." },
          ],
        },
      },
      {
        key: "plant", title_en: "The chilled-water plant around the chiller", title_ar: "منظومة المياه المثلجة المحيطة بالشيلر",
        duration: 10,
        body_en: `${NOTE}

## Where the chiller sits in the system
An air-cooled chiller is one part of a chilled-water plant. Understand its neighbours before you install it:

- **Pumps** – circulate water; their status is normally interlocked with the chiller.
- **Strainers** – protect the evaporator from debris.
- **Isolation, balancing and check valves** – allow service and control flow.
- **Expansion / buffer volume** – stabilises the loop and accommodates thermal expansion.
- **Air vents and drains** – needed at high and low points.
- **BMS / controls** – start/stop, alarms and monitoring points.

## Why this matters for installers
Most "chiller faults" in the first weeks of operation trace back to the plant: debris, trapped air, low flow, or missing interlocks. Knowing the whole loop lets you inspect the interfaces, not just the machine.`,
      },
    ],
  },
  {
    title_en: "Reading approved drawings and technical submittals", title_ar: "قراءة المخططات المعتمدة والمستندات الفنية",
    lessons: [{
      key: "drawings", title_en: "Reading approved drawings and technical submittals", title_ar: "قراءة المخططات المعتمدة والمستندات الفنية", duration: 12,
      body_en: `${NOTE}

## Documents you must have on site
1. **Approved material submittal** for the exact model (status: approved or approved-as-noted).
2. **Approved shop / general-arrangement drawings** showing position, supports and service space.
3. **Piping schematic** and equipment connection details.
4. **Electrical single-line, wiring and controls diagrams**.
5. **Manufacturer installation, operation and maintenance manual** for the exact model and revision.

## What to extract before work starts
- Exact model designation and revision of each document.
- Shipping/operating weight, dimensions and lifting arrangement.
- Connection locations and sizes.
- Required service and airflow clearances.
- Electrical data from the nameplate/manual.

> Always read these from the approved submittal and manual — never from memory, brochures or a previous project.

## Good practice
- Mark up drawings with *as-found* observations and raise an **RFI** if the drawing, submittal and manual disagree.
- Check the drawing revision on the sheet title block before every lift or pour.`,
      specs: [{ label: "Operating and shipping weight" }, { label: "Overall dimensions" }, { label: "Lifting point arrangement" }],
    }],
  },
  {
    title_en: "Pre-installation inspection and site readiness", title_ar: "الفحص قبل التركيب وجاهزية الموقع",
    lessons: [
      {
        key: "delivery", title_en: "Delivery inspection and storage", title_ar: "فحص التسليم والتخزين", duration: 10,
        body_en: `${NOTE}

## On arrival
1. Compare the **nameplate** with the approved submittal (model, serial, electrical data, refrigerant).
2. Inspect for **transit damage**: dents, oil marks, bent fins, damaged panels, loose parts, shock/tilt indicators if fitted.
3. Check the packing list for **shortages** (loose items, vibration mounts, accessories).
4. **Photograph** everything and record it on the Material Inspection Request (MIR) / delivery report.
5. Notify the supplier and the main contractor **before accepting** a damaged item.

## Storage on a hot, dusty site
- Keep units upright and supported as shipped.
- Cover coils and openings to keep out dust and debris, while allowing ventilation.
- Protect electrical panels from moisture and condensation.
- Do not remove shipping covers or restraints until the manual says to.`,
      },
      {
        key: "readiness", title_en: "Site readiness checklist", title_ar: "قائمة فحص جاهزية الموقع", duration: 12,
        body_en: `${NOTE}

## Confirm before the unit is lifted
- **Structure** – slab, curb or steelwork approved for the loads by the structural engineer.
- **Access** – delivery route, crane position, lifting radius, exclusion zone and road/rooftop permissions.
- **Services** – power available and isolated, chilled-water connection points defined, drain provision.
- **Space** – clearances confirmed against adjacent plant, walls and screens.
- **Permits** – lifting permit, work-at-height, hot work (if any), and the main contractor's / authority's requirements.
- **Climate planning** – summer working-hour restrictions and heat-stress controls; confirm current rules with the relevant authority and your HSE team.

## Document it
Complete a **site readiness record** signed by the main contractor and consultant where required. Treat it as a **hold point**: no lift until it is signed.`,
      },
    ],
  },
  {
    title_en: "Tools, manpower, PPE and lifting requirements", title_ar: "الأدوات والقوى العاملة ومعدات الوقاية والرفع",
    lessons: [{
      key: "lifting", title_en: "Lifting plan, rigging and PPE", title_ar: "خطة الرفع والتعليق ومعدات الوقاية", duration: 14,
      body_en: `${NOTE}

## Roles
- **Lifting supervisor / appointed person** – owns the lift plan.
- **Crane operator, rigger and signaller** – certified and competent.
- **Installation lead** – verifies the unit, lifting points and landing position.

## Lift plan essentials
1. Unit weight and centre of gravity from the **approved submittal / manufacturer's rigging instructions**.
2. Crane capacity checked against the **load chart** at the working radius, with ground-bearing and outrigger arrangements.
3. Lifting points, spreader bars and slings as specified by the manufacturer. **Never lift from pipe connections, coil headers or panels.**
4. Exclusion zone, tag lines, communication method and weather limits.
5. Emergency and abort plan.

## Minimum PPE (site rules prevail)
Safety helmet, safety footwear, high-visibility clothing, gloves, eye protection, hearing protection where needed, and fall protection for work at height. Add heat-stress controls for UAE summer conditions.

**Hold point:** the lift plan and permit must be approved before the lift.`,
      specs: [{ label: "Lifting point locations and sling angle", condition: "Per manufacturer's rigging instructions" }, { label: "Unit centre of gravity" }],
    }],
  },
  {
    title_en: "Foundation, positioning and clearance checks", title_ar: "الأساسات والتموضع وفحص المسافات الحرة",
    lessons: [
      {
        key: "foundation", title_en: "Foundation, vibration isolation and positioning", title_ar: "الأساس وعزل الاهتزاز والتموضع", duration: 12,
        body_en: `${NOTE}

## Checks before landing the unit
- Supports or slab are **level and flat** within the manufacturer's tolerance.
- Support layout matches the **approved drawing** and the unit's mounting points.
- **Vibration isolators** match the approved selection and are installed in the correct positions.
- Rainwater and condensate can drain away; the unit will not sit in standing water.

## Positioning
- Land the unit slowly, guided by tag lines, onto the isolators.
- Confirm orientation: service side, panel access, water connections and airflow direction.
- Re-check level after landing and after piping is connected.
- Remove shipping restraints **only as instructed by the manual** (e.g. before start-up, not before the lift).`,
        specs: [{ label: "Mounting hole pattern and fixing size" }, { label: "Permitted levelness tolerance" }, { label: "Vibration isolator type and load per mount" }],
      },
      {
        key: "clearances", title_en: "Clearances, airflow and hot-air recirculation", title_ar: "المسافات الحرة وتدفق الهواء وإعادة تدوير الهواء الساخن", duration: 10,
        body_en: `${NOTE}

## Why clearances matter
Air-cooled units need a free supply of outdoor air **and** space to discharge it. If hot discharge air is drawn back into the coils (**recirculation**), condensing temperature rises, capacity drops and high-pressure trips become more likely — especially at peak UAE ambient temperatures.

## What to check
- Distance to walls, screens, louvres and neighbouring units against the **approved clearance values**.
- Discharge direction and any obstruction above the fans.
- Wind direction and prevailing hot-air paths on rooftops.
- Space to open the control panel, remove compressors and clean coils.

## Practical tips
- Decorative screens must be free-area approved by the consultant and manufacturer.
- Do not let other trades block service space with pipes, trays or stored materials.`,
        specs: [{ label: "Minimum clearance — each side and above" }, { label: "Maximum permitted screen/louvre obstruction" }],
      },
    ],
  },
  {
    title_en: "Equipment installation sequence", title_ar: "تسلسل تركيب المعدة",
    lessons: [{
      key: "sequence", title_en: "Installation sequence overview", title_ar: "نظرة عامة على تسلسل التركيب", duration: 10,
      body_en: `${NOTE}

Use the flowchart below as a **generic** sequence. Your manufacturer's manual and project ITP take precedence. Steps marked **HOLD** require sign-off before continuing.`,
      flow: [
        { title: "Verify approvals", detail: "Submittal, drawings and manual are the approved revisions." },
        { title: "Inspect delivery", detail: "Nameplate, damage and shortages recorded on MIR." },
        { title: "Site readiness signed off?", detail: "Structure, access, power, permits.", decision: true, holdpoint: true },
        { title: "Approved lift plan and permit", detail: "Competent crew; exclusion zone.", holdpoint: true },
        { title: "Lift and land on isolators", detail: "Slow, guided; do not lift from pipework." },
        { title: "Level, align, check clearances" },
        { title: "Remove restraints per manual" },
        { title: "Connect water piping", detail: "Independent supports; flushed system; strainer fitted." },
        { title: "Electrical termination and controls", detail: "Qualified electrician; LOTO; phase check." },
        { title: "Installation inspection", detail: "Inspection request to consultant / main contractor.", holdpoint: true },
        { title: "Pre-commissioning checks and records" },
      ],
    }],
  },
  {
    title_en: "Mechanical connections: chilled-water piping", title_ar: "التوصيلات الميكانيكية: مواسير المياه المثلجة",
    lessons: [
      {
        key: "piping", title_en: "Chilled-water connections, strainers and supports", title_ar: "وصلات المياه المثلجة والمصافي والدعامات", duration: 12,
        body_en: `${NOTE}

## Connection practice
- Pipework is carried by **its own supports**; chiller connections must never carry pipe weight or thermal movement.
- Fit **flexible connectors** only if shown on the approved drawing, and install them as specified.
- Fit a **strainer** upstream of the evaporator, with room to remove and clean the basket.
- Provide **isolation valves**, **vents** at high points and **drains** at low points.
- Install the **flow switch** and sensors where the manual requires, with the specified straight pipe lengths.
- Provide test points (thermometer and pressure) at inlet and outlet.
- Insulate with continuous **vapour barrier** to prevent condensation.`,
        specs: [{ label: "Water connection size and type" }, { label: "Required strainer mesh" }, { label: "Minimum straight pipe length at flow switch" }],
      },
      {
        key: "flushing", title_en: "Flushing, cleaning and filling the loop", title_ar: "تنظيف المنظومة وغسلها وملؤها", duration: 10,
        body_en: `${NOTE}

## Protect the evaporator
New pipework contains scale, weld spatter and debris. **Flush with the chiller isolated or bypassed**, then connect it.

1. Isolate the chiller using valves / a temporary bypass.
2. Flush and clean the system to the project specification; clean strainers repeatedly until debris stops collecting.
3. Treat and fill according to the water-treatment specification.
4. Vent all air; check the system holds the specified static pressure.
5. Open the chiller valves only when the system is clean and documented.

Record flushing and water-quality results — they are required for pre-commissioning and often for warranty.`,
      },
    ],
  },
  {
    title_en: "Electrical and controls coordination", title_ar: "التنسيق الكهربائي والتحكم",
    lessons: [
      {
        key: "electrical", title_en: "Power supply, earthing and isolation", title_ar: "مصدر القدرة والتأريض والعزل", duration: 12,
        body_en: `${NOTE}

> **Safety:** Electrical work must be done by qualified electricians under lock-out/tag-out (LOTO) and the site permit-to-work. Treat every conductor as live until proven dead.

## Checks
- Supply voltage, phases and frequency match the **nameplate and approved single-line diagram**.
- Cable and protective device sizes are as designed by the consultant from the **nameplate/manual electrical data**.
- A lockable **isolator** is provided and accessible.
- Earthing and bonding are complete and tested.
- Terminations are clean, complete and tightened to the **manufacturer's torque**.
- **Phase sequence** is verified before first energisation; wrong rotation can damage some compressor types.`,
        specs: [{ label: "Supply voltage, phases and frequency" }, { label: "Minimum circuit ampacity / maximum overcurrent protection" }, { label: "Terminal tightening torque" }],
      },
      {
        key: "controls", title_en: "Controls, BMS interface and interlocks", title_ar: "التحكم وواجهة BMS وعناصر الإقفال", duration: 12, tier: "pro",
        body_en: `${NOTE}

## Interfaces to confirm with the controls contractor
- **Chilled-water pump interlock** and proven flow before the chiller may start.
- **Remote start/stop**, status and alarm outputs.
- **BMS communication** — protocol and card/option depend on the model and controller. Confirm in the approved submittal.
- **Point list** agreed between chiller supplier and BMS integrator.

## Cabling practice
- Keep low-voltage signal and communication cabling **segregated from power cabling**.
- Use the specified cable type; terminate and earth screens as the manual states.
- Label both ends and record in the as-built.

Never bypass flow or safety interlocks to "get it running".`,
        specs: [{ label: "BMS communication protocol options for this model" }, { label: "Communication cable type and maximum length" }],
      },
    ],
  },
  {
    title_en: "Inspection and quality-control checkpoints", title_ar: "نقاط الفحص وضبط الجودة", 
    lessons: [{
      key: "qc", title_en: "Inspection and QC hold points", title_ar: "نقاط التوقف والفحص لضبط الجودة", duration: 12, tier: "pro",
      body_en: `${NOTE}

## How checkpoints work
An **Inspection and Test Plan (ITP)** lists activities, the acceptance criteria source, and who verifies each one:

- **Hold point** – work stops until the inspector signs.
- **Witness point** – inspector is invited; work may continue if they do not attend.
- **Review point** – documents are reviewed.

## Typical installation checkpoints
1. Delivery inspection and nameplate check.
2. Site readiness and lift plan sign-off.
3. Positioning, levelling and clearances.
4. Piping connections, supports and insulation.
5. Flushing and cleaning records.
6. Electrical termination, insulation tests and phase sequence.
7. Controls and interlock verification.

## Handling defects
Raise an **NCR** for non-conformance, agree corrective action, re-inspect, and keep photos and signed records for the handover pack.`,
    }],
  },
  {
    title_en: "Pre-commissioning tests and records", title_ar: "اختبارات وسجلات ما قبل التشغيل",
    lessons: [{
      key: "precom", title_en: "Pre-commissioning readiness checks and records", title_ar: "فحوصات وسجلات الجاهزية لما قبل التشغيل", duration: 15, tier: "pro",
      body_en: `${NOTE}

Pre-commissioning confirms the installation is **ready** for the manufacturer's / authorised commissioning engineer. It is **not** a substitute for formal commissioning.

## Mechanical
- Unit level, restraints removed as instructed, clearances free.
- Water system flushed, filled, vented, strainers clean; pressure test results signed.
- Insulation complete; drains clear.

## Electrical
- Terminations torqued and checked; insulation-resistance tests performed **using the method and limits in the manual** (do not apply test voltage across electronic components).
- Phase sequence confirmed; earthing verified.
- Crankcase / oil heating requirements observed **before first start**, as required by the manual.

## Controls
- Pump interlock, flow proving and remote signals verified.
- BMS points checked against the point list.

## Records
Complete the pre-commissioning checklist, attach test certificates and photos, and submit the **readiness notice**. Only appropriately authorised persons may charge or open the refrigerant circuit.`,
      specs: [{ label: "Hydrostatic test pressure and duration" }, { label: "Insulation resistance acceptance value" }, { label: "Crankcase/oil heater energisation time before first start" }],
    }],
  },
  {
    title_en: "Common installation mistakes", title_ar: "أخطاء التركيب الشائعة",
    lessons: [{
      key: "mistakes", title_en: "Common installation mistakes and how to avoid them", title_ar: "أخطاء التركيب الشائعة وكيفية تجنبها", duration: 10, tier: "pro",
      body_en: `${NOTE}

| Mistake | Why it hurts | How to avoid |
|---|---|---|
| Ignoring clearances | Hot-air recirculation, high-pressure trips | Check approved drawing before positioning |
| Piping weight on chiller | Stress, leaks, vibration transfer | Independent supports |
| No strainer / not flushed | Evaporator fouling and damage | Flush with unit bypassed; clean strainers |
| Wrong phase sequence | Compressor damage | Verify before energising |
| Leaving shipping restraints | Vibration, damage | Follow the manual's removal point |
| Poor drainage / water ponding | Corrosion, slab damage | Provide fall and drain paths |
| Dust ingress during works | Fouled coils and panels | Keep covers until final stage |
| Missing documentation | Failed handover, warranty issues | Complete records as you go |
| Bypassing interlocks | Safety and equipment risk | Never bypass; fix the cause |`,
    }],
  },
  {
    title_en: "Safe troubleshooting basics", title_ar: "أساسيات استكشاف الأعطال بأمان",
    lessons: [{
      key: "troubleshooting", title_en: "Safe troubleshooting basics", title_ar: "أساسيات استكشاف الأعطال بأمان", duration: 14, tier: "pro",
      body_en: `${NOTE}

## Safety first
- Use **LOTO** and the permit system; verify dead before touching.
- Only authorised, qualified persons may handle refrigerant or work on live controls.
- Never bypass safeties, and never reset repeatedly without understanding the cause.

## Structured approach
1. **Symptom** – what exactly is happening, when, and what changed?
2. **Alarms / history** – read the controller alarm and history. **Interpret alarm codes only from the manual for your exact model.** Do not guess codes.
3. **Interfaces first** – power, interlocks, flow, remote enable.
4. **Measure, don't assume** – use calibrated instruments and record readings.
5. **Fix the cause**, then document.

## Examples (generic, ranked by typical likelihood)
**Chiller will not start** → check alarms; power/phase; pump status and flow proving; remote enable/BMS command; interlocks.

**High-pressure alarm in hot weather** → dirty coils; fan fault; recirculation or blocked airflow; (qualified only) refrigerant-side causes.

**Low water temperature / freeze protection alarm** → low or lost flow; blocked strainer; sensor fault; incorrect setpoints.`,
    }],
  },
  {
    title_en: "Knowledge checks and final assessment", title_ar: "اختبارات المعرفة والتقييم النهائي",
    lessons: [{
      key: "assessment", title_en: "Assessment rules and academy certificate", title_ar: "قواعد التقييم وشهادة الأكاديمية", duration: 5, tier: "pro",
      body_en: `## How you earn the academy certificate
1. Complete every lesson in the course.
2. Pass the **final assessment** at or above the pass mark.
3. Keep an active **Pro** plan and a verified email address.

Your certificate has a unique verification number and can be checked publicly.

> **Important:** The certificate shows completion of an independent academy course. It is **not** a Daikin or other manufacturer certification, and does not authorise work on any equipment.`,
    }],
  },
];

export const SAMPLE_RESOURCES = [
  {
    title_en: "Pre-installation inspection checklist", title_ar: "قائمة فحص ما قبل التركيب", kind: "checklist" as const,
    md: `# Pre-installation inspection checklist
*Generic template. Add project-specific and manufacturer requirements.*

## Documents
- [ ] Approved submittal available (exact model, revision recorded)
- [ ] Approved drawings available (revision recorded)
- [ ] Manufacturer's installation manual for exact model/revision on site

## Delivery
- [ ] Nameplate matches submittal
- [ ] Transit damage inspected and photographed
- [ ] Packing list checked, shortages recorded
- [ ] MIR raised and signed

## Site readiness
- [ ] Structure approved for loads
- [ ] Access route and crane position confirmed
- [ ] Lift plan and permits approved
- [ ] Clearances verified against approved drawing
- [ ] Power, water and drainage points ready

Signed (installer): ____________  Date: ________
Signed (consultant/MC): ____________  Date: ________`,
  },
  {
    title_en: "Pre-commissioning readiness record template", title_ar: "نموذج سجل الجاهزية لما قبل التشغيل", kind: "template" as const,
    md: `# Pre-commissioning readiness record
*Generic template. Acceptance values must come from the approved manual / project specification — leave blank until confirmed.*

| Item | Acceptance source | Result | Initials |
|---|---|---|---|
| Unit level and restraints removed per manual | Manual section: ____ | | |
| Water system flushed and strainers cleaned | Spec ref: ____ | | |
| Water pressure test | Spec ref: ____ | | |
| Insulation-resistance test | Manual section: ____ | | |
| Phase sequence verified | | | |
| Pump interlock and flow proving | | | |
| BMS points verified | Point list rev: ____ | | |
| Crankcase/oil heater requirement observed | Manual section: ____ | | |

Equipment model: ____________  Serial: ____________  Manual revision: ____________
Readiness notice issued to: ____________  Date: ________`,
  },
  {
    title_en: "Site readiness checklist", title_ar: "قائمة فحص جاهزية الموقع", kind: "checklist" as const,
    md: `# Site readiness checklist

- [ ] Slab/curb/steelwork certified by structural engineer
- [ ] Level and drainage verified
- [ ] Delivery and crane route cleared
- [ ] Exclusion zone and signage prepared
- [ ] Permit to work and lifting permit issued
- [ ] Summer working-hour and heat-stress controls briefed
- [ ] Power supply available and isolated
- [ ] Chilled-water connection points defined
- [ ] Adjacent trades informed; service space protected`,
  },
];
