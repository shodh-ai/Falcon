export type PolicyCategoryId =
  | 'academic'
  | 'examination'
  | 'fees'
  | 'conduct'
  | 'campus'
  | 'digital'
  | 'administrative'
  | 'safety';

export type PolicyStatus = 'Active' | 'Archived';

export type UniversityPolicy = {
  id: string;
  name: string;
  shortDescription: string;
  category: PolicyCategoryId;
  version: string;
  lastUpdated: string;
  publishedAt: string;
  status: PolicyStatus;
  mandatory: boolean;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
  appliesTo: string;
  authority: string;
};

export type PolicyFaq = {
  id: string;
  question: string;
  answer: string;
};

export type PolicyContact = {
  office: string;
  role: string;
  email: string;
  phone: string;
  hours: string;
};

export const POLICY_CATEGORIES: Array<{
  id: PolicyCategoryId | 'all';
  label: string;
}> = [
  { id: 'all', label: 'All categories' },
  { id: 'academic', label: 'Academic Policies' },
  { id: 'examination', label: 'Examination Policies' },
  { id: 'fees', label: 'Fees & Finance' },
  { id: 'conduct', label: 'Student Conduct' },
  { id: 'campus', label: 'Campus Rules' },
  { id: 'digital', label: 'Digital & IT Policies' },
  { id: 'administrative', label: 'Administrative Policies' },
  { id: 'safety', label: 'Safety & Emergency' },
];

export const POLICY_CATEGORY_LABELS: Record<PolicyCategoryId, string> = {
  academic: 'Academic Policies',
  examination: 'Examination Policies',
  fees: 'Fees & Finance',
  conduct: 'Student Conduct',
  campus: 'Campus Rules',
  digital: 'Digital & IT Policies',
  administrative: 'Administrative Policies',
  safety: 'Safety & Emergency',
};

function p(
  partial: Omit<UniversityPolicy, 'status'> & { status?: PolicyStatus },
): UniversityPolicy {
  return { status: 'Active', ...partial };
}

export const UNIVERSITY_POLICIES: UniversityPolicy[] = [
  p({
    id: 'pol-attendance',
    name: 'Attendance Policy',
    shortDescription:
      'Minimum attendance requirements for theory, lab, and clinical courses, with shortage consequences.',
    category: 'academic',
    version: '4.2',
    lastUpdated: '2026-06-15',
    publishedAt: '2023-07-01',
    mandatory: true,
    appliesTo: 'All enrolled students',
    authority: 'Office of the Dean (Academics)',
    summary:
      'Students must maintain at least 75% attendance in each registered course. Shortage below the permitted relaxation may lead to detention from end-semester examinations.',
    sections: [
      {
        heading: 'Minimum requirement',
        bullets: [
          'Theory and practical courses require a minimum of 75% attendance calculated on classes held.',
          'Medical or approved leave may allow relaxation up to 10% (i.e., not below 65%) with supporting documents.',
          'Attendance is captured course-wise and reviewed before hall-ticket generation.',
        ],
      },
      {
        heading: 'Consequences of shortage',
        bullets: [
          'Students below the approved threshold are detained from the end-semester examination for that course.',
          'Detained courses must be re-registered in a subsequent semester as per academic regulations.',
          'Falsifying attendance records is treated as an academic misconduct case.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-credit-grading',
    name: 'Credit & Grading System',
    shortDescription:
      'Credit assignment, letter grades, SGPA/CGPA calculation, and academic standing rules.',
    category: 'academic',
    version: '3.8',
    lastUpdated: '2026-05-20',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Undergraduate and postgraduate students',
    authority: 'Controller of Examinations & Dean (Academics)',
    summary:
      'The university follows a credit-based relative/absolute grading framework. SGPA and CGPA determine promotion, honours eligibility, and transcript standing.',
    sections: [
      {
        heading: 'Credits',
        bullets: [
          'One theory credit typically equals one lecture hour per week across a semester.',
          'Laboratory and project credits follow the programme scheme published by the Board of Studies.',
          'Only courses with a passing grade contribute to earned credits for degree completion.',
        ],
      },
      {
        heading: 'SGPA & CGPA',
        bullets: [
          'SGPA is computed for each semester using credit-weighted grade points.',
          'CGPA is the cumulative credit-weighted average across all completed semesters.',
          'Grade improvement and backlog attempts follow the examination ordinance.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-promotion',
    name: 'Promotion Rules',
    shortDescription:
      'Conditions for moving to the next academic year, including credit thresholds and backlog limits.',
    category: 'academic',
    version: '3.5',
    lastUpdated: '2026-04-10',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All degree programmes',
    authority: 'Dean (Academics)',
    summary:
      'Promotion to the next year requires clearing the minimum earned credits and staying within the allowed number of pending backlogs for the programme.',
    sections: [
      {
        heading: 'Year-to-year promotion',
        bullets: [
          'Students must earn the minimum credits prescribed in the programme ordinance for that year.',
          'Students exceeding the backlog ceiling may be placed on academic probation or required to repeat the year.',
          'Promotion decisions are published after result declaration and revaluation windows close.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-backlog',
    name: 'Backlog Rules',
    shortDescription:
      'How failed or detained courses are reattempted, scheduled, and reflected on the transcript.',
    category: 'academic',
    version: '3.1',
    lastUpdated: '2026-03-28',
    publishedAt: '2023-08-15',
    mandatory: false,
    appliesTo: 'Students with uncleared courses',
    authority: 'Controller of Examinations',
    summary:
      'Backlog examinations are offered as per the academic calendar. Grades earned in backlog attempts replace the earlier fail grade according to the examination ordinance.',
    sections: [
      {
        heading: 'Reattempt framework',
        bullets: [
          'Students must register for backlog papers within the announced window and pay applicable fees.',
          'Internal assessment already earned may be carried forward where the ordinance permits.',
          'Uncleared mandatory courses block graduation until successfully completed.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-course-registration',
    name: 'Course Registration Policy',
    shortDescription:
      'Semester registration, add/drop windows, elective selection, and credit-load limits.',
    category: 'academic',
    version: '2.9',
    lastUpdated: '2026-07-01',
    publishedAt: '2024-01-10',
    mandatory: false,
    appliesTo: 'All enrolled students',
    authority: 'Dean (Academics) & Department HoDs',
    summary:
      'Students must complete online course registration each semester within the published timeline. Late registration may attract penalties or denial of enrolment for that term.',
    sections: [
      {
        heading: 'Registration process',
        bullets: [
          'Core courses are pre-loaded; electives must be chosen within seat and prerequisite constraints.',
          'Add/drop is allowed only during the official window published in the academic calendar.',
          'Maximum and minimum credit loads follow the programme scheme unless approved by the HoD.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-academic-integrity',
    name: 'Academic Integrity (Plagiarism)',
    shortDescription:
      'Rules against plagiarism, contract cheating, and misuse of generative AI in academic work.',
    category: 'academic',
    version: '2.4',
    lastUpdated: '2026-06-01',
    publishedAt: '2024-02-01',
    mandatory: true,
    appliesTo: 'All students and research scholars',
    authority: 'Dean (Academics) & Research Ethics Committee',
    summary:
      'All submitted work must be original. Plagiarism, fabrication of data, and unauthorised AI use are punishable under the academic integrity code.',
    sections: [
      {
        heading: 'Standards',
        bullets: [
          'Assignments, theses, and project reports must cite sources using the department-approved style.',
          'Similarity index thresholds for major submissions are enforced through approved plagiarism tools.',
          'Using generative AI without disclosure where disclosure is required is treated as misconduct.',
        ],
      },
      {
        heading: 'Sanctions',
        bullets: [
          'Penalties range from resubmission and grade penalty to course failure or suspension for repeated offences.',
          'Research misconduct is escalated to the Research Ethics Committee.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-exam-rules',
    name: 'Examination Rules',
    shortDescription:
      'Conduct of mid-term and end-semester examinations, permitted materials, and student duties.',
    category: 'examination',
    version: '5.0',
    lastUpdated: '2026-05-05',
    publishedAt: '2023-07-01',
    mandatory: true,
    appliesTo: 'All examinees',
    authority: 'Controller of Examinations',
    summary:
      'Students must follow seating, identity, and timing rules for every university examination. Breach of exam discipline is processed under Unfair Means regulations.',
    sections: [
      {
        heading: 'Before the exam',
        bullets: [
          'Carry a valid university ID and hall ticket; entry may be refused without both.',
          'Arrive at least 30 minutes before the scheduled start time.',
          'Only permitted stationery and authorised calculators may be taken inside the hall.',
        ],
      },
      {
        heading: 'During the exam',
        bullets: [
          'Mobile phones, smart watches, and earphones are prohibited in the examination hall.',
          'No candidate may leave the hall in the first 60 minutes or the last 15 minutes of a written paper.',
          'Instructions of invigilators and Centre Superintendent are binding.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-hall-ticket',
    name: 'Hall Ticket Rules',
    shortDescription:
      'Eligibility, download process, corrections, and conditions for issuing admit cards.',
    category: 'examination',
    version: '3.3',
    lastUpdated: '2026-04-22',
    publishedAt: '2023-09-01',
    mandatory: false,
    appliesTo: 'Students appearing for university examinations',
    authority: 'Controller of Examinations',
    summary:
      'Hall tickets are issued only when fee dues, attendance eligibility, and registration requirements are cleared for the examination session.',
    sections: [
      {
        heading: 'Issuance conditions',
        bullets: [
          'Clear all examination and semester fee dues linked to hall-ticket blocking.',
          'Download the hall ticket from the Student Portal and verify name, photo, and paper codes.',
          'Report discrepancies to the Examination Cell at least 48 hours before the first paper.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-unfair-means',
    name: 'Unfair Means (Cheating) Policy',
    shortDescription:
      'Definition of unfair means, reporting process, enquiry, and disciplinary penalties.',
    category: 'examination',
    version: '4.1',
    lastUpdated: '2026-03-12',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All examinees',
    authority: 'Unfair Means Committee / Controller of Examinations',
    summary:
      'Possession of unauthorised material, impersonation, copying, or electronic communication during an exam constitutes unfair means and attracts severe penalties.',
    sections: [
      {
        heading: 'Prohibited acts',
        bullets: [
          'Carrying notes, chits, programmable devices, or communicating answers with others.',
          'Impersonation or arranging another person to write an examination.',
          'Tampering with answer books or leaving identifying marks against instructions.',
        ],
      },
      {
        heading: 'Penalties',
        bullets: [
          'Paper cancellation, semester cancellation, debarment for one or more sessions, or rustication in grave cases.',
          'Students receive a show-cause notice and may present their case before the Unfair Means Committee.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-revaluation',
    name: 'Revaluation Policy',
    shortDescription:
      'Timelines, fees, and outcomes for revaluation or scrutiny of answer scripts.',
    category: 'examination',
    version: '2.7',
    lastUpdated: '2026-02-18',
    publishedAt: '2023-11-01',
    mandatory: false,
    appliesTo: 'Students seeking review of declared results',
    authority: 'Controller of Examinations',
    summary:
      'Students may apply for scrutiny or revaluation within the notified window after result publication. The revaluation outcome is final and binding.',
    sections: [
      {
        heading: 'Application rules',
        bullets: [
          'Apply online through the Student Portal and pay the prescribed fee per paper.',
          'Applications after the deadline are not accepted except by written CoE approval.',
          'Grade may increase, decrease, or remain unchanged after revaluation.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-supplementary',
    name: 'Supplementary Exam Policy',
    shortDescription:
      'Eligibility and scheduling of supplementary / special examinations for failed papers.',
    category: 'examination',
    version: '2.5',
    lastUpdated: '2026-01-30',
    publishedAt: '2024-01-15',
    mandatory: false,
    appliesTo: 'Students with failed theory or practical papers',
    authority: 'Controller of Examinations',
    summary:
      'Supplementary examinations are conducted as published in the academic calendar for eligible failed courses, subject to fee payment and registration.',
    sections: [
      {
        heading: 'Eligibility',
        bullets: [
          'Only courses with a declared fail or absent-with-eligibility status may be taken as supplementary.',
          'Students under disciplinary debarment cannot register until the debarment ends.',
          'Practical supplementary schedules are notified separately by departments.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-fee-payment',
    name: 'Fee Payment Policy',
    shortDescription:
      'Semester fee schedules, online payment channels, receipts, and dues blocking rules.',
    category: 'fees',
    version: '4.6',
    lastUpdated: '2026-07-10',
    publishedAt: '2023-07-01',
    mandatory: true,
    appliesTo: 'All fee-paying students',
    authority: 'Finance Office / Chief Finance Officer',
    summary:
      'Tuition and other notified dues must be paid by the due date through authorised university payment gateways. Outstanding dues may block hall tickets, registration, and certificates.',
    sections: [
      {
        heading: 'Payment rules',
        bullets: [
          'Pay only through the Falcon Student Portal or authorised bank / gateway channels listed by Finance.',
          'Retain the system-generated receipt for scholarship and audit verification.',
          'Fee concessions and scholarships are applied only after Finance approval is posted to the ledger.',
        ],
      },
      {
        heading: 'Dues & blocks',
        bullets: [
          'Unpaid demands can lock admit cards, no-dues, and selected portal services.',
          'Partial payments are adjusted as per Finance posting rules for the academic year.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-refund',
    name: 'Refund Policy',
    shortDescription:
      'Refund eligibility for withdrawal, cancellation, excess payment, and hostel/transport fees.',
    category: 'fees',
    version: '3.0',
    lastUpdated: '2026-05-28',
    publishedAt: '2023-08-01',
    mandatory: false,
    appliesTo: 'Students seeking fee refunds',
    authority: 'Finance Office',
    summary:
      'Refunds follow UGC / university withdrawal timelines. Processing requires a written application, no-dues clearance, and verification of original payment.',
    sections: [
      {
        heading: 'Refund principles',
        bullets: [
          'Admission withdrawal refunds follow the schedule published at the start of each academic year.',
          'Non-refundable components (where notified) such as registration charges are excluded.',
          'Approved refunds are credited to the original payment instrument or registered bank account.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-late-fee',
    name: 'Late Fee Policy',
    shortDescription:
      'Penalties and timelines applicable when semester or examination fees are paid after the due date.',
    category: 'fees',
    version: '2.8',
    lastUpdated: '2026-04-05',
    publishedAt: '2023-07-15',
    mandatory: false,
    appliesTo: 'Students paying after the due date',
    authority: 'Finance Office',
    summary:
      'Late fee slabs apply after the published due date. Extreme delay may require special Finance clearance before services are restored.',
    sections: [
      {
        heading: 'Late fee structure',
        bullets: [
          'A daily or slab-based late fee is charged as notified for the semester.',
          'Examination form late fees are separate and follow CoE notifications.',
          'Waiver of late fee requires documented approval from the competent authority.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-scholarship',
    name: 'Scholarship Policy',
    shortDescription:
      'Merit, need-based, and government scholarship processing, renewal, and continuation criteria.',
    category: 'fees',
    version: '3.4',
    lastUpdated: '2026-06-20',
    publishedAt: '2023-10-01',
    mandatory: false,
    appliesTo: 'Scholarship applicants and recipients',
    authority: 'Scholarship Cell / Finance Office',
    summary:
      'University and external scholarships require timely application, accurate documents, and continued academic eligibility for renewal.',
    sections: [
      {
        heading: 'Continuation criteria',
        bullets: [
          'Merit scholarships generally require maintaining the CGPA and conduct standards notified each year.',
          'False declarations lead to cancellation and recovery of disbursed amounts.',
          'Students must update bank details and Aadhaar-linked credentials as required by funding agencies.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-code-of-conduct',
    name: 'Code of Conduct',
    shortDescription:
      'Expected behaviour on campus, online spaces, and university-sponsored activities.',
    category: 'conduct',
    version: '4.0',
    lastUpdated: '2026-06-12',
    publishedAt: '2023-07-01',
    mandatory: true,
    appliesTo: 'All students',
    authority: 'Dean of Student Welfare / Proctor',
    summary:
      'Students must uphold honesty, respect, and lawful behaviour. Violation of the code invites disciplinary action under university statutes.',
    sections: [
      {
        heading: 'Core expectations',
        bullets: [
          'Treat faculty, staff, visitors, and peers with courtesy; harassment or intimidation is prohibited.',
          'Do not damage university property or disturb academic activities.',
          'Comply with hostel, library, laboratory, and IT rules while using university facilities.',
        ],
      },
      {
        heading: 'Online conduct',
        bullets: [
          'Misuse of official email, LMS, or social media to defame the university or individuals is actionable.',
          'Cyberbullying and sharing of private content without consent are serious offences.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-anti-ragging',
    name: 'Anti-Ragging Policy',
    shortDescription:
      'Zero-tolerance ragging ban, reporting channels, and UGC-compliant penalties.',
    category: 'conduct',
    version: '5.1',
    lastUpdated: '2026-07-05',
    publishedAt: '2023-07-01',
    mandatory: true,
    appliesTo: 'All students, especially first-year cohorts',
    authority: 'Anti-Ragging Committee / Dean of Student Welfare',
    summary:
      'Ragging in any form is strictly prohibited on campus, in hostels, and in transportation. The university complies with UGC anti-ragging regulations.',
    sections: [
      {
        heading: 'What constitutes ragging',
        bullets: [
          'Any act that causes physical or psychological harm, humiliation, or forced activity for juniors.',
          'Verbal abuse, exclusion, or online harassment linked to seniority culture.',
          'Abetment or silent witnessing without reporting may also attract enquiry.',
        ],
      },
      {
        heading: 'Reporting & action',
        bullets: [
          'Report immediately to the Anti-Ragging Helpline, warden, proctor, or Student Portal safety channel.',
          'Proven cases may lead to suspension, rustication, FIR, and scholarship cancellation.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-anti-harassment',
    name: 'Anti-Harassment Policy',
    shortDescription:
      'Prevention of sexual harassment and other discriminatory harassment, with ICC process.',
    category: 'conduct',
    version: '3.6',
    lastUpdated: '2026-05-15',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Students, staff, and campus visitors in student matters',
    authority: 'Internal Complaints Committee (ICC)',
    summary:
      'The university maintains a safe learning environment free from sexual harassment and discrimination. Complaints are handled confidentially by the ICC as per POSH norms.',
    sections: [
      {
        heading: 'Protection & process',
        bullets: [
          'Students may file written complaints with the ICC or through designated portal / email channels.',
          'Interim measures such as class or hostel changes may be arranged during enquiry.',
          'Retaliation against a complainant or witness is itself a punishable offence.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-disciplinary',
    name: 'Disciplinary Policy',
    shortDescription:
      'Show-cause, enquiry, and penalty framework for general discipline cases.',
    category: 'conduct',
    version: '3.2',
    lastUpdated: '2026-03-08',
    publishedAt: '2023-08-20',
    mandatory: false,
    appliesTo: 'All students',
    authority: 'Proctorial Board / Dean of Student Welfare',
    summary:
      'Disciplinary cases follow a documented enquiry with an opportunity to be heard. Penalties are proportionate to the offence and prior record.',
    sections: [
      {
        heading: 'Process',
        bullets: [
          'A show-cause notice states the alleged misconduct and response timeline.',
          'The Proctorial Board may recommend warning, fine, community service, suspension, or rustication.',
          'Appeal routes, where available, are notified in the order issued to the student.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-dress-code',
    name: 'Dress Code Policy',
    shortDescription:
      'Attire expectations for classrooms, laboratories, workshops, and formal university events.',
    category: 'conduct',
    version: '2.1',
    lastUpdated: '2025-12-10',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'On-campus students during academic hours',
    authority: 'Dean of Student Welfare',
    summary:
      'Students must wear attire suitable for an academic campus. Labs and workshops require safety-compliant clothing and closed footwear.',
    sections: [
      {
        heading: 'Guidelines',
        bullets: [
          'Formal or smart-casual clothing is expected in academic blocks during instructional hours.',
          'Laboratory coats, closed shoes, and PPE are mandatory in designated labs and workshops.',
          'Department-specific uniform rules (where notified) must be followed on clinical / industrial days.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-library',
    name: 'Library Rules',
    shortDescription:
      'Membership, borrowing limits, overdue fines, digital resources, and conduct in the library.',
    category: 'campus',
    version: '3.7',
    lastUpdated: '2026-04-18',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All library members',
    authority: 'University Librarian',
    summary:
      'Library resources are shared academic assets. Students must return borrowed items on time and follow silence and device-use norms inside reading areas.',
    sections: [
      {
        heading: 'Borrowing & conduct',
        bullets: [
          'Borrowing limits and loan periods follow the membership category displayed at the circulation desk.',
          'Overdue items attract fines; lost books must be replaced or paid for at notified rates.',
          'Food, loud conversation, and unauthorised photography of restricted materials are not allowed.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-hostel',
    name: 'Hostel Rules',
    shortDescription:
      'Residence timings, visitors, mess, property care, and warden authority in hostels.',
    category: 'campus',
    version: '4.3',
    lastUpdated: '2026-06-25',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Hostel residents and authorised overnight guests',
    authority: 'Chief Warden / Dean of Student Welfare',
    summary:
      'Hostel living requires observance of in-time rules, mess regulations, and respect for fellow residents. Serious violations may lead to eviction.',
    sections: [
      {
        heading: 'Residence rules',
        bullets: [
          'Residents must follow notified entry/exit timings and leave approval processes.',
          'Cooking in rooms, unauthorised electrical appliances, and sub-letting are prohibited.',
          'Guests are allowed only in designated areas during visiting hours with warden permission.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-transport',
    name: 'Transport Rules',
    shortDescription:
      'Bus pass, route discipline, safety behaviour, and fee rules for university transport.',
    category: 'campus',
    version: '2.6',
    lastUpdated: '2026-05-02',
    publishedAt: '2023-09-10',
    mandatory: false,
    appliesTo: 'Students using university buses',
    authority: 'Transport Officer',
    summary:
      'University transport is available on allotted routes with a valid bus pass. Unsafe behaviour or pass misuse can lead to suspension of transport privilege.',
    sections: [
      {
        heading: 'Passenger responsibilities',
        bullets: [
          'Carry a valid transport pass and university ID while boarding.',
          'Do not distract the driver; remain seated while the bus is in motion.',
          'Route or stop changes require Transport Office approval; informal stop requests are not entertained.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-lab-safety',
    name: 'Laboratory Safety Rules',
    shortDescription:
      'Mandatory safety practices for engineering, science, and computing laboratories.',
    category: 'campus',
    version: '3.0',
    lastUpdated: '2026-02-27',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Students using teaching or research labs',
    authority: 'Lab In-charge / Dean (Academics)',
    summary:
      'Laboratory work must follow PPE, equipment, and chemical-handling instructions. Negligence endangering others is a disciplinary offence.',
    sections: [
      {
        heading: 'Safety essentials',
        bullets: [
          'Wear required PPE and follow machine lock-out / shut-down procedures.',
          'Report spills, injuries, and equipment faults to the lab in-charge immediately.',
          'Do not work alone in high-risk labs outside supervised hours.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-id-card',
    name: 'ID Card Policy',
    shortDescription:
      'Issue, display, replacement, and misuse rules for the university identity card.',
    category: 'campus',
    version: '2.3',
    lastUpdated: '2026-01-15',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All enrolled students',
    authority: 'Registrar Office / Security',
    summary:
      'The university ID card must be carried on campus and produced on request by security or authorised staff. Lending or forging an ID card is prohibited.',
    sections: [
      {
        heading: 'Card rules',
        bullets: [
          'Display or carry the ID card while in academic, hostel, and examination areas.',
          'Report loss immediately; a replacement fee applies for duplicate cards.',
          'Access privileges linked to a lost card may be suspended until replacement is issued.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-wifi',
    name: 'Wi-Fi Usage Policy',
    shortDescription:
      'Acceptable use of campus wireless networks, bandwidth, and prohibited activities.',
    category: 'digital',
    version: '2.9',
    lastUpdated: '2026-04-30',
    publishedAt: '2023-08-01',
    mandatory: false,
    appliesTo: 'All campus network users',
    authority: 'IT Services / CIO Office',
    summary:
      'Campus Wi-Fi is provided for academic and official use. Illegal downloads, network attacks, and credential sharing are forbidden.',
    sections: [
      {
        heading: 'Acceptable use',
        bullets: [
          'Connect only with your assigned credentials; do not share passwords or create unauthorised hotspots.',
          'Peer-to-peer piracy, cryptocurrency mining, and scanning of university networks are prohibited.',
          'IT Services may throttle, quarantine, or suspend accounts that threaten network integrity.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-email',
    name: 'Email Usage Policy',
    shortDescription:
      'Official student email use, forwarding limits, and communication etiquette.',
    category: 'digital',
    version: '2.2',
    lastUpdated: '2026-03-21',
    publishedAt: '2023-08-01',
    mandatory: false,
    appliesTo: 'Holders of university email accounts',
    authority: 'IT Services',
    summary:
      'University email is the official channel for academic notices. Students are responsible for reading official mail and keeping accounts secure.',
    sections: [
      {
        heading: 'Email responsibilities',
        bullets: [
          'Use official email for academic correspondence with faculty and administration.',
          'Do not send spam, chain messages, or offensive content from university accounts.',
          'Phishing must be reported to IT Services; never share OTP or passwords by email.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-password',
    name: 'Password Security Policy',
    shortDescription:
      'Password strength, MFA, account recovery, and protection of Student Portal credentials.',
    category: 'digital',
    version: '2.0',
    lastUpdated: '2026-02-10',
    publishedAt: '2024-03-01',
    mandatory: false,
    appliesTo: 'All portal and campus account users',
    authority: 'IT Services / Information Security',
    summary:
      'Students must protect Falcon and campus credentials with strong unique passwords and never share OTPs. Compromised accounts must be reported immediately.',
    sections: [
      {
        heading: 'Security requirements',
        bullets: [
          'Use a strong password distinct from personal social media accounts.',
          'Enable multi-factor authentication where offered by the university.',
          'Password sharing with friends, cyber cafés, or agents voids your security claim in misuse cases.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-data-privacy',
    name: 'Data Privacy Policy',
    shortDescription:
      'How the university collects, uses, stores, and protects student personal data.',
    category: 'digital',
    version: '3.1',
    lastUpdated: '2026-07-08',
    publishedAt: '2024-01-20',
    mandatory: true,
    appliesTo: 'All students and guardians interacting with university systems',
    authority: 'Registrar / Data Protection Officer',
    summary:
      'Student personal data is processed for academic, administrative, statutory, and safety purposes. Access is limited to authorised roles under university privacy controls.',
    sections: [
      {
        heading: 'Data handling',
        bullets: [
          'Academic, fee, attendance, and identity data are stored in secured university systems.',
          'Data is shared with third parties only for authorised services (payment gateways, statutory portals) under agreements.',
          'Students may request correction of inaccurate personal data through the Registrar / ERP help channels.',
        ],
      },
      {
        heading: 'Your responsibilities',
        bullets: [
          'Keep profile information accurate and do not misuse others’ personal data obtained through campus systems.',
          'Report suspected data leaks to the Data Protection Officer or IT Services.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-leave',
    name: 'Leave Policy',
    shortDescription:
      'Medical, on-duty, and personal leave application process and supporting documents.',
    category: 'administrative',
    version: '2.7',
    lastUpdated: '2026-05-11',
    publishedAt: '2023-09-01',
    mandatory: false,
    appliesTo: 'All enrolled students',
    authority: 'Department HoD / Dean of Student Welfare',
    summary:
      'Leave must be applied through the prescribed channel before absence wherever possible. Approved leave supports attendance consideration but does not automatically waive academic requirements.',
    sections: [
      {
        heading: 'Leave types',
        bullets: [
          'Medical leave requires certificates from a registered medical practitioner as notified.',
          'On-duty leave for official events needs faculty / HoD recommendation before the event.',
          'Extended absence without approval may lead to detention or deregistration proceedings.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-bonafide',
    name: 'Bonafide Certificate Policy',
    shortDescription:
      'Eligibility, processing time, and use cases for university bonafide certificates.',
    category: 'administrative',
    version: '2.4',
    lastUpdated: '2026-04-02',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Currently enrolled students',
    authority: 'Registrar Office',
    summary:
      'Bonafide certificates are issued to enrolled students for bank, passport, scholarship, and related purposes after identity verification and fee clearance where required.',
    sections: [
      {
        heading: 'Issuance',
        bullets: [
          'Apply through the Student Portal or Registrar counter with the stated purpose.',
          'Standard processing follows the published service timeline; urgent requests need justification.',
          'Misuse of a bonafide certificate for false claims is a disciplinary offence.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-tc',
    name: 'Transfer Certificate Policy',
    shortDescription:
      'Conditions and no-dues requirements for issuing a Transfer Certificate (TC).',
    category: 'administrative',
    version: '2.5',
    lastUpdated: '2026-03-16',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Students withdrawing or transferring out',
    authority: 'Registrar Office',
    summary:
      'A Transfer Certificate is issued after academic withdrawal approval and clearance of library, hostel, finance, and departmental no-dues.',
    sections: [
      {
        heading: 'Clearance checklist',
        bullets: [
          'Submit the TC application with parent/guardian acknowledgement where required.',
          'Obtain no-dues from Finance, Library, Hostel, Department, and other notified offices.',
          'TC once issued concludes active enrolment; re-admission follows separate rules.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-migration',
    name: 'Migration Certificate Policy',
    shortDescription:
      'Eligibility and documents required for university migration certificates.',
    category: 'administrative',
    version: '2.2',
    lastUpdated: '2026-02-05',
    publishedAt: '2023-10-15',
    mandatory: false,
    appliesTo: 'Students moving to another university',
    authority: 'Registrar Office / Examination Cell',
    summary:
      'Migration certificates are issued to eligible students after result and enrolment verification, typically for joining another recognised university.',
    sections: [
      {
        heading: 'Requirements',
        bullets: [
          'Apply with TC/withdrawal status and prescribed fee as applicable.',
          'Pending malpractice or disciplinary cases may hold migration issuance.',
          'Collect the certificate only from authorised counters or approved postal despatch.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-degree-transcript',
    name: 'Degree & Transcript Policy',
    shortDescription:
      'Provisional certificate, degree, transcript, and duplicate credential issuance rules.',
    category: 'administrative',
    version: '3.3',
    lastUpdated: '2026-06-30',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Graduating and alumni students',
    authority: 'Controller of Examinations / Registrar',
    summary:
      'Official academic credentials are issued only after degree eligibility is confirmed. Duplicate documents require an indemnity / FIR process where prescribed.',
    sections: [
      {
        heading: 'Credential rules',
        bullets: [
          'Provisional certificates and transcripts follow convocation / result timelines notified by CoE.',
          'Name corrections require supporting legal identity documents.',
          'Employers and other universities should verify credentials through authorised verification channels.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-fire-safety',
    name: 'Fire Safety Guidelines',
    shortDescription:
      'Evacuation routes, assembly points, and student duties during a fire alarm.',
    category: 'safety',
    version: '2.8',
    lastUpdated: '2026-05-25',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Everyone on campus',
    authority: 'Campus Safety / Estate Office',
    summary:
      'On hearing a fire alarm, evacuate calmly using stairs, assemble at the marked point, and follow wardens or safety marshals. Do not use lifts during a fire emergency.',
    sections: [
      {
        heading: 'If you hear the alarm',
        bullets: [
          'Leave belongings that slow evacuation; exit via the nearest safe staircase.',
          'Assist persons with disability if you can do so without endangering yourself.',
          'Do not re-enter the building until the all-clear is given by authorised staff.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-medical-emergency',
    name: 'Medical Emergency Procedure',
    shortDescription:
      'First response, campus clinic contact, and escalation for medical emergencies.',
    category: 'safety',
    version: '2.6',
    lastUpdated: '2026-04-14',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All students and campus users',
    authority: 'Campus Health Centre / Dean of Student Welfare',
    summary:
      'In a medical emergency, call campus health / security immediately, do not move a seriously injured person unless necessary for safety, and inform the warden or faculty on duty.',
    sections: [
      {
        heading: 'Immediate steps',
        bullets: [
          'Dial the campus medical emergency number and share exact location and symptoms.',
          'For hostel incidents after hours, contact the duty warden and campus security together.',
          'Students with chronic conditions should keep emergency medicines and disclose care needs to the Health Centre.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-womens-safety',
    name: "Women's Safety",
    shortDescription:
      'Campus safety measures, helplines, and support for women students and staff.',
    category: 'safety',
    version: '3.0',
    lastUpdated: '2026-06-08',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'Women students and the wider campus community',
    authority: 'Women’s Cell / ICC / Campus Security',
    summary:
      'The university provides helplines, safe transport coordination where available, and confidential complaint routes. Bystanders are encouraged to report unsafe situations promptly.',
    sections: [
      {
        heading: 'Support channels',
        bullets: [
          'Use the Women’s Helpline, ICC, or security control room for immediate assistance.',
          'Night movement on isolated paths should preferably be in pairs; use well-lit campus routes.',
          'Complaints of stalking, assault, or intimidation are treated with priority and confidentiality.',
        ],
      },
    ],
  }),
  p({
    id: 'pol-emergency-contacts',
    name: 'Emergency Contact Information',
    shortDescription:
      'Primary campus emergency numbers for security, medical, fire, and student support.',
    category: 'safety',
    version: '1.9',
    lastUpdated: '2026-07-12',
    publishedAt: '2023-07-01',
    mandatory: false,
    appliesTo: 'All students',
    authority: 'Campus Security & Student Affairs',
    summary:
      'Save campus emergency numbers on your phone. For life-threatening situations, call local emergency services first, then inform campus security.',
    sections: [
      {
        heading: 'Campus numbers',
        bullets: [
          'Campus Security Control Room — use the number published by university administration',
          'Campus Health Centre (24×7 duty desk) — contact details on notice boards / ERP alerts',
          'Anti-Ragging Helpline — set NEXT_PUBLIC_ANTI_RAGGING_HELPLINE or ask the warden / security desk',
          'Women’s Helpline / ICC — contact Student Welfare or the published campus notice',
          'National Emergency (Police/Fire/Ambulance): 112',
        ],
      },
    ],
  }),
];

export const POLICY_FAQS: PolicyFaq[] = [
  {
    id: 'faq-1',
    question: 'Where can I download the official PDF of a policy?',
    answer:
      'Open any policy and select Download PDF, or use Download All Policies from the page header to generate a combined PDF pack of currently listed Active policies.',
  },
  {
    id: 'faq-2',
    question: 'What does Mandatory Reading mean?',
    answer:
      'Mandatory policies are essential rules every student must know. Mark them as read after you review them. Your read progress on this page tracks completion of the mandatory set.',
  },
  {
    id: 'faq-3',
    question: 'Do these portal copies replace signed ordinances?',
    answer:
      'The Student Portal publishes the student-facing policy text for easy reference. Where a formal ordinance, statute, or circular exists, that signed document prevails in case of conflict.',
  },
  {
    id: 'faq-4',
    question: 'How soon are policy updates shown here?',
    answer:
      'When the Registrar or issuing authority publishes a revision, the version number and last-updated date change. Check Recent Policy Updates for the latest revisions.',
  },
  {
    id: 'faq-5',
    question: 'Who do I contact if a policy is unclear?',
    answer:
      'Use the Need Help contacts below—Registrar for certificates and records, Academic Office for academic/examination rules, and Student Affairs for conduct, hostel, and welfare matters.',
  },
];

export const POLICY_CONTACTS: PolicyContact[] = [
  {
    office: 'Registrar Office',
    role: 'Records, certificates, and official policy publication',
    email: 'registrar@mygyanvihar.com',
    phone: '+91 141 000 2100',
    hours: 'Mon–Sat, 10:00 AM – 4:00 PM',
  },
  {
    office: 'Academic Office',
    role: 'Academics, registration, attendance, and examinations',
    email: 'academics@mygyanvihar.com',
    phone: '+91 141 000 2200',
    hours: 'Mon–Fri, 10:00 AM – 5:00 PM',
  },
  {
    office: 'Student Affairs',
    role: 'Conduct, hostel, welfare, and student support',
    email: 'studentaffairs@mygyanvihar.com',
    phone: '+91 141 000 2300',
    hours: 'Mon–Sat, 10:00 AM – 5:00 PM',
  },
];

export const MANDATORY_POLICY_IDS = [
  'pol-attendance',
  'pol-exam-rules',
  'pol-code-of-conduct',
  'pol-anti-ragging',
  'pol-fee-payment',
  'pol-academic-integrity',
  'pol-data-privacy',
] as const;

export function getPoliciesPageLastUpdated(): string {
  return UNIVERSITY_POLICIES.reduce((latest, policy) => {
    return policy.lastUpdated > latest ? policy.lastUpdated : latest;
  }, '1970-01-01');
}
