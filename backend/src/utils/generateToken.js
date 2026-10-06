import jwt from 'jsonwebtoken';

/**
 * Generate a signed JWT token
 * @param {string} id - User MongoDB ObjectId
 * @param {string} role - User role (student, admin)
 * @returns {string} Signed JWT
 */
export const generateToken = (id, role) => {
  const secret = process.env.JWT_SECRET || 'fallback_development_jwt_secret_askcampusai';
  const expiresIn = process.env.JWT_EXPIRES_IN || '30d';
  return jwt.sign({ id, role }, secret, {
    expiresIn,
  });
};

export default generateToken;
