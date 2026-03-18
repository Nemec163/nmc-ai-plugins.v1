'use strict';

const { getControlPlaneAudits } = require('./audits');

module.exports = {
  audit: getControlPlaneAudits,
  audits: getControlPlaneAudits,
  getControlPlaneAudit: getControlPlaneAudits,
  getControlPlaneAudits,
  get_control_plane_audit: getControlPlaneAudits,
  get_control_plane_audits: getControlPlaneAudits,
};
