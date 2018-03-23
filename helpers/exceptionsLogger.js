'use strict';

var Logger = require ('../logger');

var logger = new Logger({ echo: 'info', errorLevel: 'info',
	filename: 'logs/exceptions.log' });

module.exports = logger;
