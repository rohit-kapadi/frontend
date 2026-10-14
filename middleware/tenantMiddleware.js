// middleware/tenantMiddleware.js
const verifyTenantScope = (req, res, next) => {
  // Assuming tenant nexus_id is passed via headers or decoded JWT token
  const nexusId = req.headers['x-nexus-id'];

  if (!nexusId) {
    return res.status(400).json({ error: 'Tenant Nexus ID (x-nexus-id) header is missing.' });
  }

  // Attach nexusId to request object for route controllers to use
  req.nexusId = nexusId;
  next();
};

const verifyUserRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.headers['x-user-role']; // e.g., 'nexus_admin', 'admin', 'creator', 'doctor'
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { verifyTenantScope, verifyUserRole };