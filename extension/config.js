// Shared lists used by the options page and the popup.
// To add a new profile field or document type, start here.

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

// key = the name used inside the extension (must match autofill-engine.js)
const PROFILE_FIELDS = [
  { key: "fullName",     label: "Full name (as on documents)", type: "text" },
  { key: "fatherName",   label: "Father's name",               type: "text" },
  { key: "motherName",   label: "Mother's name",               type: "text" },
  { key: "dob",          label: "Date of birth",               type: "date" },
  { key: "gender",       label: "Gender",                      type: "select",
    options: [["male", "Male"], ["female", "Female"], ["other", "Other"]] },
  { key: "category",     label: "Category",                    type: "select",
    options: [["GEN", "General"], ["OBC", "OBC"], ["SC", "SC"], ["ST", "ST"], ["EWS", "EWS"]] },
  { key: "state",        label: "State of domicile",           type: "select",
    options: STATES.map((s) => [s, s]) },
  { key: "district",     label: "District",                    type: "text" },
  { key: "mobile",       label: "Mobile number (10 digits)",   type: "tel" },
  { key: "email",        label: "Email",                       type: "email" },
  { key: "familyIncome", label: "Annual family income (Rs)",   type: "number" },
  { key: "percentage",   label: "Percentage in last exam",     type: "number" }
];

// type = the name used inside the extension (must match autofill-engine.js)
const DOC_TYPES = [
  { type: "photo",      label: "Passport photo",                accept: "image/*" },
  { type: "signature",  label: "Signature",                     accept: "image/*" },
  { type: "incomeCert", label: "Income certificate",            accept: "application/pdf,image/*" },
  { type: "casteCert",  label: "Caste / category certificate",  accept: "application/pdf,image/*" },
  { type: "marksheet",  label: "Latest marksheet",              accept: "application/pdf,image/*" }
];
