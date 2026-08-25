-- Ensure at most one open break session per user.
-- A partial unique index on (userId) WHERE "endedAt" IS NULL makes the
-- server-side check-then-create race irrelevant: the database rejects the
-- second concurrent INSERT with a unique-violation error.
CREATE UNIQUE INDEX "BreakSession_userId_open_key"
    ON "BreakSession" ("userId")
    WHERE "endedAt" IS NULL;
