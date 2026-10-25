const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const {
getFirestore,
FieldValue
} = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();

const db = getFirestore();

const REQUIRED_FIELDS = [
"fullName",
"email",
"phone",
"dateOfBirth",
"country",
"state",
"residentialAddress",
"idType",
"idNumber",
"highestQualification",
"institution",
"course",
"graduationYear",
"yearsExperience",
"branchCountry",
"branch",
"branchAddress",
"guarantorName",
"guarantorPhone",
"guarantorOccupation",
"guarantorRelationship",
"guarantorAddress",
"reason",
"availability"
];

function cleanText(value, maxLength = 1000) {
if (typeof value !== "string") {
return "";
}

return value.trim().slice(0, maxLength);
}

function validEmail(value) {
return /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(value);
}

exports.submitDirectorManagerApplication = onCall(
{
region: "us-central1",
maxInstances: 5,
enforceAppCheck: false
},
async (request) => {
const data = request.data || {};

for (const field of REQUIRED_FIELDS) {
  if (
    typeof data[field] !== "string" ||
    data[field].trim().length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Please provide a valid value for ${field}.`
    );
  }
}

const application = {
  fullName: cleanText(data.fullName, 150),
  email: cleanText(data.email, 254).toLowerCase(),
  phone: cleanText(data.phone, 40),
  dateOfBirth: cleanText(data.dateOfBirth, 30),
  country: cleanText(data.country, 100),
  state: cleanText(data.state, 100),
  residentialAddress: cleanText(data.residentialAddress, 500),

  idType: cleanText(data.idType, 100),
  idNumber: cleanText(data.idNumber, 150),

  highestQualification: cleanText(
    data.highestQualification, 150
  ),
  institution: cleanText(data.institution, 200),
  course: cleanText(data.course, 150),
  graduationYear: cleanText(data.graduationYear, 20),

  yearsExperience: cleanText(data.yearsExperience, 30),
  previousEmployer: cleanText(data.previousEmployer, 200),
  previousPosition: cleanText(data.previousPosition, 150),
  experienceDetails: cleanText(data.experienceDetails, 3000),

  branchCountry: cleanText(data.branchCountry, 100),
  branch: cleanText(data.branch, 150),
  branchAddress: cleanText(data.branchAddress, 500),

  guarantorName: cleanText(data.guarantorName, 150),
  guarantorPhone: cleanText(data.guarantorPhone, 40),
  guarantorEmail: cleanText(data.guarantorEmail, 254),
  guarantorOccupation: cleanText(
    data.guarantorOccupation, 150
  ),
  guarantorRelationship: cleanText(
    data.guarantorRelationship, 100
  ),
  guarantorAddress: cleanText(data.guarantorAddress, 500),

  reason: cleanText(data.reason, 3000),
  availability: cleanText(data.availability, 150),

  requestedRole: "directorManager",
  status: "Pending Approval",
  reviewNote: "",
  reviewedByUid: "",
  reviewedByEmail: "",
  reviewedAt: null,
  submittedAt: FieldValue.serverTimestamp()
};

if (!validEmail(application.email)) {
  throw new HttpsError(
    "invalid-argument",
    "Please enter a valid applicant email address."
  );
}

if (
  application.guarantorEmail &&
  !validEmail(application.guarantorEmail)
) {
  throw new HttpsError(
    "invalid-argument",
    "Please enter a valid guarantor email address."
  );
}

if (
  application.fullName.length < 3 ||
  application.idNumber.length < 3 ||
  application.reason.length < 10
) {
  throw new HttpsError(
    "invalid-argument",
    "Please check the application details and try again."
  );
}

const ip = request.rawRequest.ip || "unknown";
const hourBucket = Math.floor(Date.now() / 3600000);

const ipHash = crypto
  .createHash("sha256")
  .update(ip)
  .digest("hex");

const rateLimitRef = db
  .collection("_applicationRateLimits")
  .doc(`${ipHash}_${hourBucket}`);

await db.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(rateLimitRef);
  const count = snapshot.exists
    ? Number(snapshot.data().count || 0)
    : 0;

  if (count >= 3) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many submissions. Please try again later."
    );
  }

  transaction.set(rateLimitRef, {
    count: count + 1,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
  });
});

const applicationRef = db
  .collection("directorManagerApplications")
  .doc();

const applicationReference =
  "ARNAUD-DM-" +
  crypto.randomBytes(5).toString("hex").toUpperCase();

await applicationRef.set({
  ...application,
  applicationReference
});

return {
  success: true,
  message: "Your application has been submitted successfully.",
  applicationReference
};

}
);