"use strict";

const express = require("express");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = admin.auth();
const db = admin.firestore();
const app = express();

const CEO_UID = "Zdi9MZk5uffixwVcJv9i576jmrS2";

app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    service: "ARNAUD Staff Management Backend",
    status: "running"
  });
});

async function requireCEO(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/);

    if (!match) {
      return res.status(401).json({
        error: "A valid Firebase sign-in is required."
      });
    }

    const decoded = await auth.verifyIdToken(match[1], true);

    if (decoded.uid !== CEO_UID) {
      return res.status(403).json({
        error: "Only the authorized CEO can manage staff."
      });
    }

    req.ceo = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Authentication failed."
    });
  }
}

const allowedRoles = [
  "country_manager",
  "document_officer",
  "support_staff"
];

app.post("/api/staff", requireCEO, async (req, res) => {
  let createdUser = null;

  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const role = String(req.body.role || "").trim();
    const branch = String(req.body.branch || "").trim();

    if (
      !name ||
      name.length > 100 ||
      !email ||
      email.length > 254 ||
      !branch ||
      branch.length > 100 ||
      !allowedRoles.includes(role)
    ) {
      return res.status(400).json({
        error: "Enter a valid name, email, role and branch."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    const existing = await db.collection("staff")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({
        error: "A staff record already exists for this email."
      });
    }

    createdUser = await auth.createUser({
      email,
      displayName: name,
      emailVerified: false,
      disabled: false
    });

    const staffRecord = {
      uid: createdUser.uid,
      name,
      email,
      role,
      branch,
      status: "pending_setup",
      documentVerificationAccess: role === "document_officer",
      studentVerificationAccess: false,
      createdBy: req.ceo.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("staff").doc(createdUser.uid).create(staffRecord);

    await db.collection("staffAuditLog").add({
      action: "staff_account_created",
      staffUid: createdUser.uid,
      staffEmail: email,
      performedBy: req.ceo.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      message: "Staff account created. Password setup must be completed separately.",
      uid: createdUser.uid,
      email
    });
  } catch (error) {
    if (createdUser) {
      try {
        await auth.deleteUser(createdUser.uid);
      } catch (_) {
        // Record cleanup failure in server logs in a production deployment.
      }
    }

    console.error("Staff creation failed:", error.message);

    return res.status(500).json({
      error: "Staff account creation failed. Check the server logs."
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

const port = process.env.PORT || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`ARNAUD staff backend listening on port ${port}`);
});