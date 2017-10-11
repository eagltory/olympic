'use strict';

var url = require('url');

var Olympic5 = require('./Olympic5Service');

module.exports.supercontent_vProgramIdContentIdCornerIdGET = function supercontent_vProgramIdContentIdCornerIdGET (req, res, next) {
  Olympic5.supercontent_vProgramIdContentIdCornerIdGET(req.swagger.params, res, next);
};
