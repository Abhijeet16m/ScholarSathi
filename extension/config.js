// Keep document type IDs in sync with the registration and Documents pages.
const DOC_TYPES = [
  { type: "photo", label: "Passport photo", accept: "image/jpeg,image/png" },
  { type: "signature", label: "Signature", accept: "image/jpeg,image/png" },
  { type: "aadhaarCard", label: "Aadhaar card", accept: "application/pdf,image/jpeg,image/png" },
  { type: "apaarId", label: "APAAR ID", accept: "application/pdf,image/jpeg,image/png" },
  { type: "marksheet10", label: "10th marksheet", accept: "application/pdf,image/jpeg,image/png" },
  { type: "marksheet12", label: "12th marksheet", accept: "application/pdf,image/jpeg,image/png" },
  { type: "marksheet", label: "Latest marksheet (legacy)", accept: "application/pdf,image/jpeg,image/png" },
  { type: "incomeCert", label: "Income certificate", accept: "application/pdf,image/jpeg,image/png" },
  { type: "domicileCert", label: "Domicile certificate", accept: "application/pdf,image/jpeg,image/png" },
  { type: "institutionCert", label: "Institution certificate", accept: "application/pdf,image/jpeg,image/png" },
  { type: "casteCert", label: "Category certificate", accept: "application/pdf,image/jpeg,image/png" },
  { type: "bankPassbook", label: "Bank passbook", accept: "application/pdf,image/jpeg,image/png" }
];

const PROFILE_FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "fatherName", label: "Father / guardian name" },
  { key: "motherName", label: "Mother name" },
  { key: "dob", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "category", label: "Social category" },
  { key: "state", label: "Domicile state / UT" },
  { key: "district", label: "District" },
  { key: "mobile", label: "Mobile number" },
  { key: "email", label: "Email address" },
  { key: "familyIncome", label: "Annual family income" },
  { key: "percentage", label: "Latest marks / percentage" },
  { key: "qualificationLevel", label: "Highest qualification" },
  { key: "courseLevel", label: "Current course level" },
  { key: "course", label: "Current course / class" },
  { key: "courseYear", label: "Current course year" },
  { key: "entranceRank", label: "Entrance exam rank" },
  { key: "institution", label: "School / college / institution" },
  { key: "parentOccupation", label: "Parent / guardian occupation" },
  { key: "hasDisability", label: "Disability status" },
  { key: "isOrphan", label: "Orphan status" },
  { key: "receivesOtherScholarship", label: "Receives another scholarship" }
];
