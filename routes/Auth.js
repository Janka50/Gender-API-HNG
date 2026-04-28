"use strict";

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");

const router = express.Router();

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || "access_secret_change_me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh_secret_change_me";
const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// In-memory PKCE store (use Redis in production)
const pkceStore = new Map();

// ── Helper: generate tokens ───────────────────────────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, github_id: user.github_id, username: user.username, role: user.role },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

// ── GET /api/v1/auth/github/login ─────────────────────────────────────────────
router.get("/github/login", (req, res) => {
  const isCli = req.query.cli === "true";

  // PKCE
  const code_verifier  = crypto.randomBytes(32).toString("base64url");
  const code_challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
  const state          = crypto.randomBytes(16).toString("hex");

  // Store verifier keyed by state
  pkceStore.set(state, { code_verifier, isCli, expiresAt: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id:             GITHUB_CLIENT_ID,
    redirect_uri:          `${BASE_URL}/api/v1/auth/github/callback`,
    scope:                 "read:user",
    state,
    code_challenge,
    code_challenge_method: "S256",
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ── GET /api/v1/auth/github/callback ─────────────────────────────────────────
router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ status: "error", message: "Missing code or state" });
  }

  const pkce = pkceStore.get(state);
  if (!pkce || Date.now() > pkce.expiresAt) {
    return res.status(400).json({ status: "error", message: "Invalid or expired state" });
  }
  pkceStore.delete(state);

  const { code_verifier, isCli } = pkce;

  try {
    // Exchange code for GitHub access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id:     GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  `${BASE_URL}/api/v1/auth/github/callback`,
        code_verifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(502).json({ status: "error", message: "GitHub token exchange failed" });
    }

    // Fetch GitHub user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent":  "gender-api-hng",
      },
    });
    const githubUser = await userRes.json();

    // Find or create user in DB
    let user;
    const existing = await query("SELECT * FROM users WHERE github_id = $1", [String(githubUser.id)]);

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const newUser = {
        id:         uuidv4(),
        github_id:  String(githubUser.id),
        username:   githubUser.login,
        role:       "analyst",
        created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      };
      await query(
        "INSERT INTO users (id, github_id, username, role, created_at) VALUES ($1,$2,$3,$4,$5)",
        [newUser.id, newUser.github_id, newUser.username, newUser.role, newUser.created_at]
      );
      user = newUser;
    }

    // Generate tokens
    const access_token  = generateAccessToken(user);
    const refresh_token = generateRefreshToken(user);

    // Store refresh token
    await query(
      "INSERT INTO refresh_tokens (id, user_id, token, created_at) VALUES ($1,$2,$3,$4)",
      [uuidv4(), user.id, refresh_token, new Date().toISOString().replace(/\.\d{3}Z$/, "Z")]
    );

    // CLI — return JSON
    if (isCli) {
      return res.status(200).json({
        status: "success",
        access_token,
        refresh_token,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }

    // Web — set HTTP-only cookies
    res.cookie("access_token", access_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   15 * 60 * 1000,
    });
    res.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      status: "success",
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error("GitHub callback error:", err.message, err.stack);
    console.error("Token data:", JSON.stringify(tokenData || {}));
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token || req.body?.refresh_token;

    if (!token) {
      return res.status(401).json({ status: "error", message: "Refresh token required" });
    }

    const decoded = jwt.verify(token, REFRESH_SECRET);

    // Check token exists in DB
    const stored = await query(
      "SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2",
      [token, decoded.id]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ status: "error", message: "Invalid refresh token" });
    }

    // Get user
    const userResult = await query("SELECT * FROM users WHERE id = $1", [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ status: "error", message: "User not found" });
    }

    const user = userResult.rows[0];
    const new_access_token = generateAccessToken(user);

    // Web — update cookie
    res.cookie("access_token", new_access_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   15 * 60 * 1000,
    });

    return res.status(200).json({
      status:       "success",
      access_token: new_access_token,
    });
  } catch (err) {
    return res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
  }
});

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token || req.body?.refresh_token;
    if (token) {
      await query("DELETE FROM refresh_tokens WHERE token = $1", [token]);
    }
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Logout failed" });
  }
});

module.exports = router;