require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

/* --------------------------------------------------
   📂 FILE SETUP
-------------------------------------------------- */

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/* --------------------------------------------------
   📂 FILE ROUTES
-------------------------------------------------- */

// GET all files
app.get("/files", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM files ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Files error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// UPLOAD file
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { course } = req.body;

    if (!file) return res.status(400).json({ error: "File required" });

    const result = await pool.query(
      "INSERT INTO files (name, url, course) VALUES ($1,$2,$3) RETURNING *",
      [file.originalname, `/uploads/${file.filename}`, course || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

// DELETE file
app.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const fileRes = await pool.query(
      "SELECT * FROM files WHERE id=$1",
      [id]
    );

    if (fileRes.rows.length === 0)
      return res.status(404).json({ error: "File not found" });

    const filePath = path.join(
      __dirname,
      fileRes.rows[0].url.replace(/^\//, "")
    );

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query("DELETE FROM files WHERE id=$1", [id]);

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ error: "Delete failed" });
  }
});

/* --------------------------------------------------
   👤 USER AUTH (POST ONLY — CLEANED)
-------------------------------------------------- */

// SIGNUP
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  try {
    const exists = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (exists.rows.length > 0)
      return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email,password) VALUES ($1,$2) RETURNING id,email",
      [email, hashed]
    );

    const token = jwt.sign(
      { id: result.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ user: result.rows[0], token });
  } catch (err) {
    console.error("❌ Signup error:", err.message);
    res.status(500).json({ error: "Signup failed" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

/* --------------------------------------------------
   📜 HISTORY
-------------------------------------------------- */

app.get("/history", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM history ORDER BY created_at DESC LIMIT 20"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ History error:", err.message);
    res.status(500).json({ error: "History error" });
  }
});

app.delete("/history", async (req, res) => {
  try {
    await pool.query("DELETE FROM history");
    res.json({ message: "History cleared" });
  } catch (err) {
    console.error("❌ Clear history error:", err.message);
    res.status(500).json({ error: "Failed to clear" });
  }
});

/* --------------------------------------------------
   🚀 START SERVER
-------------------------------------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});