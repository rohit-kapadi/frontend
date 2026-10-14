import { Router } from 'express';
import bcrypt from 'bcrypt';
import db from '../config/db.js';

const router = Router();
const isDev = process.env.NODE_ENV !== 'production';

const debugLog = (...args) => {
  if (isDev) console.log('[auth/login]', ...args);
};

// Explains the outcome of one candidate row without exposing secrets.
const describeMismatch = (user, passwordMatches) => {
  if (typeof user.password_hash !== 'string' || user.password_hash.length === 0) {
    return 'password_hash is empty (no hash stored for this account)';
  }
  if (!/^\$2[abxy]\$\d{2}\$/.test(user.password_hash)) {
    return 'stored password_hash is not a bcrypt hash (plain text or other format?)';
  }
  return passwordMatches ? 'password matched' : 'password did not match the stored hash';
};

const findUserByIdentifier = `
  SELECT admin_id AS id, name, email, password_hash, nexus_id, 'admin'::text AS role
  FROM admins
  WHERE LOWER(admin_id) = LOWER($1) OR LOWER(email) = LOWER($1)

  UNION ALL

  SELECT centre_users.user_id AS id, diagnostic_centres.name AS name,
         centre_users.email, centre_users.password_hash, diagnostic_centres.nexus_id,
         'centre_user'::text AS role
  FROM centre_users
  JOIN diagnostic_centres ON diagnostic_centres.centre_id = centre_users.centre_id
  WHERE LOWER(centre_users.user_id) = LOWER($1) OR LOWER(centre_users.email) = LOWER($1)

  UNION ALL

  SELECT doctor_id AS id, CONCAT_WS(' ', first_name, last_name) AS name,
         email, password_hash, nexus_id, 'doctor'::text AS role
  FROM doctors
  WHERE LOWER(doctor_id) = LOWER($1) OR LOWER(email) = LOWER($1)
`;

router.post('/login', async (req, res) => {
  const { username, email, password } = req.body ?? {};
  const identifier =
    typeof username === 'string' && username.trim()
      ? username.trim()
      : typeof email === 'string'
        ? email.trim()
        : undefined;

  if (
    typeof identifier !== 'string' ||
    identifier.length === 0 ||
    identifier.length > 255 ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return res.status(400).json({ status: 'error', error: 'Username/email and password are required.' });
  }

  try {
    const { rows } = await db.query(findUserByIdentifier, [identifier]);
    debugLog(`identifier "${identifier}" -> ${rows.length} row(s) found`);

    const matchingUsers = await Promise.all(
      rows.map(async (user) => {
        let passwordMatches = false;
        try {
          passwordMatches =
            typeof user.password_hash === 'string' &&
            await bcrypt.compare(password, user.password_hash);
        } catch (compareError) {
          debugLog(`bcrypt.compare threw for ${user.role} ${user.id}:`, compareError.message);
        }
        debugLog(`${user.role} ${user.id} (nexus ${user.nexus_id}): ${describeMismatch(user, passwordMatches)}`);
        return { user, passwordMatches };
      }),
    );
    const authenticatedUsers = matchingUsers
      .filter(({ passwordMatches }) => passwordMatches)
      .map(({ user }) => user);

    if (authenticatedUsers.length !== 1) {
      debugLog(
        rows.length === 0
          ? 'rejecting: no account matches this identifier'
          : `rejecting: ${authenticatedUsers.length} account(s) authenticated (expected exactly 1)`,
      );
      return res.status(401).json({ status: 'error', error: 'Invalid username/email or password.' });
    }

    const { password_hash: _passwordHash, ...user } = authenticatedUsers[0];
    return res.json({ status: 'success', user, nexus_id: user.nexus_id });
  } catch (error) {
    console.error('Authentication lookup failed:', error);
    return res.status(500).json({ status: 'error', error: 'Unable to complete login right now.' });
  }
});

export default router;
